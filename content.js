/**
 * =============================================================================
 * Zap Negócios — content.js
 * =============================================================================
 * Extensão Chrome para Travel Flow CRM e WhatsApp Web.
 *
 * Injeta um painel lateral na página de atendimento que permite ao operador
 * criar, visualizar, editar e excluir múltiplos negócios vinculados a um lead,
 * usando conversationId, telefone do lead e origem da conversa como vínculos.
 *
 * O campo Nome do Lead é preenchido automaticamente a partir do DOM do CRM
 * ou do cabeçalho da conversa no WhatsApp Web.
 *
 * API_BASE, API_KEY e a sessão do usuário são carregados do storage,
 * configurados pelo usuário na página de Opções da extensão.
 *
 * O papel do usuário logado controla permissões: viewer, editor, admin ou owner.
 *
 * Os dados são persistidos em banco MySQL via API PHP hospedada no servidor
 * do operador. A extensão detecta automaticamente trocas de atendimento e
 * recarrega os negócios correspondentes sem recarregar a página.
 *
 * Correções aplicadas (v0.4.1):
 *   - getElementById com template literals corrigidas em clearForm, fillForm e getFormData
 *   - querySelector com template literals corrigidas no sistema de abas
 *
 * Novidades (v0.4.5):
 *   - updatePanelTitle(): título h2 do painel atualiza com o nome do lead
 *     ao trocar de conversa, com retentativas para aguardar o DOM do SPA
 *   - page-bridge.js captura o nome do lead assincronamente e inclui
 *     no evento tfq:conversation-change (detail.leadName), permitindo
 *     atualização imediata do título antes do loadNegocios terminar
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Zap Negócios
 * =============================================================================
 */
