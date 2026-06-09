/**
 * =============================================================================
 * Travel Flow Negócios — content.js
 * =============================================================================
 * Extensão Chrome para o Travel Flow CRM (travelflow.tur.br)
 *
 * Injeta um painel lateral na página de atendimento que permite ao operador
 * criar, visualizar, editar e excluir múltiplos negócios vinculados a um lead,
 * usando o conversationId presente na URL como chave de vínculo.
 *
 * O campo Nome do Lead é preenchido automaticamente a partir do elemento
 * h3.font-semibold:not(.truncate) presente no DOM da página de atendimento.
 *
 * API_BASE e API_KEY são carregados do chrome.storage.sync, configurados
 * pelo usuário na página de Opções da extensão. Se não configurados,
 * o painel exibe um aviso orientando o usuário.
 *
 * ADMIN_KEY é uma chave opcional também carregada do storage. Quando presente,
 * habilita a aba ⚙️ Campos no painel, permitindo gerenciar a estrutura do banco.
 * Usuários sem ADMIN_KEY veem apenas a aba 📋 Negócios.
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
 * Projeto: Travel Flow Negócios
 * =============================================================================
 */
(function () {

  const PANEL_ID           = 'tfq-panel';
  const TOGGLE_ID          = 'tfq-toggle';
  const LEAD_NAME_SELECTOR = 'h3.font-semibold:not(.truncate)';

  let API_BASE  = '';
  let API_KEY   = '';
  let ADMIN_KEY = '';

  function loadUserConfig() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get(['tfq_api_base', 'tfq_api_key', 'tfq_admin_key'], result => {
          API_BASE  = (result.tfq_api_base  || '').trim().replace(/\/$/, '');
          API_KEY   = (result.tfq_api_key   || '').trim();
          ADMIN_KEY = (result.tfq_admin_key || '').trim();
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function isConfigured() {
    return API_BASE !== '' && API_KEY !== '';
  }

  /**
   * Verifica se o usuário tem acesso de administrador (ADMIN_KEY preenchida).
   * Controla a visibilidade da aba ⚙️ Campos no painel lateral.
   * @returns {boolean}
   */
  function isAdmin() {
    return ADMIN_KEY !== '';
  }

  function apiHeaders(extra = {}) {
    return { 'X-Api-Key': API_KEY, ...extra };
  }

  function adminHeaders(extra = {}) {
    return { 'X-Admin-Key': ADMIN_KEY, ...extra };
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
  let editingId                 = 0;
  let lastFormSignature         = '';
  let visibilityCheckInterval   = null;
  let lastCheckedConversationId = '';
  let observerDebounceTimer     = null;

  function isAtendimentoPage() {
    const pathname = window.location.pathname;
    return pathname.includes('/atendimento-web') || pathname === '/atendimento-web';
  }

  function getConversationId() {
    return new URL(window.location.href).searchParams.get('conversationId') || '';
  }

  function hasValidConversation() {
    return isAtendimentoPage() && getConversationId() !== '';
  }

  function getLeadNameFromDom() {
    const el = document.querySelector(LEAD_NAME_SELECTOR);
    return el ? el.textContent.trim() : '';
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
  }

  function autoFillLeadName() {
    const el = document.getElementById('tfq-nome_lead');
    if (el && el.value === '') {
      const name = getLeadNameFromDom();
      if (name) el.value = name;
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
  }

  // ✅ CORRIGIDO: getElementById com template literal correta
  function getFormData() {
    const data = {
      id:              editingId || 0,
      conversation_id: getConversationId()
    };
    fields.forEach(field => {
      const el = document.getElementById(`tfq-${field.key}`);
      data[field.key] = el ? el.value.trim() : '';
    });
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

    if (editingId > 0 && item) {
      fillForm(item);
      if (getFormTitle())    getFormTitle().textContent    = 'Editando negócio';
      if (getEditingBadge()) getEditingBadge().textContent = `ID #${editingId}`;
      if (deleteBtn)         deleteBtn.disabled            = false;
    } else {
      clearForm();
      if (getFormTitle())    getFormTitle().textContent    = 'Novo negócio';
      if (getEditingBadge()) getEditingBadge().textContent = '';
      if (deleteBtn)         deleteBtn.disabled            = true;
    }
    markFormPristine();
  }

  function updateConversationIdUI() {
    const el = getConversationIdDisplay();
    if (el) el.textContent = getConversationId() || 'Não encontrado';
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

  /**
   * Busca todos os negócios do conversationId atual na API e atualiza o cache.
   *
   * @param {boolean} force      - Se true, ignora cache e recarrega do servidor.
   * @param {boolean} autoSelect - Se true, seleciona automaticamente o negócio
   *                               de maior ID ao terminar de carregar.
   *                               Deve ser true apenas em trocas de conversa,
   *                               não em recarregamentos manuais ou pós-salvar.
   */
  async function loadNegocios(force = false, autoSelect = false) {
    const conversationId = getConversationId();
    updateConversationIdUI();
    updatePanelTitle();

    if (!conversationId) {
      currentConversationId = '';
      negociosCache         = [];
      renderNegociosDropdown();
      setEditingState(0);
      setStatus('Aguardando seleção de conversa...', '');
      return;
    }

    if (!force && conversationId === currentConversationId && negociosCache.length) {
      renderNegociosDropdown();
      return;
    }

    currentConversationId = conversationId;
    setStatus('Carregando negócios...', '');

    try {
      const result = await fetchJson(
        `${API_BASE}/get_negocios.php?conversation_id=${encodeURIComponent(conversationId)}&_t=${Date.now()}`,
        { headers: apiHeaders() }
      );

      if (!result.success) {
        throw new Error(result.message || 'Erro ao buscar negócios.');
      }

      negociosCache = Array.isArray(result.data) ? result.data : [];
      renderNegociosDropdown();

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
      setStatus(
        count > 0 ? `${count} negócio(s) encontrado(s).` : 'Nenhum negócio salvo ainda.',
        'success'
      );

    } catch (error) {
      negociosCache = [];
      renderNegociosDropdown();
      setStatus(`Erro ao carregar: ${error.message}`, 'error');
    }
  }

  async function saveNegocio() {
    const payload = getFormData();

    if (!payload.conversation_id) {
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
    const conversationId = getConversationId();
    if (!editingId || !conversationId) {
      setStatus('Selecione um negócio para excluir.', 'error');
      return;
    }

    const ok = window.confirm('Deseja excluir este negócio?');
    if (!ok) return;

    try {
      setStatus('Excluindo negócio...', '');

      const result = await fetchJson(`${API_BASE}/delete_negocio.php`, {
        method:  'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify({ id: editingId, conversation_id: conversationId })
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
    editingId             = 0;
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
          <h2 id="tfq-title">Negócios do Lead</h2>
          <div id="tfq-subtitle">Conversation ID: <span id="tfq-conversation-id">-</span></div>
        </div>
        <button id="tfq-close" type="button" aria-label="Fechar painel">×</button>
      </div>

      <div id="tfq-not-configured" class="tfq-not-configured tfq-hidden">
        <p>⚠️ Extensão não configurada.</p>
        <p>Clique com o botão direito no ícone da extensão → <strong>Opções</strong> e preencha a URL do servidor e a API Key.</p>
        <button class="tfq-btn tfq-btn-primary tfq-btn-small" id="tfq-open-options" type="button">Abrir configurações</button>
      </div>

      <div id="tfq-tabs">
        <button class="tfq-tab tfq-tab-active" data-tab="negocios" type="button">📋 Negócios</button>
        <button class="tfq-tab" data-tab="campos" type="button">⚙️ Campos</button>
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

      if (!isConfigured()) {
        if (notConfiguredEl) notConfiguredEl.classList.remove('tfq-hidden');
        if (tabsEl)          tabsEl.classList.add('tfq-hidden');
        if (bodyEl)          bodyEl.classList.add('tfq-hidden');
        return;
      }

      if (notConfiguredEl) notConfiguredEl.classList.add('tfq-hidden');
      if (tabsEl)          tabsEl.classList.remove('tfq-hidden');
      if (bodyEl)          bodyEl.classList.remove('tfq-hidden');

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

      await loadFormFields();
      renderFormFields();
      loadNegocios(true);
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
    panel.querySelector('#tfq-reload').addEventListener('click', () => {
      if (!confirmDiscardChanges('Há alterações não salvas. Deseja recarregar e descartá-las?')) return;
      negociosCache         = [];
      currentConversationId = '';
      loadNegocios(true);
    });
    panel.querySelector('#tfq-cancel').addEventListener('click', () => {
      if (!confirmDiscardChanges()) return;
      setEditingState(0);
      const dd = getNegociosDropdown();
      if (dd) dd.value = '';
      setStatus('Formulário limpo.', '');
    });

    panel.querySelector('#tfq-add-field-btn').addEventListener('click', addField);
    panel.querySelector('#tfq-new-field-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') addField();
    });
    panel.querySelector('#tfq-new-field-type').addEventListener('change', e => {
      const row = panel.querySelector('#tfq-new-field-options-row');
      if (row) row.classList.toggle('tfq-hidden', e.target.value !== 'select');
    });

    updateConversationIdUI();
    panelInitialized = true;
  }

  function checkVisibility() {
    const currentId = getConversationId();

    if (currentId !== lastCheckedConversationId) {
      lastCheckedConversationId = currentId;

      const panel = getPanel();
      if (panel && panel.classList.contains('tfq-open') && currentId) {
        negociosCache         = [];
        currentConversationId = '';
        setEditingState(0);
        updatePanelTitle();
        loadNegocios(true, true); // autoSelect: troca de conversa
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
    if (!hasValidConversation()) {
      removePanel();
      return;
    }

    ensurePanel();

    const conversationId = getConversationId();
    if (getConversationIdDisplay()) updateConversationIdUI();
    updatePanelTitle();

    if (!conversationId) {
      currentConversationId = '';
      negociosCache         = [];
      if (getNegociosDropdown()) renderNegociosDropdown();
      setEditingState(0);
      return;
    }

    if (force || conversationId !== currentConversationId) {
      const isConversationChange = conversationId !== currentConversationId;
      currentConversationId = '';
      negociosCache         = [];
      setEditingState(0);
      loadNegocios(true, isConversationChange); // autoSelect só em troca real de conversa
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
      lastCheckedConversationId = getConversationId();
      checkVisibility();
      startVisibilityCheck();
      scheduleSync(true);
    });
  } else {
    lastCheckedConversationId = getConversationId();
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
