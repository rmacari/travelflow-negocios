/**
 * =============================================================================
 * Travel Flow Negocios — options.js
 * =============================================================================
 * Lógica da página de configuração da extensão Chrome.
 *
 * Responsabilidades:
 *   - Carregar configurações salvas do chrome.storage.sync ao abrir a página
 *   - Salvar URL do servidor e API Key no chrome.storage.sync
 *   - Testar a conexão com o servidor via get_negocios.php
 *   - Alternar visibilidade da API Key (mostrar/ocultar)
 *
 * As configurações ficam sincronizadas entre dispositivos do mesmo usuário
 * Chrome via chrome.storage.sync (limite de 8KB por item, suficiente).
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Travel Flow Negocios
 * =============================================================================
 */

// ---------------------------------------------------------------------------
// REFERÊNCIAS AOS ELEMENTOS DO DOM
// ---------------------------------------------------------------------------
const inputApiBase  = document.getElementById('api-base');
const inputApiKey   = document.getElementById('api-key');
const btnSave       = document.getElementById('btn-save');
const btnTest       = document.getElementById('btn-test');
const btnToggleKey  = document.getElementById('toggle-key-visibility');
const statusEl      = document.getElementById('opt-status');

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

// ---------------------------------------------------------------------------
// CARREGAR CONFIGURAÇÕES SALVAS
// Ao abrir a página de opções, preenche os campos com os valores salvos.
// ---------------------------------------------------------------------------

/**
 * Lê as configurações do chrome.storage.sync e preenche os inputs.
 * Chamada automaticamente ao carregar a página.
 */
function loadSettings() {
  chrome.storage.sync.get(['tfq_api_base', 'tfq_api_key'], result => {
    if (result.tfq_api_base) inputApiBase.value = result.tfq_api_base;
    if (result.tfq_api_key)  inputApiKey.value  = result.tfq_api_key;
  });
}

// ---------------------------------------------------------------------------
// SALVAR CONFIGURAÇÕES
// ---------------------------------------------------------------------------

/**
 * Valida e salva a URL do servidor e a API Key no chrome.storage.sync.
 * Exibe feedback de sucesso ou erro ao usuário.
 */
function saveSettings() {
  const apiBase = inputApiBase.value.trim().replace(/\/$/, ''); // remove barra final
  const apiKey  = inputApiKey.value.trim();

  // Validação básica da URL
  if (!apiBase) {
    setStatus('Informe a URL do servidor.', 'error');
    return;
  }

  try {
    new URL(apiBase); // lança exceção se URL inválida
  } catch {
    setStatus('URL do servidor inválida. Inclua https:// no início.', 'error');
    return;
  }

  if (!apiKey) {
    setStatus('Informe a API Key.', 'error');
    return;
  }

  btnSave.disabled = true;

  chrome.storage.sync.set({ tfq_api_base: apiBase, tfq_api_key: apiKey }, () => {
    if (chrome.runtime.lastError) {
      setStatus(`Erro ao salvar: ${chrome.runtime.lastError.message}`, 'error');
    } else {
      setStatus('Configurações salvas com sucesso! ✓', 'success');
    }
    btnSave.disabled = false;
  });
}

// ---------------------------------------------------------------------------
// TESTAR CONEXÃO
// Faz uma requisição de teste ao endpoint get_negocios.php com um
// conversation_id fictício para verificar se o servidor responde corretamente.
// ---------------------------------------------------------------------------

/**
 * Testa a conexão com o servidor usando as configurações atuais dos inputs.
 * Não exige que as configurações estejam salvas — usa os valores dos campos.
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
    // Testa com conversation_id fictício — o servidor deve responder com
    // success:true e data:[] (nenhum negócio encontrado), o que confirma
    // que o backend está acessível e o CORS está configurado corretamente.
    const response = await fetch(
      `${apiBase}/get_negocios.php?conversation_id=tfq_test_${Date.now()}`,
      {
        headers: { 'X-Api-Key': apiKey }
      }
    );

    if (!response.ok) {
      throw new Error(`Servidor retornou HTTP ${response.status}`);
    }

    const result = await response.json();

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
// ALTERNAR VISIBILIDADE DA API KEY
// ---------------------------------------------------------------------------

/**
 * Alterna o campo de API Key entre tipo password (oculto) e text (visível).
 */
function toggleKeyVisibility() {
  const isPassword = inputApiKey.type === 'password';
  inputApiKey.type          = isPassword ? 'text' : 'password';
  btnToggleKey.textContent  = isPassword ? '🙈' : '👁';
  btnToggleKey.title        = isPassword ? 'Ocultar chave' : 'Mostrar chave';
}

// ---------------------------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------------------------
btnSave.addEventListener('click', saveSettings);
btnTest.addEventListener('click', testConnection);
btnToggleKey.addEventListener('click', toggleKeyVisibility);

// Salva ao pressionar Enter em qualquer campo
inputApiBase.addEventListener('keydown', e => { if (e.key === 'Enter') saveSettings(); });
inputApiKey.addEventListener('keydown',  e => { if (e.key === 'Enter') saveSettings(); });

// Limpa o status ao editar qualquer campo
inputApiBase.addEventListener('input', clearStatus);
inputApiKey.addEventListener('input',  clearStatus);

// ---------------------------------------------------------------------------
// INICIALIZAÇÃO — carrega configurações ao abrir a página
// ---------------------------------------------------------------------------
loadSettings();
