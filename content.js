/**
 * =============================================================================
 * Travel Flow Negocios — content.js
 * =============================================================================
 */
(function () {

  const PANEL_ID           = 'tfq-panel';
  const TOGGLE_ID          = 'tfq-toggle';
  const LEAD_NAME_SELECTOR = 'h3.font-semibold';

  let API_BASE = '';
  let API_KEY  = '';

  function loadUserConfig() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get(['tfq_api_base', 'tfq_api_key'], result => {
          API_BASE = (result.tfq_api_base || '').trim().replace(/\/$/, '');
          API_KEY  = (result.tfq_api_key  || '').trim();
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

  const fields = [
    { key: 'nome_lead',        label: 'Nome do Lead',               type: 'text',     auto: true },
    { key: 'email',            label: 'Email',                      type: 'text' },
    { key: 'destino',          label: 'Destino',                    type: 'text' },
    { key: 'data_viagem',      label: 'Data da Viagem',             type: 'text' },
    { key: 'duracao_viagem',   label: 'Duração da Viagem',          type: 'text' },
    { key: 'numero_viajantes', label: 'Nº de Viajantes',            type: 'text' },
    { key: 'idade_viajantes',  label: 'Idade dos Viajantes',        type: 'text' },
    { key: 'cidade_origem',    label: 'Cidade de Origem',           type: 'text' },
    { key: 'orcamento',        label: 'Orçamento',                  type: 'text' },
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

  let currentConversationId     = '';
  let panelInitialized          = false;
  let syncScheduled             = false;
  let negociosCache             = [];
  let editingId                 = 0;
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
    const autoHint = field.auto
      ? '<span class="tfq-auto-hint" title="Preenchido automaticamente">⚡</span>'
      : '';

    if (field.type === 'select') {
      return `
        <div class="tfq-row">
          <label class="tfq-label" for="tfq-${field.key}">${field.label}${autoHint}</label>
          <select class="tfq-select" id="tfq-${field.key}">
            ${field.options.map(option =>
              `<option value="${escapeHtml(option)}">${escapeHtml(option || 'Selecione')}</option>`
            ).join('')}
          </select>
        </div>
      `;
    }

    if (field.type === 'textarea') {
      return `
        <div class="tfq-row">
          <label class="tfq-label" for="tfq-${field.key}">${field.label}${autoHint}</label>
          <textarea class="tfq-textarea" id="tfq-${field.key}" rows="4"></textarea>
        </div>
      `;
    }

    return `
      <div class="tfq-row">
        <label class="tfq-label" for="tfq-${field.key}">${field.label}${autoHint}</label>
        <input class="tfq-input" id="tfq-${field.key}" type="text" />
      </div>
    `;
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
  }

  function updateConversationIdUI() {
    const el = getConversationIdDisplay();
    if (el) el.textContent = getConversationId() || 'Não encontrado';
  }

  function renderNegociosDropdown() {
    const dropdown = getNegociosDropdown();
    if (!dropdown) return;

    const options = ['<option value="">-- Novo negócio --</option>'];
    negociosCache.forEach(item => {
      const label = `#${item.id} - ${item.nome_lead || 'Sem nome'}`;
      options.push(`<option value="${item.id}">${escapeHtml(label)}</option>`);
    });
    dropdown.innerHTML = options.join('');
    dropdown.value = editingId > 0 ? editingId : '';
  }

  function onNegocioSelected() {
    const dropdown = getNegociosDropdown();
    if (!dropdown) return;

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

  async function loadNegocios(force = false) {
    const conversationId = getConversationId();
    updateConversationIdUI();

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
      const response = await fetch(
        `${API_BASE}/get_negocios.php?conversation_id=${encodeURIComponent(conversationId)}&_t=${Date.now()}`
      );
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Erro ao buscar negócios.');
      }

      negociosCache = Array.isArray(result.data) ? result.data : [];
      renderNegociosDropdown();

      if (editingId > 0) {
        const active = negociosCache.find(item => Number(item.id) === editingId);
        if (active) {
          fillForm(active);
        } else {
          setEditingState(0);
        }
      } else {
        clearForm();
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

      const response = await fetch(`${API_BASE}/save_negocio.php`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      const result = await response.json();

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

      const response = await fetch(`${API_BASE}/delete_negocio.php`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: editingId, conversation_id: conversationId })
      });
      const result = await response.json();

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

    stopVisibilityCheck();
    panelInitialized      = false;
    currentConversationId = '';
    negociosCache         = [];
    editingId             = 0;
  }

  async function loadFields() {
    const statusEl = document.getElementById('tfq-fields-status');
    if (statusEl) { statusEl.textContent = 'Carregando campos...'; statusEl.className = ''; }

    try {
      const response = await fetch(`${API_BASE}/get_fields.php`, {
        headers: { 'X-Api-Key': API_KEY }
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Erro ao buscar campos.');

      const savedOrder = await getSavedFieldOrder();
      const dbFields   = result.fields;

      let ordered = [];
      if (savedOrder.length > 0) {
        savedOrder.forEach(name => {
          const f = dbFields.find(x => x.name === name);
          if (f) ordered.push(f);
        });
        dbFields.forEach(f => {
          if (!ordered.find(x => x.name === f.name)) ordered.push(f);
        });
      } else {
        ordered = dbFields;
      }

      renderFieldsList(ordered);
      if (statusEl) { statusEl.textContent = `${ordered.length} campo(s) encontrado(s).`; statusEl.className = 'success'; }

    } catch (error) {
      if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
    }
  }

  function getSavedFieldOrder() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(['tfq_field_order', 'tfq_field_labels'], result => {
          resolve(result.tfq_field_order || []);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }

  function getSavedFieldLabels() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(['tfq_field_labels'], result => {
          resolve(result.tfq_field_labels || {});
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  function saveFieldConfig(order, labels) {
    try {
      chrome.storage.local.set({ tfq_field_order: order, tfq_field_labels: labels });
    } catch (e) { /* storage indisponível */ }
  }

  async function renderFieldsList(fieldsList) {
    const container = document.getElementById('tfq-fields-list');
    if (!container) return;

    const savedLabels = await getSavedFieldLabels();

    if (fieldsList.length === 0) {
      container.innerHTML = '<div class="tfq-empty">Nenhum campo encontrado.</div>';
      return;
    }

    container.innerHTML = fieldsList.map((field, index) => {
      const label     = savedLabels[field.name] || field.name;
      const isFirst   = index === 0;
      const isLast    = index === fieldsList.length - 1;
      const removable = field.removable;

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
            </div>
          </div>
          <div class="tfq-item-actions">
            <button class="tfq-mini-btn tfq-field-save-label" data-name="${escapeHtml(field.name)}" title="Salvar rótulo">✓</button>
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
        await persistFieldOrder(reordered);
        renderFieldsList(reordered);
      });
    });

    container.querySelectorAll('.tfq-field-down').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.index);
        if (idx >= fieldsList.length - 1) return;
        const reordered = [...fieldsList];
        [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
        await persistFieldOrder(reordered);
        renderFieldsList(reordered);
      });
    });

    container.querySelectorAll('.tfq-field-save-label').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name     = btn.dataset.name;
        const input    = container.querySelector(`.tfq-field-label-input[data-name="${name}"]`);
        const newLabel = input ? input.value.trim() : '';
        if (!newLabel) return;
        const labels   = await getSavedFieldLabels();
        labels[name]   = newLabel;
        const order    = fieldsList.map(f => f.name);
        saveFieldConfig(order, labels);
        const statusEl = document.getElementById('tfq-fields-status');
        if (statusEl) { statusEl.textContent = `Rótulo de "${name}" salvo.`; statusEl.className = 'success'; }
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
          const response = await fetch(`${API_BASE}/remove_field.php`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
            body:    JSON.stringify({ field_name: name })
          });
          const result = await response.json();
          if (!result.success) throw new Error(result.message);

          const labels   = await getSavedFieldLabels();
          delete labels[name];
          const newOrder = fieldsList.filter(f => f.name !== name).map(f => f.name);
          saveFieldConfig(newOrder, labels);

          if (statusEl) { statusEl.textContent = result.message; statusEl.className = 'success'; }
          await loadFields();

        } catch (error) {
          if (statusEl) { statusEl.textContent = `Erro: ${error.message}`; statusEl.className = 'error'; }
        }
      });
    });
  }

  async function persistFieldOrder(orderedFields) {
    const labels = await getSavedFieldLabels();
    saveFieldConfig(orderedFields.map(f => f.name), labels);
  }

  async function addField() {
    const input     = document.getElementById('tfq-new-field-name');
    const statusEl  = document.getElementById('tfq-fields-status');
    const fieldName = input ? input.value.trim().toLowerCase().replace(/\s+/g, '_') : '';

    if (!fieldName) {
      if (statusEl) { statusEl.textContent = 'Informe um nome para o campo.'; statusEl.className = 'error'; }
      return;
    }

    const addBtn = document.getElementById('tfq-add-field-btn');
    if (addBtn) addBtn.disabled = true;

    try {
      if (statusEl) { statusEl.textContent = 'Adicionando campo...'; statusEl.className = ''; }

      const response = await fetch(`${API_BASE}/add_field.php`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
        body:    JSON.stringify({ field_name: fieldName })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message);

      if (input) input.value = '';
      if (statusEl) { statusEl.textContent = result.message; statusEl.className = 'success'; }
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
            <div class="tfq-actions">
              <button class="tfq-btn tfq-btn-primary" id="tfq-add-field-btn" type="button">Adicionar campo</button>
            </div>
          </section>

          <section class="tfq-card">
            <h3>Campos do formulário</h3>
            <p class="tfq-fields-hint">Use ↑↓ para reordenar. Edite o rótulo e clique ✓ para salvar. Campos padrão não podem ser removidos.</p>
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

      if (!isConfigured()) {
        if (notConfiguredEl) notConfiguredEl.classList.remove('tfq-hidden');
        if (tabsEl)          tabsEl.classList.add('tfq-hidden');
        if (bodyEl)          bodyEl.classList.add('tfq-hidden');
        return;
      }

      if (notConfiguredEl) notConfiguredEl.classList.add('tfq-hidden');
      if (tabsEl)          tabsEl.classList.remove('tfq-hidden');
      if (bodyEl)          bodyEl.classList.remove('tfq-hidden');

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

    panel.querySelector('#tfq-close').addEventListener('click', closePanel);
    panel.querySelector('#tfq-save').addEventListener('click', saveNegocio);
    panel.querySelector('#tfq-delete').addEventListener('click', deleteNegocio);
    panel.querySelector('#tfq-reload').addEventListener('click', () => {
      negociosCache         = [];
      currentConversationId = '';
      loadNegocios(true);
    });
    panel.querySelector('#tfq-cancel').addEventListener('click', () => {
      setEditingState(0);
      const dd = getNegociosDropdown();
      if (dd) dd.value = '';
      setStatus('Formulário limpo.', '');
    });

    panel.querySelector('#tfq-add-field-btn').addEventListener('click', addField);
    panel.querySelector('#tfq-new-field-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') addField();
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
        loadNegocios(true);
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

    if (!conversationId) {
      currentConversationId = '';
      negociosCache         = [];
      if (getNegociosDropdown()) renderNegociosDropdown();
      setEditingState(0);
      return;
    }

    if (force || conversationId !== currentConversationId) {
      currentConversationId = '';
      negociosCache         = [];
      setEditingState(0);
      loadNegocios(true);
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

  window.addEventListener('tfq:conversation-change', () => {
    checkVisibility();
    scheduleSync(true);
  });

  window.addEventListener('focus', () => {
    checkVisibility();
    scheduleSync(false);
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