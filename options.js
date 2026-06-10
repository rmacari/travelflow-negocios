/**
 * =============================================================================
 * Zap Negócios — options.js
 * =============================================================================
 * Lógica da página de configuração da extensão Chrome.
 *
 * Responsabilidades:
 *   - Carregar configurações salvas do chrome.storage.sync ao abrir a página
 *   - Salvar URL do servidor, API Key e Admin Key no chrome.storage.sync
 *   - Testar a conexão com o servidor via get_negocios.php
 *   - Alternar visibilidade dos campos de chave (mostrar/ocultar)
 *
 * Chaves armazenadas:
 *   tfq_api_base   — URL do servidor backend
 *   tfq_api_key    — Chave de API (todos os usuários)
 *   tfq_admin_key  — Chave de administrador (habilita aba ⚙️ Campos)
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Zap Negócios
 * =============================================================================
 */

// ---------------------------------------------------------------------------
// REFERÊNCIAS AOS ELEMENTOS DO DOM
// ---------------------------------------------------------------------------
const inputApiBase   = document.getElementById('api-base');
const inputApiKey    = document.getElementById('api-key');
const inputAdminKey  = document.getElementById('admin-key');
const btnSave        = document.getElementById('btn-save');
const btnTest        = document.getElementById('btn-test');
const btnToggleApi   = document.getElementById('toggle-api-key');
const btnToggleAdmin = document.getElementById('toggle-admin-key');
const statusEl       = document.getElementById('opt-status');

// ---------------------------------------------------------------------------
// HELPERS DE FEEDBACK
// ---------------------------------------------------------------------------

/**
 * Exibe uma mensagem de status abaixo dos botões de ação.
 * @param {string} message - Texto a exibir.
 * @param {'success'|'error'|'info'} type - Classe visual do status.
 */
function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className   = `opt-status opt-status-${type}`;
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className   = 'opt-status';
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
            ? 'Resposta inválida do servidor. Confira se a URL aponta para a pasta dos arquivos PHP.'
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
      throw new Error('Tempo de conexão esgotado. Verifique se o servidor está acessível.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// CARREGAR CONFIGURAÇÕES SALVAS
// ---------------------------------------------------------------------------

/**
 * Lê as configurações do chrome.storage.sync e preenche os inputs.
 * Chamada automaticamente ao carregar a página.
 */
function loadSettings() {
  chrome.storage.sync.get(['tfq_api_base', 'tfq_api_key', 'tfq_admin_key'], result => {
    if (result.tfq_api_base)  inputApiBase.value  = result.tfq_api_base;
    if (result.tfq_api_key)   inputApiKey.value   = result.tfq_api_key;
    if (result.tfq_admin_key) inputAdminKey.value = result.tfq_admin_key;
  });
}

// ---------------------------------------------------------------------------
// SALVAR CONFIGURAÇÕES
// ---------------------------------------------------------------------------

/**
 * Valida e salva URL, API Key e Admin Key no chrome.storage.sync.
 * A Admin Key é opcional — pode ser deixada em branco por usuários comuns.
 */
function saveSettings() {
  const apiBase  = inputApiBase.value.trim().replace(/\/$/, '');
  const apiKey   = inputApiKey.value.trim();
  const adminKey = inputAdminKey.value.trim();

  // Validação da URL
  if (!apiBase) {
    setStatus('Informe a URL do servidor.', 'error');
    return;
  }

  try {
    new URL(apiBase);
  } catch {
    setStatus('URL do servidor inválida. Inclua https:// no início.', 'error');
    return;
  }

  if (!apiKey) {
    setStatus('Informe a API Key.', 'error');
    return;
  }

  btnSave.disabled = true;

  // Salva as três chaves — adminKey pode ser string vazia (usuário comum)
  chrome.storage.sync.set({
    tfq_api_base:  apiBase,
    tfq_api_key:   apiKey,
    tfq_admin_key: adminKey
  }, () => {
    if (chrome.runtime.lastError) {
      setStatus(`Erro ao salvar: ${chrome.runtime.lastError.message}`, 'error');
    } else {
      const adminMsg = adminKey
        ? ' Acesso de administrador ativado.'
        : ' Acesso de administrador não configurado (somente negócios).';
      setStatus(`Configurações salvas com sucesso! ✓${adminMsg}`, 'success');
    }
    btnSave.disabled = false;
  });
}

// ---------------------------------------------------------------------------
// TESTAR CONEXÃO
// ---------------------------------------------------------------------------

/**
 * Testa a conexão com o servidor usando as configurações atuais dos inputs.
 * Usa get_negocios.php com conversation_id fictício — não requer Admin Key.
 */
async function testConnection() {
  const apiBase = inputApiBase.value.trim().replace(/\/$/, '');
  const apiKey  = inputApiKey.value.trim();

  if (!apiBase || !apiKey) {
    setStatus('Preencha a URL do servidor e a API Key antes de testar.', 'error');
    return;
  }

  btnTest.disabled = true;
  setStatus('Testando conexão...', 'info');

  try {
    const result = await fetchJson(
      `${apiBase}/get_negocios.php?conversation_id=tfq_test_${Date.now()}`,
      { headers: { 'X-Api-Key': apiKey } }
    );

    if (result.success !== undefined) {
      setStatus('Conexão bem-sucedida! O servidor está respondendo corretamente. ✓', 'success');
    } else {
      throw new Error('Resposta inesperada do servidor.');
    }
  } catch (error) {
    setStatus(`Falha na conexão: ${error.message}. Verifique a URL e se o servidor está acessível.`, 'error');
  } finally {
    btnTest.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// ALTERNAR VISIBILIDADE DAS CHAVES
// ---------------------------------------------------------------------------

/**
 * Alterna um campo entre tipo password (oculto) e text (visível).
 * @param {HTMLInputElement} input   - Campo a alternar.
 * @param {HTMLButtonElement} button - Botão de toggle correspondente.
 */
function toggleVisibility(input, button) {
  const isPassword  = input.type === 'password';
  input.type        = isPassword ? 'text' : 'password';
  button.textContent = isPassword ? '🙈' : '👁';
  button.title       = isPassword ? 'Ocultar chave' : 'Mostrar chave';
}

// ---------------------------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------------------------
btnSave.addEventListener('click', saveSettings);
btnTest.addEventListener('click', testConnection);
btnToggleApi.addEventListener('click',   () => toggleVisibility(inputApiKey,   btnToggleApi));
btnToggleAdmin.addEventListener('click', () => toggleVisibility(inputAdminKey, btnToggleAdmin));

// Salva ao pressionar Enter em qualquer campo
[inputApiBase, inputApiKey, inputAdminKey].forEach(input => {
  input.addEventListener('keydown', e => { if (e.key === 'Enter') saveSettings(); });
  input.addEventListener('input',   clearStatus);
});

// ---------------------------------------------------------------------------
// INICIALIZAÇÃO
// ---------------------------------------------------------------------------
loadSettings();