(function () {

  const PANEL_ID           = 'tfq-panel';
  const TOGGLE_ID          = 'tfq-toggle';
  const LEAD_NAME_SELECTOR = 'h3.font-semibold:not(.truncate)';
  const TRAVEL_FLOW_HOST   = 'travelflow.tur.br';
  const WHATSAPP_HOST      = 'web.whatsapp.com';

  let API_BASE  = '';
  let API_KEY   = '';
  let AUTH_TOKEN = '';
  let CURRENT_USER = null;

  function loadUserConfig() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get(['tfq_api_base', 'tfq_api_key'], syncResult => {
          chrome.storage.local.get(['tfq_auth_token', 'tfq_user'], localResult => {
            API_BASE    = (syncResult.tfq_api_base || '').trim().replace(/\/$/, '');
            API_KEY     = (syncResult.tfq_api_key || '').trim();
            AUTH_TOKEN  = (localResult.tfq_auth_token || '').trim();
            CURRENT_USER = localResult.tfq_user || null;
            resolve();
          });
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function isConfigured() {
    return API_BASE !== '' && API_KEY !== '' && AUTH_TOKEN !== '';
  }

  function roleLevel(role) {
    return { viewer: 10, editor: 20, admin: 30, owner: 40 }[role] || 0;
  }

  function hasRole(minRole) {
    return CURRENT_USER && roleLevel(CURRENT_USER.role) >= roleLevel(minRole);
  }

  function canEdit() {
    return hasRole('editor');
  }

  function isAdmin() {
    return hasRole('admin');
  }

  function canManageUsers() {
    return hasRole('admin');
  }

  function canCreateOwner() {
    return hasRole('owner');
  }

  function apiHeaders(extra = {}) {
    const headers = { 'X-Api-Key': API_KEY, ...extra };
    if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
    return headers;
  }

  function adminHeaders(extra = {}) {
    return apiHeaders(extra);
  }

  function adminApiHeaders(extra = {}) {
    return apiHeaders(extra);
  }

  async function fetchJson(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        ...options,
        signal: controller.signal
      });
      const text = await response.text();
      let result = {};

      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          throw new Error(
            response.ok
              ? 'Resposta inválida do servidor. Verifique se a URL aponta para os arquivos PHP corretos.'
              : `Servidor retornou HTTP ${response.status} com resposta inválida.`
          );
        }
      }

      if (!response.ok) {
        throw new Error(result.message || `Servidor retornou HTTP ${response.status}.`);
      }

      if (result.success === false) {
        throw new Error(result.message || 'A operação não foi concluída pelo servidor.');
      }

      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Tempo de conexão esgotado. Verifique o servidor e tente novamente.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const defaultFields = [
    { key: 'nome_lead',        label: 'Nome do Lead',               type: 'text',     auto: true },
    { key: 'lead_phone',       label: 'Telefone do Lead',           type: 'text',     auto: true },
    { key: 'email',            label: 'Email',                      type: 'text' },
    { key: 'destino',          label: 'Destino',                    type: 'text' },
    {
      key: 'status_negocio',
      label: 'Status do Negócio',
      type: 'select',
      options: ['', 'Novo', 'Em atendimento', 'Cotação enviada', 'Aguardando retorno', 'Fechado', 'Perdido']
    },
    {
      key: 'temperatura_lead',
      label: 'Temperatura do Lead',
      type: 'select',
      options: ['', 'Frio', 'Morno', 'Quente']
    },
    { key: 'proximo_contato',  label: 'Próximo Contato',            type: 'date' },
    { key: 'valor_estimado',   label: 'Valor Estimado',             type: 'currency' },
    { key: 'responsavel',      label: 'Responsável',                type: 'text' },
    { key: 'data_viagem',      label: 'Data da Viagem',             type: 'text' },
    { key: 'duracao_viagem',   label: 'Duração da Viagem',          type: 'text' },
    { key: 'numero_viajantes', label: 'Nº de Viajantes',            type: 'number' },
    { key: 'idade_viajantes',  label: 'Idade dos Viajantes',        type: 'text' },
    { key: 'cidade_origem',    label: 'Cidade de Origem',           type: 'text' },
    { key: 'orcamento',        label: 'Orçamento',                  type: 'currency' },
    {
      key: 'tipo_compra',
      label: 'Tipo de Compra',
      type: 'select',
      options: ['', 'Pacote completo', 'Aéreo + Hotel', 'Só hotel', 'Só aéreo', 'Cruzeiro', 'Seguro', 'Outro']
    },
    {
      key: 'prioridade_valor',
      label: 'Prioridade de Valor',
      type: 'select',
      options: ['', 'Preço', 'Custo-Benefício', 'Conforto', 'Experiências', 'Luxo']
    },
    {
      key: 'quando_reservar',
      label: 'Quando Pretende Reservar',
      type: 'select',
      options: ['', 'Hoje', 'Esta semana', 'Este mês', 'Em 30 dias', 'Só pesquisando']
    },
    { key: 'observacoes', label: 'Observações', type: 'textarea' }
  ];

  let fields = [...defaultFields];

  let currentConversationId     = '';
  let panelInitialized          = false;
  let syncScheduled             = false;
  let negociosCache             = [];
  let tasksCache                = [];
  let editingId                 = 0;
  let editingTaskId             = 0;
  let lastFormSignature         = '';
  let visibilityCheckInterval   = null;
  let lastCheckedConversationId = '';
  let observerDebounceTimer     = null;

  function getPlatform() {
    const host = window.location.hostname;
    const pathname = window.location.pathname;

    if (host === TRAVEL_FLOW_HOST && (pathname.includes('/atendimento-web') || pathname === '/atendimento-web')) {
      return 'travel_flow';
    }
    if (host === WHATSAPP_HOST) {
      return 'whatsapp_web';
    }

    return '';
  }

  function normalizePhone(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function simpleHash(value) {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function getTravelFlowConversationId() {
    return new URL(window.location.href).searchParams.get('conversationId') || '';
  }

  function cleanDomText(value) {
    return String(value || '')
      .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisibleElement(element) {
    if (!element || !element.getClientRects || element.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function stripWhatsAppStatus(text) {
    return cleanDomText(text)
      .replace(/\s+visto por último.*$/i, '')
      .replace(/\s+online$/i, '')
      .replace(/\s+digitando\.{0,3}$/i, '')
      .trim();
  }

  function isGenericWhatsAppText(text) {
    const value = stripWhatsAppStatus(text);
    const lower = value.toLowerCase();

    if (!lower || lower.length < 2 || lower.length > 80) return true;
    if (/^visto por último/i.test(lower)) return true;
    if (/^(online|digitando|dados do perfil|dados do contato|perfil|recado|mídia|links|docs)$/i.test(lower)) return true;
    if (/^(pesquisar|mais opções|menu|voltar|fechar|conversas|chamadas|status)$/i.test(lower)) return true;
    if (/^clique para/i.test(lower)) return true;

    return false;
  }

  function getWhatsAppHeaderText() {
    const header = document.querySelector('#main header');
    if (!header) return '';

    const candidates = [];
    const seen = new Set();
    const addCandidate = (value, score) => {
      const cleaned = stripWhatsAppStatus(value);
      if (isGenericWhatsAppText(cleaned) || seen.has(cleaned)) return;
      seen.add(cleaned);
      candidates.push({ value: cleaned, score });
    };

    header.querySelectorAll('[data-testid*="chat-title"], [data-testid*="conversation-info-header-chat-title"]').forEach(el => {
      if (isVisibleElement(el)) addCandidate(el.textContent, 120);
    });

    header.querySelectorAll('span[title]').forEach(el => {
      if (isVisibleElement(el)) addCandidate(el.getAttribute('title') || el.textContent, 110);
    });

    header.querySelectorAll('div[title]').forEach(el => {
      if (isVisibleElement(el)) addCandidate(el.getAttribute('title') || el.textContent, 70);
    });

    header.querySelectorAll('span[dir="auto"], div[dir="auto"]').forEach(el => {
      if (isVisibleElement(el)) addCandidate(el.textContent, 60);
    });

    candidates.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
    return candidates.length ? candidates[0].value : '';
  }

  function isPlausibleLeadPhone(phone) {
    const digits = normalizePhone(phone);
    return digits.length >= 10 && digits.length <= 15;
  }

  function extractPhoneFromText(text) {
    const match = String(text || '').match(/(?:\+?\d[\d\s().-]{7,}\d)/);
    if (!match) return '';

    const phone = normalizePhone(match[0]);
    return isPlausibleLeadPhone(phone) ? phone : '';
  }

  function extractPhoneFromHref(href) {
    try {
      return extractPhoneFromText(decodeURIComponent(String(href || '')));
    } catch {
      return extractPhoneFromText(href);
    }
  }

  function getTravelFlowLeadPhoneFromDom() {
    const leadNameEl = document.querySelector(LEAD_NAME_SELECTOR);
    let parent = leadNameEl;
    let depth = 0;
    while (parent && depth < 6) {
      const text = cleanDomText(parent.textContent);
      if (text.length <= 800) {
        const phone = extractPhoneFromText(text);
        if (phone) return phone;
      }
      parent = parent.parentElement;
      depth++;
    }

    const phoneLinks = document.querySelectorAll(
      'a[href^="tel:"], a[href*="wa.me/"], a[href*="api.whatsapp.com"], a[href*="web.whatsapp.com/send"]'
    );

    for (const link of phoneLinks) {
      const phone = extractPhoneFromHref(link.getAttribute('href'));
      if (phone) return phone;
    }

    const controls = document.querySelectorAll('input, textarea');
    for (const control of controls) {
      const hint = [
        control.name,
        control.id,
        control.placeholder,
        control.getAttribute('aria-label')
      ].join(' ');
      if (!/telefone|celular|whats|phone|tel/i.test(hint)) continue;

      const phone = extractPhoneFromText(control.value);
      if (phone) return phone;
    }

    const labeledElements = document.querySelectorAll('label, span, p, div');
    let checked = 0;
    for (const element of labeledElements) {
      const text = (element.textContent || '').trim();
      if (text.length > 300 || !/telefone|celular|whats|phone|tel/i.test(text)) continue;

      const container = element.closest('div') || element.parentElement || element;
      const containerText = (container.textContent || '').trim();
      const phone = extractPhoneFromText(containerText.length <= 600 ? containerText : text);
      if (phone) return phone;

      checked++;
      if (checked >= 40) break;
    }

    return '';
  }

  function getLeadPhoneFromDom() {
    const platform = getPlatform();

    if (platform === 'whatsapp_web') {
      const headerText = getWhatsAppHeaderText();
      const headerPhone = extractPhoneFromText(headerText);
      if (headerPhone) return headerPhone;
      return '';
    }

    if (platform === 'travel_flow') {
      return getTravelFlowLeadPhoneFromDom();
    }

    return '';
  }

  function getLeadNameFromDom() {
    const platform = getPlatform();

    if (platform === 'whatsapp_web') {
      const text = getWhatsAppHeaderText();
      return text;
    }

    const el = document.querySelector(LEAD_NAME_SELECTOR);
    return el ? el.textContent.trim() : '';
  }

  function getCurrentContext() {
    const platform = getPlatform();
    const leadName = getLeadNameFromDom();
    const leadPhone = getLeadPhoneFromDom();

    if (platform === 'travel_flow') {
      const conversationId = getTravelFlowConversationId();
      return {
        platform,
        conversationId,
        sourceConversationId: conversationId,
        leadName,
        leadPhone,
        isValid: conversationId !== ''
      };
    }

    if (platform === 'whatsapp_web') {
      const sourceConversationId = leadPhone || (leadName ? `name_${simpleHash(leadName)}` : '');
      return {
        platform,
        conversationId: '',
        sourceConversationId,
        leadName,
        leadPhone,
        isValid: sourceConversationId !== ''
      };
    }

    return {
      platform: '',
      conversationId: '',
      sourceConversationId: '',
      leadName: '',
      leadPhone: '',
      isValid: false
    };
  }

  function getContextKey(context = getCurrentContext()) {
    if (context.platform === 'travel_flow' && context.conversationId) {
      return `travel_flow:${context.conversationId}`;
    }
    if (context.leadPhone) return `${context.platform}:phone:${context.leadPhone}`;
    if (context.sourceConversationId) return `${context.platform}:source:${context.sourceConversationId}`;
    return '';
  }

  function hasValidConversation() {
    return getCurrentContext().isValid;
  }

  function getPanel()                  { return document.getElementById(PANEL_ID); }
  function getToggle()                 { return document.getElementById(TOGGLE_ID); }
  function getConversationIdDisplay()  { return document.getElementById('tfq-conversation-id'); }
  function getStatus()                 { return document.getElementById('tfq-status'); }
  function getNegociosDropdown()       { return document.getElementById('tfq-negocios-dropdown'); }
  function getFormTitle()              { return document.getElementById('tfq-form-title'); }
  function getEditingBadge()           { return document.getElementById('tfq-editing-badge'); }

  function setStatus(message, type) {
    const el = getStatus();
    if (!el) return;
    el.textContent = message || '';
    el.className   = type ? type : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#039;');
  }

  function createField(field) {
    const fieldKey = escapeHtml(field.key);
    const fieldLabel = escapeHtml(field.label || field.key);
    const autoHint = field.auto
      ? '<span class="tfq-auto-hint" title="Preenchido automaticamente">⚡</span>'
      : '';

    if (field.type === 'select') {
      const options = Array.isArray(field.options) ? field.options : [''];
      return `
        <div class="tfq-row">
          <label class="tfq-label" for="tfq-${fieldKey}">${fieldLabel}${autoHint}</label>
          <select class="tfq-select" id="tfq-${fieldKey}">
            ${options.map(option =>
              `<option value="${escapeHtml(option)}">${escapeHtml(option || 'Selecione')}</option>`
            ).join('')}
          </select>
        </div>
      `;
    }

    if (field.type === 'textarea') {
      return `
        <div class="tfq-row">
          <label class="tfq-label" for="tfq-${fieldKey}">${fieldLabel}${autoHint}</label>
          <textarea class="tfq-textarea" id="tfq-${fieldKey}" rows="4"></textarea>
        </div>
      `;
    }

    const inputType = field.type === 'date'
      ? 'date'
      : field.type === 'number'
        ? 'number'
        : 'text';
    const inputMode = field.type === 'currency' ? ' inputmode="decimal"' : '';
    const placeholder = field.type === 'currency' ? ' placeholder="R$ 0,00"' : '';

    return `
      <div class="tfq-row">
        <label class="tfq-label" for="tfq-${fieldKey}">${fieldLabel}${autoHint}</label>
        <input class="tfq-input" id="tfq-${fieldKey}" type="${inputType}"${inputMode}${placeholder} />
      </div>
    `;
  }

  async function loadFormFields() {
    if (!isConfigured()) {
      fields = [...defaultFields];
      return;
    }

    try {
      const result = await fetchJson(`${API_BASE}/get_form_fields.php?_t=${Date.now()}`, {
        headers: apiHeaders()
      });

      if (!result.success || !Array.isArray(result.fields) || result.fields.length === 0) {
        throw new Error(result.message || 'Erro ao buscar campos do formulário.');
      }

      fields = result.fields;
    } catch (error) {
      fields = [...defaultFields];
    }
  }

  function renderFormFields() {
    const grid = document.querySelector(`#${PANEL_ID} .tfq-grid`);
    if (!grid) return;
    grid.innerHTML = fields.map(createField).join('');
    autoFillLeadName();
    autoFillLeadPhone();
  }

  function applyFieldOrderToForm(orderedFieldNames) {
    const currentData = getFormData();
    const ordered = [];

    orderedFieldNames.forEach(name => {
      const field = fields.find(item => item.key === name);
      if (field) ordered.push(field);
    });

    fields.forEach(field => {
      if (!ordered.find(item => item.key === field.key)) ordered.push(field);
    });

    fields = ordered;
    renderFormFields();
    fillForm(currentData);
  }

  // ✅ CORRIGIDO: getElementById com template literal correta
  function clearForm() {
    fields.forEach(field => {
      const el = document.getElementById(`tfq-${field.key}`);
      if (el) el.value = '';
    });
    autoFillLeadName();
    autoFillLeadPhone();
  }

  function autoFillLeadName() {
    const el = document.getElementById('tfq-nome_lead');
    if (el && el.value === '') {
      const name = getLeadNameFromDom();
      if (name) el.value = name;
    }
  }

  function autoFillLeadPhone() {
    const el = document.getElementById('tfq-lead_phone');
    if (el && el.value === '') {
      const phone = getLeadPhoneFromDom();
      if (phone) el.value = phone;
    }
  }

  function getFormLeadPhoneValue() {
    const el = document.getElementById('tfq-lead_phone');
    return normalizePhone(el ? el.value : '');
  }

  function getLeadContextPayload() {
    const context = getCurrentContext();
    const leadPhone = context.leadPhone || getFormLeadPhoneValue();

    return {
      conversation_id:        context.conversationId,
      source_platform:        context.platform,
      source_conversation_id: context.sourceConversationId,
      lead_name:              context.leadName || getLeadNameFromDom(),
      lead_phone:             leadPhone
    };
  }

  function appendLeadContextParams(params, context = getCurrentContext()) {
    const lookupPhone = context.leadPhone || getFormLeadPhoneValue();

    params.set('source_platform', context.platform);
    if (context.conversationId) params.set('conversation_id', context.conversationId);
    if (lookupPhone) params.set('lead_phone', lookupPhone);
    if (context.sourceConversationId) params.set('source_conversation_id', context.sourceConversationId);
    if (context.platform === 'whatsapp_web' && !lookupPhone && context.leadName) {
      params.set('lead_name', context.leadName);
    }
  }

  // ✅ CORRIGIDO: getElementById com template literal correta
  function fillForm(data) {
    clearForm();
    if (!data) return;
    fields.forEach(field => {
      const el = document.getElementById(`tfq-${field.key}`);
      if (el && data[field.key] != null) {
        el.value = data[field.key];
      }
    });
    autoFillLeadName();
    autoFillLeadPhone();
  }

  // ✅ CORRIGIDO: getElementById com template literal correta
  function getFormData() {
    const context = getCurrentContext();
    const data = {
      id:                     editingId || 0,
      conversation_id:        context.conversationId,
      source_platform:        context.platform,
      source_conversation_id: context.sourceConversationId
    };
    fields.forEach(field => {
      const el = document.getElementById(`tfq-${field.key}`);
      data[field.key] = el ? el.value.trim() : '';
    });
    if (!data.lead_phone && context.leadPhone) {
      data.lead_phone = context.leadPhone;
    }
    if (!data.nome_lead && context.leadName) {
      data.nome_lead = context.leadName;
    }
    return data;
  }

  function getFormSignature() {
    const data = {};
    fields.forEach(field => {
      const el = document.getElementById(`tfq-${field.key}`);
      data[field.key] = el ? el.value.trim() : '';
    });
    return JSON.stringify(data);
  }

  function markFormPristine() {
    lastFormSignature = getFormSignature();
  }

  function hasUnsavedChanges() {
    const panel = getPanel();
    if (!panel || !panel.classList.contains('tfq-open') || !lastFormSignature) return false;
    return getFormSignature() !== lastFormSignature;
  }

  function confirmDiscardChanges(message = 'Há alterações não salvas neste negócio. Deseja descartá-las?') {
    return !hasUnsavedChanges() || window.confirm(message);
  }

  function setEditingState(id, item) {
    editingId = id || 0;
    const deleteBtn = document.getElementById('tfq-delete');
    const canDelete = isAdmin();

    if (editingId > 0 && item) {
      fillForm(item);
      if (getFormTitle())    getFormTitle().textContent    = 'Editando negócio';
      if (getEditingBadge()) getEditingBadge().textContent = `ID #${editingId}`;
      if (deleteBtn) {
        deleteBtn.disabled = !canDelete;
        deleteBtn.title = canDelete ? 'Excluir negócio' : 'Somente administradores podem excluir negócios';
      }
    } else {
      clearForm();
      if (getFormTitle())    getFormTitle().textContent    = 'Novo negócio';
      if (getEditingBadge()) getEditingBadge().textContent = '';
      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.title = canDelete ? 'Selecione um negócio para excluir' : 'Somente administradores podem excluir negócios';
      }
    }
    markFormPristine();
  }

  function updateConversationIdUI() {
    const el = getConversationIdDisplay();
    if (!el) return;

    const context = getCurrentContext();
    if (!context.isValid) {
      el.textContent = 'Não encontrado';
      return;
    }

    const platformLabel = context.platform === 'whatsapp_web' ? 'WhatsApp Web' : 'Travel Flow';
    const identifier = context.leadPhone || context.conversationId || context.sourceConversationId;
    el.textContent = `${platformLabel}: ${identifier}`;
  }

  /**
   * Atualiza o título h2 do painel com o nome do lead lido do DOM.
   *
   * O Travel Flow é um SPA e pode demorar alguns ms para atualizar o elemento
   * h3.font-semibold:not(.truncate) após a troca de conversa. Por isso, tenta ler o nome
   * em até 5 tentativas com intervalos crescentes (100ms, 300ms, 600ms, 1000ms, 1500ms)
   * antes de desistir e exibir o texto genérico.
   *
   * @param {string} [knownName] - Nome já conhecido (vindo do page-bridge.js).
   *                               Se fornecido, atualiza imediatamente sem retentativas.
   */
  function updatePanelTitle(knownName) {
    const titleEl = document.getElementById('tfq-title');
    if (!titleEl) return;

    // Se o nome já foi capturado pelo page-bridge, usa diretamente
    if (knownName) {
      titleEl.textContent = knownName;
      return;
    }

    // Tenta ler do DOM com retentativas para aguardar o SPA atualizar
    const delays = [0, 100, 300, 600, 1000, 1500];
    let attempt  = 0;

    function tryUpdate() {
      const name = getLeadNameFromDom();

      if (name) {
        titleEl.textContent = name;
        return;
      }

      attempt++;
      if (attempt < delays.length) {
        setTimeout(tryUpdate, delays[attempt]);
      } else {
        // Todas as tentativas falharam — mantém genérico
        titleEl.textContent = 'Negócios do Lead';
      }
    }

    tryUpdate();
  }

  function renderNegociosDropdown() {
    const dropdown = getNegociosDropdown();
    if (!dropdown) return;

    const options = ['<option value="">-- Novo negócio --</option>'];
    negociosCache.forEach(item => {
      const label = `#${item.id} - ${item.destino || item.nome_lead || 'Sem destino'}`;
      options.push(`<option value="${item.id}">${escapeHtml(label)}</option>`);
    });
    dropdown.innerHTML = options.join('');
    dropdown.value = editingId > 0 ? editingId : '';
  }

  function onNegocioSelected() {
    const dropdown = getNegociosDropdown();
    if (!dropdown) return;

    if (!confirmDiscardChanges('Há alterações não salvas. Deseja trocar de negócio e descartá-las?')) {
      dropdown.value = editingId > 0 ? String(editingId) : '';
      return;
    }

    const selectedId = Number(dropdown.value);
    if (selectedId > 0) {
      const item = negociosCache.find(n => Number(n.id) === selectedId);
      if (item) {
        setEditingState(selectedId, item);
        setStatus('Negócio selecionado para edição.', '');
      }
    } else {
      setEditingState(0);
      setStatus('Pronto para criar um novo negócio.', '');
    }
  }

  async function fetchNegociosForContext(context) {
    const params = new URLSearchParams({
      _t: Date.now().toString()
    });
    appendLeadContextParams(params, context);

    const result = await fetchJson(
      `${API_BASE}/get_negocios.php?${params.toString()}`,
      { headers: apiHeaders() }
    );

    if (!result.success) {
      throw new Error(result.message || 'Erro ao buscar negócios.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  async function syncLeadIdentityForNegocios(context, items) {
    if (!canEdit() || context.platform !== 'travel_flow' || !context.leadPhone || !Array.isArray(items)) {
      return { updated: 0, error: '' };
    }

    const missingPhone = items.some(item => normalizePhone(item.lead_phone) === '');
    if (!missingPhone) {
      return { updated: 0, error: '' };
    }

    try {
      const result = await fetchJson(`${API_BASE}/sync_lead_identity.php`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(getLeadContextPayload())
      });

      return {
        updated: Number(result.updated || 0),
        error: ''
      };
    } catch (error) {
      return {
        updated: 0,
        error: `Telefone detectado, mas não consegui sincronizar automaticamente: ${error.message}`
      };
    }
  }

  /**
   * Busca todos os negócios do contexto atual na API e atualiza o cache.
   *
   * @param {boolean} force      - Se true, ignora cache e recarrega do servidor.
   * @param {boolean} autoSelect - Se true, seleciona automaticamente o negócio
   *                               de maior ID ao terminar de carregar.
   *                               Deve ser true apenas em trocas de conversa,
   *                               não em recarregamentos manuais ou pós-salvar.
   */
  async function loadNegocios(force = false, autoSelect = false) {
    const context = getCurrentContext();
    const contextKey = getContextKey(context);
    updateConversationIdUI();
    updatePanelTitle();

    if (!context.isValid) {
      currentConversationId = '';
      negociosCache         = [];
      renderNegociosDropdown();
      setEditingState(0);
      setStatus('Aguardando seleção de conversa...', '');
      return;
    }

    if (!force && contextKey === currentConversationId && negociosCache.length) {
      renderNegociosDropdown();
      return;
    }

    currentConversationId = contextKey;
    setStatus('Carregando negócios...', '');

    try {
      negociosCache = await fetchNegociosForContext(context);
      const syncResult = await syncLeadIdentityForNegocios(context, negociosCache);
      if (syncResult.updated > 0) {
        negociosCache = await fetchNegociosForContext(context);
      }

      renderNegociosDropdown();
      renderTaskNegocioOptions();

      if (editingId > 0) {
        // Mantém o negócio em edição se ainda existir no cache (ex: após salvar)
        const active = negociosCache.find(item => Number(item.id) === editingId);
        if (active) {
          fillForm(active);
          markFormPristine();
        } else {
          setEditingState(0);
        }
      } else if (autoSelect && negociosCache.length > 0) {
        // Troca de conversa: seleciona automaticamente o negócio de maior ID.
        // negociosCache já vem ordenado por id DESC (mais recente primeiro).
        const latest   = negociosCache[0];
        const latestId = Number(latest.id);
        setEditingState(latestId, latest);
        const dropdown = getNegociosDropdown();
        if (dropdown) dropdown.value = latestId;
      } else {
        // Recarregamento manual, pós-salvar sem ID ou sem negócios: formulário limpo
        clearForm();
        markFormPristine();
      }

      const count = negociosCache.length;
      if (syncResult.error) {
        setStatus(syncResult.error, 'error');
      } else {
        const syncSuffix = syncResult.updated > 0 ? ` Telefone sincronizado em ${syncResult.updated} negócio(s).` : '';
        setStatus(
          count > 0 ? `${count} negócio(s) encontrado(s).${syncSuffix}` : 'Nenhum negócio salvo ainda.',
          'success'
        );
      }

    } catch (error) {
      negociosCache = [];
      renderNegociosDropdown();
      setStatus(`Erro ao carregar: ${error.message}`, 'error');
    }
  }

  async function saveNegocio() {
    const payload = getFormData();

    if (!canEdit()) {
      setStatus('Seu usuário não tem permissão para salvar negócios.', 'error');
      return;
    }
    if (!getCurrentContext().isValid) {
      setStatus('Selecione uma conversa primeiro.', 'error');
      return;
    }
    if (!payload.nome_lead) {
      setStatus('Preencha o nome do lead.', 'error');
      return;
    }

    const saveBtn = document.getElementById('tfq-save');
    if (saveBtn) saveBtn.disabled = true;

    try {
      setStatus(editingId > 0 ? 'Atualizando negócio...' : 'Salvando negócio...', '');

      const result = await fetchJson(`${API_BASE}/save_negocio.php`, {
        method:  'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify(payload)
      });

      if (!result.success) {
        throw new Error(result.message || 'Erro ao salvar negócio.');
      }

      const savedId = Number(result.id || payload.id || 0);

      negociosCache         = [];
      currentConversationId = '';

      await new Promise(resolve => setTimeout(resolve, 100));
      await loadNegocios(true);

      if (savedId > 0) {
        const active = negociosCache.find(item => Number(item.id) === savedId);
        if (active) {
          setEditingState(savedId, active);
        } else {
          setEditingState(0);
        }
      }
      markFormPristine();

      setStatus(result.message || 'Negócio salvo com sucesso.', 'success');

    } catch (error) {
      setStatus(`Erro ao salvar: ${error.message}`, 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function deleteNegocio() {
    const context = getCurrentContext();
    const leadPhone = context.leadPhone || getFormLeadPhoneValue();
    if (!isAdmin()) {
      setStatus('Somente administradores podem excluir negócios.', 'error');
      return;
    }
    if (!editingId || !context.isValid) {
      setStatus('Selecione um negócio para excluir.', 'error');
      return;
    }

    const ok = window.confirm('Deseja excluir este negócio?');
    if (!ok) return;

    try {
      setStatus('Excluindo negócio...', '');

      const result = await fetchJson(`${API_BASE}/delete_negocio.php`, {
        method:  'POST',
        headers: adminApiHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify({
          id:                     editingId,
          conversation_id:        context.conversationId,
          lead_phone:             leadPhone,
          source_platform:        context.platform,
          source_conversation_id: context.sourceConversationId
        })
      });

      if (!result.success) {
        throw new Error(result.message || 'Erro ao excluir negócio.');
      }

      setEditingState(0);
      negociosCache         = [];
      currentConversationId = '';

      await new Promise(resolve => setTimeout(resolve, 100));
      await loadNegocios(true);

      setStatus(result.message || 'Negócio excluído com sucesso.', 'success');

    } catch (error) {
      setStatus(`Erro ao excluir: ${error.message}`, 'error');
    }
  }

  function removePanel() {
    const panel  = getPanel();
    const toggle = getToggle();
    if (panel)  panel.remove();
    if (toggle) toggle.remove();

    panelInitialized      = false;
    currentConversationId = '';
    negociosCache         = [];
    tasksCache            = [];
    editingId             = 0;
    editingTaskId         = 0;
    lastFormSignature     = '';
  }

  async function loadFields() {
    const statusEl = document.getElementById('tfq-fields-status');
    if (statusEl) { statusEl.textContent = 'Carregando campos...'; statusEl.className = ''; }

    try {
      const result = await fetchJson(`${API_BASE}/get_fields.php?_t=${Date.now()}`, {
        headers: adminHeaders()
      });

      const dbFields = Array.isArray(result.fields) ? result.fields : [];
      await renderFieldsList(dbFields);
      if (statusEl) { statusEl.textContent = `${dbFields.length} campo(s) encontrado(s).`; statusEl.className = 'success'; }

    } catch (error) {
      if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
    }
  }

  function fieldOptionsToText(options) {
    return Array.isArray(options) ? options.filter(option => option !== '').join('\n') : '';
  }

  function collectFieldConfigsFromList(container, orderedFields) {
    return orderedFields.map(field => {
      const name = field.name;
      const labelInput = container.querySelector(`.tfq-field-label-input[data-name="${name}"]`);
      const typeSelect = container.querySelector(`.tfq-field-type-select[data-name="${name}"]`);
      const optionsInput = container.querySelector(`.tfq-field-options-input[data-name="${name}"]`);
      const type = typeSelect ? typeSelect.value : field.type || 'text';
      const options = optionsInput
        ? optionsInput.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
        : [];

      if (type === 'select') {
        options.unshift('');
      }

      return {
        name,
        label: labelInput ? labelInput.value.trim() : field.label || name,
        type,
        options: type === 'select' ? options : []
      };
    });
  }

  async function saveFieldConfigs(configs) {
    const result = await fetchJson(`${API_BASE}/save_field_config.php`, {
      method:  'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify({ fields: configs })
    });
    return result;
  }

  async function renderFieldsList(fieldsList) {
    const container = document.getElementById('tfq-fields-list');
    if (!container) return;

    if (fieldsList.length === 0) {
      container.innerHTML = '<div class="tfq-empty">Nenhum campo encontrado.</div>';
      return;
    }

    container.innerHTML = fieldsList.map((field, index) => {
      const label     = field.label || field.name;
      const isFirst   = index === 0;
      const isLast    = index === fieldsList.length - 1;
      const removable = field.removable;
      const type      = field.type || 'text';
      const optionsText = fieldOptionsToText(field.options);

      return `
        <div class="tfq-field-item" data-name="${escapeHtml(field.name)}" data-index="${index}">
          <div class="tfq-field-item-left">
            <div class="tfq-field-order-btns">
              <button class="tfq-mini-btn tfq-field-up"   data-index="${index}" ${isFirst ? 'disabled' : ''} title="Mover para cima">↑</button>
              <button class="tfq-mini-btn tfq-field-down" data-index="${index}" ${isLast  ? 'disabled' : ''} title="Mover para baixo">↓</button>
            </div>
            <div class="tfq-field-info">
              <input class="tfq-field-label-input" data-name="${escapeHtml(field.name)}" value="${escapeHtml(label)}" type="text" placeholder="Rótulo do campo" />
              <span class="tfq-field-key">${escapeHtml(field.name)}${field.is_default ? ' <em>padrão</em>' : ''}</span>
              <select class="tfq-field-type-select" data-name="${escapeHtml(field.name)}">
                <option value="text" ${type === 'text' ? 'selected' : ''}>Texto</option>
                <option value="textarea" ${type === 'textarea' ? 'selected' : ''}>Texto longo</option>
                <option value="select" ${type === 'select' ? 'selected' : ''}>Lista</option>
                <option value="date" ${type === 'date' ? 'selected' : ''}>Data</option>
                <option value="number" ${type === 'number' ? 'selected' : ''}>Número</option>
                <option value="currency" ${type === 'currency' ? 'selected' : ''}>Valor</option>
              </select>
              <textarea class="tfq-field-options-input ${type === 'select' ? '' : 'tfq-hidden'}" data-name="${escapeHtml(field.name)}" rows="3" placeholder="Uma opção por linha">${escapeHtml(optionsText)}</textarea>
            </div>
          </div>
          <div class="tfq-item-actions">
            <button class="tfq-mini-btn tfq-field-save-config" data-name="${escapeHtml(field.name)}" title="Salvar configuração">✓</button>
            ${removable
              ? `<button class="tfq-mini-btn tfq-mini-btn-danger tfq-field-remove" data-name="${escapeHtml(field.name)}" title="Remover campo">✕</button>`
              : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.tfq-field-up').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.index);
        if (idx <= 0) return;
        const reordered = [...fieldsList];
        [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
        await persistFieldConfig(container, reordered);
        await renderFieldsList(reordered);
        applyFieldOrderToForm(reordered.map(field => field.name));
      });
    });

    container.querySelectorAll('.tfq-field-down').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.index);
        if (idx >= fieldsList.length - 1) return;
        const reordered = [...fieldsList];
        [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
        await persistFieldConfig(container, reordered);
        await renderFieldsList(reordered);
        applyFieldOrderToForm(reordered.map(field => field.name));
      });
    });

    container.querySelectorAll('.tfq-field-type-select').forEach(select => {
      select.addEventListener('change', () => {
        const optionsInput = container.querySelector(`.tfq-field-options-input[data-name="${select.dataset.name}"]`);
        if (!optionsInput) return;
        optionsInput.classList.toggle('tfq-hidden', select.value !== 'select');
      });
    });

    container.querySelectorAll('.tfq-field-save-config').forEach(btn => {
      btn.addEventListener('click', async () => {
        const statusEl = document.getElementById('tfq-fields-status');
        try {
          if (statusEl) { statusEl.textContent = 'Salvando configuração...'; statusEl.className = ''; }
          const currentData = getFormData();
          const wasDirty = hasUnsavedChanges();
          await persistFieldConfig(container, fieldsList);
          await loadFormFields();
          renderFormFields();
          fillForm(currentData);
          if (!wasDirty) markFormPristine();
          if (statusEl) { statusEl.textContent = 'Configuração salva.'; statusEl.className = 'success'; }
        } catch (error) {
          if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
        }
      });
    });

    container.querySelectorAll('.tfq-field-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const ok   = window.confirm(`Remover o campo "${name}"?\n\nATENÇÃO: todos os dados armazenados neste campo serão apagados permanentemente.`);
        if (!ok) return;

        const statusEl = document.getElementById('tfq-fields-status');
        if (statusEl) { statusEl.textContent = 'Removendo campo...'; statusEl.className = ''; }

        try {
          const result = await fetchJson(`${API_BASE}/remove_field.php`, {
            method:  'POST',
            headers: adminHeaders({ 'Content-Type': 'application/json' }),
            body:    JSON.stringify({ field_name: name })
          });

          if (statusEl) { statusEl.textContent = result.message; statusEl.className = 'success'; }
          const currentData = getFormData();
          const wasDirty = hasUnsavedChanges();
          await loadFormFields();
          renderFormFields();
          fillForm(currentData);
          if (!wasDirty) markFormPristine();
          await loadFields();

        } catch (error) {
          if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
        }
      });
    });
  }

  async function persistFieldConfig(container, orderedFields) {
    const configs = collectFieldConfigsFromList(container, orderedFields);
    await saveFieldConfigs(configs);
  }

  async function addField() {
    const input        = document.getElementById('tfq-new-field-name');
    const labelInput   = document.getElementById('tfq-new-field-label');
    const typeInput    = document.getElementById('tfq-new-field-type');
    const optionsInput = document.getElementById('tfq-new-field-options');
    const statusEl     = document.getElementById('tfq-fields-status');
    const fieldName    = input ? input.value.trim().toLowerCase().replace(/\s+/g, '_') : '';
    const fieldLabel   = labelInput ? labelInput.value.trim() : '';
    const fieldType    = typeInput ? typeInput.value : 'text';
    const fieldOptions = optionsInput
      ? optionsInput.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
      : [];

    if (!fieldName) {
      if (statusEl) { statusEl.textContent = 'Informe um nome para o campo.'; statusEl.className = 'error'; }
      return;
    }

    if (fieldType === 'select' && fieldOptions.length === 0) {
      if (statusEl) { statusEl.textContent = 'Informe ao menos uma opção para campos do tipo lista.'; statusEl.className = 'error'; }
      return;
    }

    const addBtn = document.getElementById('tfq-add-field-btn');
    if (addBtn) addBtn.disabled = true;

    try {
      if (statusEl) { statusEl.textContent = 'Adicionando campo...'; statusEl.className = ''; }

      const result = await fetchJson(`${API_BASE}/add_field.php`, {
        method:  'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify({
          field_name:    fieldName,
          field_label:   fieldLabel,
          field_type:    fieldType,
          field_options: fieldOptions
        })
      });

      if (input) input.value = '';
      if (labelInput) labelInput.value = '';
      if (optionsInput) optionsInput.value = '';
      if (statusEl) { statusEl.textContent = result.message; statusEl.className = 'success'; }
      const currentData = getFormData();
      const wasDirty = hasUnsavedChanges();
      await loadFormFields();
      renderFormFields();
      fillForm(currentData);
      if (!wasDirty) markFormPristine();
      await loadFields();

    } catch (error) {
      if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
    } finally {
      if (addBtn) addBtn.disabled = false;
    }
  }

  function roleLabel(role) {
    return {
      viewer: 'Viewer',
      editor: 'Editor',
      admin: 'Admin',
      owner: 'Owner'
    }[role] || role;
  }

  function getAllowedRoleOptions() {
    const roles = canCreateOwner()
      ? ['viewer', 'editor', 'admin', 'owner']
      : ['viewer', 'editor'];

    return roles.map(role =>
      `<option value="${role}" ${role === 'editor' ? 'selected' : ''}>${roleLabel(role)}</option>`
    ).join('');
  }

  function updateUserRoleOptions() {
    const roleSelect = document.getElementById('tfq-new-user-role');
    if (roleSelect) roleSelect.innerHTML = getAllowedRoleOptions();
  }

  async function loadUsers() {
    const statusEl = document.getElementById('tfq-users-status');
    const listEl = document.getElementById('tfq-users-list');
    if (!statusEl || !listEl) return;

    if (!canManageUsers()) {
      listEl.innerHTML = '<div class="tfq-empty">Seu usuário não tem permissão para gerenciar usuários.</div>';
      statusEl.textContent = '';
      return;
    }

    statusEl.textContent = 'Carregando usuários...';
    statusEl.className = '';

    try {
      const result = await fetchJson(`${API_BASE}/users.php?_t=${Date.now()}`, {
        headers: adminHeaders()
      });
      renderUsersList(Array.isArray(result.users) ? result.users : []);
      statusEl.textContent = `${(result.users || []).length} usuário(s) encontrado(s).`;
      statusEl.className = 'success';
    } catch (error) {
      listEl.innerHTML = '';
      statusEl.textContent = `Erro: ${error.message}`;
      statusEl.className = 'error';
    }
  }

  function renderUsersList(users) {
    const listEl = document.getElementById('tfq-users-list');
    if (!listEl) return;

    if (users.length === 0) {
      listEl.innerHTML = '<div class="tfq-empty">Nenhum usuário encontrado.</div>';
      return;
    }

    listEl.innerHTML = users.map(user => {
      const isSelf = CURRENT_USER && Number(CURRENT_USER.id) === Number(user.id);
      const active = Number(user.is_active) === 1;
      const canTouch = !isSelf && (canCreateOwner() || ['viewer', 'editor'].includes(user.role));
      const statusLabel = active ? 'ativo' : 'inativo';

      return `
        <div class="tfq-field-item" data-user-id="${Number(user.id)}">
          <div class="tfq-field-item-left">
            <div class="tfq-field-info">
              <strong>${escapeHtml(user.full_name || user.username)}</strong>
              <span class="tfq-field-key">${escapeHtml(user.username)} • ${escapeHtml(roleLabel(user.role))} • ${statusLabel}</span>
            </div>
          </div>
          <div class="tfq-item-actions">
            <button class="tfq-mini-btn tfq-user-reset" data-id="${Number(user.id)}" ${canTouch ? '' : 'disabled'} title="Redefinir senha">Senha</button>
            <button class="tfq-mini-btn ${active ? 'tfq-mini-btn-danger' : ''} tfq-user-toggle" data-id="${Number(user.id)}" data-active="${active ? '0' : '1'}" ${canTouch ? '' : 'disabled'} title="${active ? 'Desativar' : 'Reativar'} usuário">${active ? 'Desativar' : 'Reativar'}</button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.tfq-user-toggle').forEach(btn => {
      btn.addEventListener('click', () => setUserStatus(Number(btn.dataset.id), btn.dataset.active === '1'));
    });

    listEl.querySelectorAll('.tfq-user-reset').forEach(btn => {
      btn.addEventListener('click', () => resetUserPassword(Number(btn.dataset.id)));
    });
  }

  async function addUser() {
    const usernameInput = document.getElementById('tfq-new-user-username');
    const nameInput = document.getElementById('tfq-new-user-name');
    const passwordInput = document.getElementById('tfq-new-user-password');
    const roleInput = document.getElementById('tfq-new-user-role');
    const statusEl = document.getElementById('tfq-users-status');
    const addBtn = document.getElementById('tfq-add-user-btn');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const fullName = nameInput ? nameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const role = roleInput ? roleInput.value : 'editor';

    if (!username || !password) {
      if (statusEl) { statusEl.textContent = 'Informe usuário e senha temporária.'; statusEl.className = 'error'; }
      return;
    }

    if (addBtn) addBtn.disabled = true;
    if (statusEl) { statusEl.textContent = 'Criando usuário...'; statusEl.className = ''; }

    try {
      const result = await fetchJson(`${API_BASE}/users.php`, {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'create', username, full_name: fullName, password, role })
      });

      if (usernameInput) usernameInput.value = '';
      if (nameInput) nameInput.value = '';
      if (passwordInput) passwordInput.value = '';
      if (statusEl) { statusEl.textContent = result.message || 'Usuário criado.'; statusEl.className = 'success'; }
      await loadUsers();
    } catch (error) {
      if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
    } finally {
      if (addBtn) addBtn.disabled = false;
    }
  }

  async function setUserStatus(id, isActive) {
    const statusEl = document.getElementById('tfq-users-status');
    const ok = window.confirm(isActive ? 'Reativar este usuário?' : 'Desativar este usuário e encerrar suas sessões?');
    if (!ok) return;

    try {
      if (statusEl) { statusEl.textContent = 'Atualizando usuário...'; statusEl.className = ''; }
      const result = await fetchJson(`${API_BASE}/users.php`, {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'set_status', id, is_active: isActive })
      });
      if (statusEl) { statusEl.textContent = result.message || 'Usuário atualizado.'; statusEl.className = 'success'; }
      await loadUsers();
    } catch (error) {
      if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
    }
  }

  async function resetUserPassword(id) {
    const statusEl = document.getElementById('tfq-users-status');
    const password = window.prompt('Informe a nova senha temporária para este usuário:');
    if (password == null) return;
    if (password.length < 8) {
      if (statusEl) { statusEl.textContent = 'A senha deve ter pelo menos 8 caracteres.'; statusEl.className = 'error'; }
      return;
    }

    try {
      if (statusEl) { statusEl.textContent = 'Redefinindo senha...'; statusEl.className = ''; }
      const result = await fetchJson(`${API_BASE}/users.php`, {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'reset_password', id, password })
      });
      if (statusEl) { statusEl.textContent = result.message || 'Senha redefinida.'; statusEl.className = 'success'; }
      await loadUsers();
    } catch (error) {
      if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
    }
  }

  function priorityLabel(priority) {
    return {
      baixa: 'Baixa',
      normal: 'Normal',
      alta: 'Alta'
    }[priority] || 'Normal';
  }

  function statusLabel(status) {
    return {
      pendente: 'Pendente',
      concluida: 'Concluída',
      cancelada: 'Cancelada',
      arquivada: 'Arquivada'
    }[status] || status || '-';
  }

  function getTaskStatusEl() {
    return document.getElementById('tfq-task-status');
  }

  function setTaskStatus(message, type = '') {
    const el = getTaskStatusEl();
    if (!el) return;
    el.textContent = message || '';
    el.className = type ? type : '';
  }

  function parseTaskDate(value) {
    if (!value) return null;
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTaskDue(value) {
    const date = parseTaskDate(value);
    if (!date) return 'Sem prazo';

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function toDateTimeLocalValue(value) {
    if (!value) return '';
    return String(value).replace(' ', 'T').slice(0, 16);
  }

  function isTaskOverdue(task) {
    const date = parseTaskDate(task.due_at);
    return task.status === 'pendente' && date && date.getTime() < Date.now();
  }

  function isTaskToday(task) {
    const date = parseTaskDate(task.due_at);
    if (!date) return false;
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }

  function renderTaskNegocioOptions() {
    const select = document.getElementById('tfq-task-negocio');
    if (!select) return;

    const current = select.value;
    const options = ['<option value="">Nenhum negócio específico</option>'];
    negociosCache.forEach(item => {
      const label = `#${item.id} - ${item.destino || item.nome_lead || 'Sem destino'}`;
      options.push(`<option value="${Number(item.id)}">${escapeHtml(label)}</option>`);
    });

    select.innerHTML = options.join('');
    if ([...select.options].some(option => option.value === current)) {
      select.value = current;
    }
  }

  function getTaskFormData() {
    const data = getLeadContextPayload();
    const negocioSelect = document.getElementById('tfq-task-negocio');

    return {
      ...data,
      action: editingTaskId > 0 ? 'update' : 'create',
      id: editingTaskId,
      negocio_id: negocioSelect && negocioSelect.value ? Number(negocioSelect.value) : 0,
      title: (document.getElementById('tfq-task-title')?.value || '').trim(),
      due_at: (document.getElementById('tfq-task-due')?.value || '').trim(),
      priority: document.getElementById('tfq-task-priority')?.value || 'normal',
      responsavel: (document.getElementById('tfq-task-responsavel')?.value || '').trim(),
      notes: (document.getElementById('tfq-task-notes')?.value || '').trim()
    };
  }

  function clearTaskForm() {
    editingTaskId = 0;

    const title = document.getElementById('tfq-task-title');
    const negocio = document.getElementById('tfq-task-negocio');
    const due = document.getElementById('tfq-task-due');
    const priority = document.getElementById('tfq-task-priority');
    const responsavel = document.getElementById('tfq-task-responsavel');
    const notes = document.getElementById('tfq-task-notes');
    const formTitle = document.getElementById('tfq-task-form-title');
    const badge = document.getElementById('tfq-task-editing-badge');
    const saveBtn = document.getElementById('tfq-task-save');

    if (title) title.value = '';
    if (negocio) negocio.value = editingId > 0 ? String(editingId) : '';
    if (due) due.value = '';
    if (priority) priority.value = 'normal';
    if (responsavel) responsavel.value = (CURRENT_USER && (CURRENT_USER.full_name || CURRENT_USER.username)) || '';
    if (notes) notes.value = '';
    if (formTitle) formTitle.textContent = 'Nova tarefa';
    if (badge) badge.textContent = '';
    if (saveBtn) saveBtn.textContent = 'Salvar tarefa';
  }

  function fillTaskForm(task) {
    clearTaskForm();
    editingTaskId = Number(task.id || 0);

    const title = document.getElementById('tfq-task-title');
    const negocio = document.getElementById('tfq-task-negocio');
    const due = document.getElementById('tfq-task-due');
    const priority = document.getElementById('tfq-task-priority');
    const responsavel = document.getElementById('tfq-task-responsavel');
    const notes = document.getElementById('tfq-task-notes');
    const formTitle = document.getElementById('tfq-task-form-title');
    const badge = document.getElementById('tfq-task-editing-badge');
    const saveBtn = document.getElementById('tfq-task-save');

    if (title) title.value = task.title || '';
    if (negocio) negocio.value = task.negocio_id ? String(task.negocio_id) : '';
    if (due) due.value = toDateTimeLocalValue(task.due_at);
    if (priority) priority.value = task.priority || 'normal';
    if (responsavel) responsavel.value = task.responsavel || '';
    if (notes) notes.value = task.notes || '';
    if (formTitle) formTitle.textContent = 'Editando tarefa';
    if (badge) badge.textContent = `ID #${editingTaskId}`;
    if (saveBtn) saveBtn.textContent = 'Atualizar tarefa';
  }

  function updateTaskSummary() {
    const pending = tasksCache.filter(task => task.status === 'pendente');
    const overdue = pending.filter(isTaskOverdue);
    const today = pending.filter(task => !isTaskOverdue(task) && isTaskToday(task));
    const summaryEl = document.getElementById('tfq-task-summary');
    const countEl = document.getElementById('tfq-task-tab-count');

    if (countEl) {
      countEl.textContent = pending.length > 0 ? String(pending.length) : '';
      countEl.classList.toggle('tfq-hidden', pending.length === 0);
    }

    if (!summaryEl) return;

    let message = 'Nenhuma tarefa pendente para este lead.';
    let tone = 'ok';

    if (overdue.length > 0) {
      message = `${overdue.length} tarefa(s) atrasada(s).`;
      tone = 'danger';
    } else if (today.length > 0) {
      message = `${today.length} tarefa(s) para hoje.`;
      tone = 'warning';
    } else if (pending.length > 0) {
      message = `${pending.length} tarefa(s) pendente(s).`;
      tone = 'info';
    }

    summaryEl.innerHTML = `
      <button class="tfq-task-summary-btn tfq-task-summary-${tone}" id="tfq-open-tasks-tab" type="button">
        ${escapeHtml(message)}
      </button>
    `;

    const openBtn = document.getElementById('tfq-open-tasks-tab');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const tab = document.querySelector(`#${PANEL_ID} .tfq-tab[data-tab="tarefas"]`);
        if (tab) tab.click();
      });
    }
  }

  async function loadTasks(force = false) {
    const context = getCurrentContext();
    const contextKey = getContextKey(context);

    if (!context.isValid || !isConfigured()) {
      tasksCache = [];
      renderTasksList();
      updateTaskSummary();
      return;
    }

    if (!force && tasksCache.length && contextKey === currentConversationId) {
      renderTasksList();
      updateTaskSummary();
      return;
    }

    const listEl = document.getElementById('tfq-tasks-list');
    if (listEl) listEl.innerHTML = '<div class="tfq-empty">Carregando tarefas...</div>';
    setTaskStatus('Carregando tarefas...', '');

    try {
      const params = new URLSearchParams({
        _t: Date.now().toString(),
        action: 'list'
      });
      appendLeadContextParams(params, context);

      const result = await fetchJson(`${API_BASE}/tasks.php?${params.toString()}`, {
        headers: apiHeaders()
      });

      tasksCache = Array.isArray(result.tasks) ? result.tasks : [];
      renderTasksList();
      updateTaskSummary();

      const pendingCount = tasksCache.filter(task => task.status === 'pendente').length;
      setTaskStatus(
        pendingCount > 0 ? `${pendingCount} tarefa(s) pendente(s).` : 'Nenhuma tarefa pendente.',
        'success'
      );
    } catch (error) {
      tasksCache = [];
      renderTasksList();
      updateTaskSummary();
      setTaskStatus(`Erro: ${error.message}`, 'error');
    }
  }

  function getTaskGroups() {
    return [
      {
        title: 'Atrasadas',
        tasks: tasksCache.filter(task => task.status === 'pendente' && isTaskOverdue(task))
      },
      {
        title: 'Hoje',
        tasks: tasksCache.filter(task => task.status === 'pendente' && !isTaskOverdue(task) && isTaskToday(task))
      },
      {
        title: 'Próximas',
        tasks: tasksCache.filter(task => {
          const due = parseTaskDate(task.due_at);
          return task.status === 'pendente' && due && !isTaskOverdue(task) && !isTaskToday(task);
        })
      },
      {
        title: 'Sem prazo',
        tasks: tasksCache.filter(task => task.status === 'pendente' && !parseTaskDate(task.due_at))
      },
      {
        title: 'Concluídas',
        tasks: tasksCache.filter(task => task.status === 'concluida')
      },
      {
        title: 'Canceladas',
        tasks: tasksCache.filter(task => task.status === 'cancelada')
      }
    ];
  }

  function renderTasksList() {
    const listEl = document.getElementById('tfq-tasks-list');
    if (!listEl) return;

    if (tasksCache.length === 0) {
      listEl.innerHTML = '<div class="tfq-empty">Nenhuma tarefa cadastrada para este lead.</div>';
      return;
    }

    listEl.innerHTML = getTaskGroups()
      .filter(group => group.tasks.length > 0)
      .map(group => `
        <div class="tfq-task-group">
          <h4>${escapeHtml(group.title)}</h4>
          ${group.tasks.map(renderTaskItem).join('')}
        </div>
      `).join('');

    listEl.querySelectorAll('.tfq-task-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = tasksCache.find(item => Number(item.id) === Number(btn.dataset.id));
        if (task) fillTaskForm(task);
      });
    });

    listEl.querySelectorAll('.tfq-task-action').forEach(btn => {
      btn.addEventListener('click', () => runTaskAction(btn.dataset.action, Number(btn.dataset.id)));
    });
  }

  function renderTaskItem(task) {
    const negocioLabel = task.negocio_id
      ? `Negócio #${task.negocio_id}${task.negocio_destino ? ` - ${task.negocio_destino}` : ''}`
      : 'Lead';
    const overdue = isTaskOverdue(task);
    const priority = task.priority || 'normal';
    const canWrite = canEdit();
    const canAdminTask = isAdmin();
    const status = task.status || 'pendente';

    const primaryAction = status === 'pendente'
      ? `<button class="tfq-mini-btn tfq-task-action" data-action="complete" data-id="${Number(task.id)}" ${canWrite ? '' : 'disabled'}>Concluir</button>`
      : `<button class="tfq-mini-btn tfq-task-action" data-action="reopen" data-id="${Number(task.id)}" ${canWrite ? '' : 'disabled'}>Reabrir</button>`;

    const cancelAction = status === 'pendente'
      ? `<button class="tfq-mini-btn tfq-task-action" data-action="cancel" data-id="${Number(task.id)}" ${canWrite ? '' : 'disabled'}>Cancelar</button>`
      : '';

    return `
      <div class="tfq-task-item tfq-task-priority-${escapeHtml(priority)} ${overdue ? 'tfq-task-overdue' : ''}">
        <div class="tfq-task-main">
          <div class="tfq-task-title-row">
            <strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong>
            <span class="tfq-task-pill">${escapeHtml(priorityLabel(priority))}</span>
          </div>
          <div class="tfq-task-meta">
            ${escapeHtml(statusLabel(status))} • ${escapeHtml(formatTaskDue(task.due_at))} • ${escapeHtml(task.responsavel || 'Sem responsável')} • ${escapeHtml(negocioLabel)}
          </div>
          ${task.notes ? `<div class="tfq-task-notes">${escapeHtml(task.notes)}</div>` : ''}
        </div>
        <div class="tfq-item-actions tfq-task-actions">
          <button class="tfq-mini-btn tfq-task-edit" data-id="${Number(task.id)}" ${canWrite ? '' : 'disabled'}>Editar</button>
          ${primaryAction}
          ${cancelAction}
          <button class="tfq-mini-btn tfq-task-action" data-action="archive" data-id="${Number(task.id)}" ${canAdminTask ? '' : 'disabled'}>Arquivar</button>
          <button class="tfq-mini-btn tfq-mini-btn-danger tfq-task-action" data-action="delete" data-id="${Number(task.id)}" ${canAdminTask ? '' : 'disabled'}>Excluir</button>
        </div>
      </div>
    `;
  }

  async function saveTask() {
    if (!canEdit()) {
      setTaskStatus('Seu usuário não tem permissão para salvar tarefas.', 'error');
      return;
    }

    const context = getCurrentContext();
    if (!context.isValid) {
      setTaskStatus('Selecione uma conversa primeiro.', 'error');
      return;
    }

    const payload = getTaskFormData();
    if (!payload.title) {
      setTaskStatus('Informe o título da tarefa.', 'error');
      return;
    }

    const saveBtn = document.getElementById('tfq-task-save');
    if (saveBtn) saveBtn.disabled = true;
    setTaskStatus(editingTaskId > 0 ? 'Atualizando tarefa...' : 'Salvando tarefa...', '');

    try {
      const result = await fetchJson(`${API_BASE}/tasks.php`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      clearTaskForm();
      await loadTasks(true);
      setTaskStatus(result.message || 'Tarefa salva.', 'success');
      chrome.runtime.sendMessage({ type: 'TFQ_REFRESH_REMINDERS' });
    } catch (error) {
      setTaskStatus(`Erro: ${error.message}`, 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function runTaskAction(action, id) {
    const labels = {
      complete: 'concluir esta tarefa?',
      reopen: 'reabrir esta tarefa?',
      cancel: 'cancelar esta tarefa?',
      archive: 'arquivar esta tarefa?',
      delete: 'excluir permanentemente esta tarefa?'
    };

    if (!id || !labels[action]) return;
    if (['archive', 'delete'].includes(action) && !isAdmin()) {
      setTaskStatus('Somente administradores podem arquivar ou excluir tarefas.', 'error');
      return;
    }
    if (!['archive', 'delete'].includes(action) && !canEdit()) {
      setTaskStatus('Seu usuário não tem permissão para alterar tarefas.', 'error');
      return;
    }

    const ok = window.confirm(`Deseja ${labels[action]}`);
    if (!ok) return;

    try {
      setTaskStatus('Atualizando tarefa...', '');
      const result = await fetchJson(`${API_BASE}/tasks.php`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action,
          id,
          ...getLeadContextPayload()
        })
      });

      if (editingTaskId === id) clearTaskForm();
      await loadTasks(true);
      setTaskStatus(result.message || 'Tarefa atualizada.', 'success');
      chrome.runtime.sendMessage({ type: 'TFQ_REFRESH_REMINDERS' });
    } catch (error) {
      setTaskStatus(`Erro: ${error.message}`, 'error');
    }
  }

  function setTaskDueInHours(hours) {
    const due = document.getElementById('tfq-task-due');
    if (!due) return;

    const date = new Date(Date.now() + hours * 60 * 60 * 1000);
    date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
    const pad = value => String(value).padStart(2, '0');
    due.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function applyTaskTemplate(title, hours = 24) {
    const titleEl = document.getElementById('tfq-task-title');
    if (titleEl) titleEl.value = title;
    setTaskDueInHours(hours);
    const notes = document.getElementById('tfq-task-notes');
    if (notes) notes.focus();
  }

  function renderPanel() {
    if (document.getElementById(PANEL_ID) || document.getElementById(TOGGLE_ID)) return;

    const toggle       = document.createElement('button');
    toggle.id          = TOGGLE_ID;
    toggle.type        = 'button';
    toggle.textContent = 'Negócios';
    toggle.setAttribute('aria-expanded', 'false');

    const panel = document.createElement('aside');
    panel.id    = PANEL_ID;
    panel.setAttribute('aria-label', 'Painel de negócios do lead');

    panel.innerHTML = `
      <div id="tfq-header">
        <div>
          <h2 id="tfq-title">Zap Negócios</h2>
          <div id="tfq-subtitle">Origem: <span id="tfq-conversation-id">-</span></div>
        </div>
        <button id="tfq-close" type="button" aria-label="Fechar painel">×</button>
      </div>

      <div id="tfq-not-configured" class="tfq-not-configured tfq-hidden">
        <p>⚠️ Login necessário.</p>
        <p>Clique com o botão direito no ícone da extensão → <strong>Opções</strong>, configure o servidor e faça login.</p>
        <button class="tfq-btn tfq-btn-primary tfq-btn-small" id="tfq-open-options" type="button">Abrir configurações</button>
      </div>

      <div id="tfq-tabs">
        <button class="tfq-tab tfq-tab-active" data-tab="negocios" type="button">📋 Negócios</button>
        <button class="tfq-tab" data-tab="tarefas" type="button">✅ Tarefas <span id="tfq-task-tab-count" class="tfq-tab-count tfq-hidden"></span></button>
        <button class="tfq-tab" data-tab="campos" type="button">⚙️ Campos</button>
        <button class="tfq-tab" data-tab="usuarios" type="button">👤 Usuários</button>
      </div>

      <div id="tfq-body">

        <!-- ABA NEGÓCIOS -->
        <div id="tfq-tab-negocios" class="tfq-tab-pane">
          <section class="tfq-card">
            <h3>Selecione ou crie um negócio</h3>
            <div class="tfq-row">
              <label class="tfq-label" for="tfq-negocios-dropdown">Negócios desta conversa</label>
              <select class="tfq-select" id="tfq-negocios-dropdown">
                <option value="">-- Novo negócio --</option>
              </select>
            </div>
            <div id="tfq-task-summary" class="tfq-task-summary"></div>
          </section>

          <section class="tfq-card">
            <div class="tfq-section-head">
              <div>
                <h3 id="tfq-form-title">Novo negócio</h3>
                <div id="tfq-editing-badge" class="tfq-editing-badge"></div>
              </div>
            </div>
            <div class="tfq-grid">
              ${fields.map(createField).join('')}
            </div>
            <div class="tfq-actions">
              <button class="tfq-btn tfq-btn-primary"   id="tfq-save"   type="button">Salvar</button>
              <button class="tfq-btn tfq-btn-danger"    id="tfq-delete" type="button" disabled>Excluir</button>
              <button class="tfq-btn tfq-btn-secondary" id="tfq-cancel" type="button">Limpar</button>
              <button class="tfq-btn tfq-btn-secondary" id="tfq-reload" type="button">Recarregar</button>
            </div>
            <div id="tfq-status"></div>
          </section>
        </div>

        <!-- ABA TAREFAS -->
        <div id="tfq-tab-tarefas" class="tfq-tab-pane tfq-tab-pane-hidden">
          <section class="tfq-card">
            <div class="tfq-section-head">
              <div>
                <h3 id="tfq-task-form-title">Nova tarefa</h3>
                <div id="tfq-task-editing-badge" class="tfq-editing-badge"></div>
              </div>
            </div>

            <div class="tfq-task-templates">
              <button class="tfq-mini-btn tfq-task-template" data-title="Retornar contato" data-hours="4" type="button">Retornar</button>
              <button class="tfq-mini-btn tfq-task-template" data-title="Enviar cotação" data-hours="24" type="button">Cotação</button>
              <button class="tfq-mini-btn tfq-task-template" data-title="Confirmar pagamento" data-hours="24" type="button">Pagamento</button>
              <button class="tfq-mini-btn tfq-task-template" data-title="Solicitar documentos" data-hours="24" type="button">Documentos</button>
              <button class="tfq-mini-btn tfq-task-template" data-title="Fazer follow-up" data-hours="48" type="button">Follow-up</button>
            </div>

            <div class="tfq-grid">
              <div class="tfq-row">
                <label class="tfq-label" for="tfq-task-title">Título da tarefa</label>
                <input class="tfq-input" id="tfq-task-title" type="text" placeholder="ex: Retornar contato" />
              </div>

              <div class="tfq-row">
                <label class="tfq-label" for="tfq-task-negocio">Negócio relacionado</label>
                <select class="tfq-select" id="tfq-task-negocio">
                  <option value="">Nenhum negócio específico</option>
                </select>
              </div>

              <div class="tfq-row">
                <label class="tfq-label" for="tfq-task-due">Lembrete</label>
                <input class="tfq-input" id="tfq-task-due" type="datetime-local" />
              </div>

              <div class="tfq-row">
                <label class="tfq-label" for="tfq-task-priority">Prioridade</label>
                <select class="tfq-select" id="tfq-task-priority">
                  <option value="baixa">Baixa</option>
                  <option value="normal" selected>Normal</option>
                  <option value="alta">Alta</option>
                </select>
              </div>

              <div class="tfq-row">
                <label class="tfq-label" for="tfq-task-responsavel">Responsável</label>
                <input class="tfq-input" id="tfq-task-responsavel" type="text" />
              </div>

              <div class="tfq-row">
                <label class="tfq-label" for="tfq-task-notes">Observação</label>
                <textarea class="tfq-textarea" id="tfq-task-notes" rows="3"></textarea>
              </div>
            </div>

            <div class="tfq-actions">
              <button class="tfq-btn tfq-btn-primary" id="tfq-task-save" type="button">Salvar tarefa</button>
              <button class="tfq-btn tfq-btn-secondary" id="tfq-task-clear" type="button">Limpar</button>
              <button class="tfq-btn tfq-btn-secondary" id="tfq-task-reload" type="button">Recarregar</button>
            </div>
            <div id="tfq-task-status"></div>
          </section>

          <section class="tfq-card">
            <h3>Tarefas do lead</h3>
            <div id="tfq-tasks-list" style="margin-top:10px;"></div>
          </section>
        </div>

        <!-- ABA CAMPOS -->
        <div id="tfq-tab-campos" class="tfq-tab-pane tfq-tab-pane-hidden">
          <section class="tfq-card">
            <h3>Adicionar campo personalizado</h3>
            <div class="tfq-row" style="margin-top:10px;">
              <label class="tfq-label" for="tfq-new-field-name">Nome do campo (snake_case)</label>
              <input class="tfq-input" id="tfq-new-field-name" type="text" placeholder="ex: numero_voo" />
            </div>
            <div class="tfq-row" style="margin-top:10px;">
              <label class="tfq-label" for="tfq-new-field-label">Rótulo exibido</label>
              <input class="tfq-input" id="tfq-new-field-label" type="text" placeholder="ex: Número do voo" />
            </div>
            <div class="tfq-row" style="margin-top:10px;">
              <label class="tfq-label" for="tfq-new-field-type">Tipo do campo</label>
              <select class="tfq-select" id="tfq-new-field-type">
                <option value="text">Texto</option>
                <option value="textarea">Texto longo</option>
                <option value="select">Lista</option>
                <option value="date">Data</option>
                <option value="number">Número</option>
                <option value="currency">Valor</option>
              </select>
            </div>
            <div class="tfq-row tfq-hidden" id="tfq-new-field-options-row" style="margin-top:10px;">
              <label class="tfq-label" for="tfq-new-field-options">Opções da lista</label>
              <textarea class="tfq-textarea" id="tfq-new-field-options" rows="3" placeholder="Uma opção por linha"></textarea>
            </div>
            <div class="tfq-actions">
              <button class="tfq-btn tfq-btn-primary" id="tfq-add-field-btn" type="button">Adicionar campo</button>
            </div>
          </section>

          <section class="tfq-card">
            <h3>Campos do formulário</h3>
            <p class="tfq-fields-hint">Use ↑↓ para reordenar. Edite rótulo, tipo e opções e clique ✓ para salvar no servidor. Campos padrão não podem ser removidos.</p>
            <div id="tfq-fields-list" style="margin-top:10px;"></div>
            <div id="tfq-fields-status" style="margin-top:10px; font: 600 13px/1.4 Arial, sans-serif;"></div>
          </section>
        </div>

        <!-- ABA USUÁRIOS -->
        <div id="tfq-tab-usuarios" class="tfq-tab-pane tfq-tab-pane-hidden">
          <section class="tfq-card">
            <h3>Adicionar usuário</h3>
            <div class="tfq-row" style="margin-top:10px;">
              <label class="tfq-label" for="tfq-new-user-username">Usuário</label>
              <input class="tfq-input" id="tfq-new-user-username" type="text" placeholder="ex: maria" />
            </div>
            <div class="tfq-row" style="margin-top:10px;">
              <label class="tfq-label" for="tfq-new-user-name">Nome</label>
              <input class="tfq-input" id="tfq-new-user-name" type="text" placeholder="ex: Maria Silva" />
            </div>
            <div class="tfq-row" style="margin-top:10px;">
              <label class="tfq-label" for="tfq-new-user-password">Senha temporária</label>
              <input class="tfq-input" id="tfq-new-user-password" type="password" />
            </div>
            <div class="tfq-row" style="margin-top:10px;">
              <label class="tfq-label" for="tfq-new-user-role">Permissão</label>
              <select class="tfq-select" id="tfq-new-user-role">
                <option value="viewer">Viewer - só consulta</option>
                <option value="editor" selected>Editor - consulta e salva</option>
                <option value="admin">Admin - campos e exclusões</option>
                <option value="owner">Owner - controle total</option>
              </select>
            </div>
            <div class="tfq-actions">
              <button class="tfq-btn tfq-btn-primary" id="tfq-add-user-btn" type="button">Adicionar usuário</button>
            </div>
          </section>

          <section class="tfq-card">
            <h3>Usuários</h3>
            <div id="tfq-users-list" style="margin-top:10px;"></div>
            <div id="tfq-users-status" style="margin-top:10px; font: 600 13px/1.4 Arial, sans-serif;"></div>
          </section>
        </div>

      </div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    async function openPanel() {
      panel.classList.add('tfq-open');
      toggle.setAttribute('aria-expanded', 'true');

      await loadUserConfig();

      const notConfiguredEl = document.getElementById('tfq-not-configured');
      const tabsEl          = document.getElementById('tfq-tabs');
      const bodyEl          = document.getElementById('tfq-body');
      const tabCampos       = panel.querySelector('.tfq-tab[data-tab="campos"]');
      const tabUsuarios     = panel.querySelector('.tfq-tab[data-tab="usuarios"]');
      const saveBtn         = document.getElementById('tfq-save');
      const taskSaveBtn     = document.getElementById('tfq-task-save');

      if (!isConfigured()) {
        if (notConfiguredEl) notConfiguredEl.classList.remove('tfq-hidden');
        if (tabsEl)          tabsEl.classList.add('tfq-hidden');
        if (bodyEl)          bodyEl.classList.add('tfq-hidden');
        return;
      }

      if (notConfiguredEl) notConfiguredEl.classList.add('tfq-hidden');
      if (tabsEl)          tabsEl.classList.remove('tfq-hidden');
      if (bodyEl)          bodyEl.classList.remove('tfq-hidden');

      if (saveBtn) {
        saveBtn.disabled = !canEdit();
        saveBtn.title = canEdit() ? 'Salvar negócio' : 'Seu usuário não tem permissão para salvar negócios';
      }
      if (taskSaveBtn) {
        taskSaveBtn.disabled = !canEdit();
        taskSaveBtn.title = canEdit() ? 'Salvar tarefa' : 'Seu usuário não tem permissão para salvar tarefas';
      }

      // Mostra aba Campos apenas para administradores
      if (tabCampos) {
        if (isAdmin()) {
          tabCampos.classList.remove('tfq-hidden');
        } else {
          tabCampos.classList.add('tfq-hidden');
          // Garante que a aba Negócios esteja ativa se Campos estava selecionada
          const tabNegocios = panel.querySelector('.tfq-tab[data-tab="negocios"]');
          if (tabNegocios) tabNegocios.click();
        }
      }

      if (tabUsuarios) {
        if (canManageUsers()) {
          tabUsuarios.classList.remove('tfq-hidden');
        } else {
          tabUsuarios.classList.add('tfq-hidden');
        }
      }

      const deleteBtn = document.getElementById('tfq-delete');
      if (deleteBtn && !isAdmin()) {
        deleteBtn.disabled = true;
        deleteBtn.title = 'Somente administradores podem excluir negócios';
      }

      updateUserRoleOptions();

      await loadFormFields();
      renderFormFields();
      clearTaskForm();
      await loadNegocios(true);
      await loadTasks(true);
    }

    function closePanel() {
      panel.classList.remove('tfq-open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', () => {
      panel.classList.contains('tfq-open') ? closePanel() : openPanel();
    });

    // ✅ CORRIGIDO: querySelector com template literal correta
    panel.querySelectorAll('.tfq-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.tfq-tab').forEach(t => t.classList.remove('tfq-tab-active'));
        tab.classList.add('tfq-tab-active');

        const target = tab.dataset.tab;
        panel.querySelectorAll('.tfq-tab-pane').forEach(pane => pane.classList.add('tfq-tab-pane-hidden'));

        const activePane = document.getElementById(`tfq-tab-${target}`);
        if (activePane) activePane.classList.remove('tfq-tab-pane-hidden');

        if (target === 'campos') loadFields();
        if (target === 'tarefas') loadTasks(true);
        if (target === 'usuarios') loadUsers();
      });
    });

    const dropdown = panel.querySelector('#tfq-negocios-dropdown');
    if (dropdown) dropdown.addEventListener('change', onNegocioSelected);

    const openOptionsBtn = panel.querySelector('#tfq-open-options');
    if (openOptionsBtn) {
      openOptionsBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'TFQ_OPEN_OPTIONS' });
      });
    }

    panel.querySelector('#tfq-close').addEventListener('click', closePanel);
    panel.querySelector('#tfq-save').addEventListener('click', saveNegocio);
    panel.querySelector('#tfq-delete').addEventListener('click', deleteNegocio);
    panel.querySelector('#tfq-task-save').addEventListener('click', saveTask);
    panel.querySelector('#tfq-task-clear').addEventListener('click', () => {
      clearTaskForm();
      setTaskStatus('Formulário de tarefa limpo.', '');
    });
    panel.querySelector('#tfq-task-reload').addEventListener('click', () => loadTasks(true));
    panel.querySelector('#tfq-reload').addEventListener('click', () => {
      if (!confirmDiscardChanges('Há alterações não salvas. Deseja recarregar e descartá-las?')) return;
      negociosCache         = [];
      currentConversationId = '';
      loadNegocios(true);
      loadTasks(true);
    });
    panel.querySelector('#tfq-cancel').addEventListener('click', () => {
      if (!confirmDiscardChanges()) return;
      setEditingState(0);
      const dd = getNegociosDropdown();
      if (dd) dd.value = '';
      setStatus('Formulário limpo.', '');
    });

    panel.querySelector('#tfq-add-field-btn').addEventListener('click', addField);
    panel.querySelector('#tfq-add-user-btn').addEventListener('click', addUser);
    panel.querySelector('#tfq-new-field-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') addField();
    });
    panel.querySelector('#tfq-new-user-username').addEventListener('keydown', e => {
      if (e.key === 'Enter') addUser();
    });
    panel.querySelector('#tfq-new-field-type').addEventListener('change', e => {
      const row = panel.querySelector('#tfq-new-field-options-row');
      if (row) row.classList.toggle('tfq-hidden', e.target.value !== 'select');
    });
    panel.querySelectorAll('.tfq-task-template').forEach(btn => {
      btn.addEventListener('click', () => applyTaskTemplate(btn.dataset.title || '', Number(btn.dataset.hours || 24)));
    });

    updateConversationIdUI();
    updateTaskSummary();
    panelInitialized = true;
  }

  function checkVisibility() {
    const context = getCurrentContext();
    const currentId = getContextKey(context);

    if (currentId !== lastCheckedConversationId) {
      lastCheckedConversationId = currentId;

      const panel = getPanel();
      if (panel && panel.classList.contains('tfq-open') && context.isValid) {
        negociosCache         = [];
        tasksCache            = [];
        currentConversationId = '';
        setEditingState(0);
        clearTaskForm();
        updatePanelTitle();
        loadNegocios(true, true); // autoSelect: troca de conversa
        loadTasks(true);
      }
    }

    if (hasValidConversation()) {
      if (!panelInitialized) renderPanel();
    } else {
      if (panelInitialized)  removePanel();
    }
  }

  function ensurePanel() {
    if (!hasValidConversation()) {
      removePanel();
      return;
    }
    if (panelInitialized) return;
    renderPanel();
  }

  function syncConversation(force = false) {
    const context = getCurrentContext();
    const contextKey = getContextKey(context);

    if (!context.isValid) {
      removePanel();
      return;
    }

    ensurePanel();

    if (getConversationIdDisplay()) updateConversationIdUI();
    updatePanelTitle();

    if (force || contextKey !== currentConversationId) {
      const isConversationChange = contextKey !== currentConversationId;
      currentConversationId = '';
      negociosCache         = [];
      tasksCache            = [];
      setEditingState(0);
      clearTaskForm();
      loadNegocios(true, isConversationChange); // autoSelect só em troca real de conversa
      loadTasks(true);
    }
  }

  function scheduleSync(force = false) {
    if (syncScheduled && !force) return;
    syncScheduled = true;
    window.setTimeout(() => {
      syncScheduled = false;
      syncConversation(force);
    }, force ? 30 : 120);
  }

  function startVisibilityCheck() {
    if (visibilityCheckInterval) clearInterval(visibilityCheckInterval);
    visibilityCheckInterval = setInterval(checkVisibility, 300);
  }

  function stopVisibilityCheck() {
    if (visibilityCheckInterval) {
      clearInterval(visibilityCheckInterval);
      visibilityCheckInterval = null;
    }
  }

  function togglePanelFromAction() {
    if (!hasValidConversation()) {
      return false;
    }

    ensurePanel();
    const toggle = getToggle();
    if (!toggle) return false;
    toggle.click();
    return true;
  }

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === 'TFQ_TOGGLE_PANEL') {
        sendResponse({ ok: togglePanelFromAction() });
        return true;
      }
      return false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      lastCheckedConversationId = getContextKey();
      checkVisibility();
      startVisibilityCheck();
      scheduleSync(true);
    });
  } else {
    lastCheckedConversationId = getContextKey();
    checkVisibility();
    startVisibilityCheck();
    scheduleSync(true);
  }

  // Evento customizado disparado pelo page-bridge.js ao detectar troca de URL.
  // O detail pode conter leadName capturado pelo bridge no momento da troca.
  window.addEventListener('tfq:conversation-change', (e) => {
    const leadName = e.detail && e.detail.leadName ? e.detail.leadName : null;
    checkVisibility();
    scheduleSync(true);
    // Atualiza o título imediatamente com o nome capturado pelo bridge,
    // antes mesmo do loadNegocios terminar
    if (leadName) updatePanelTitle(leadName);
  });

  window.addEventListener('focus', () => {
    checkVisibility();
    scheduleSync(false);
  });

  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  const observer = new MutationObserver(() => {
    if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
    observerDebounceTimer = setTimeout(() => {
      checkVisibility();
    }, 200);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree:   true
  });

})();
