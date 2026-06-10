/**
 * =============================================================================
 * Zap Negócios — options.js
 * =============================================================================
 * Configuração da conexão e login do usuário.
 * =============================================================================
 */

const inputApiBase    = document.getElementById('api-base');
const inputApiKey     = document.getElementById('api-key');
const inputUsername   = document.getElementById('username');
const inputPassword   = document.getElementById('password');
const btnSave         = document.getElementById('btn-save');
const btnLogin        = document.getElementById('btn-login');
const btnLogout       = document.getElementById('btn-logout');
const btnTest         = document.getElementById('btn-test');
const btnToggleApi    = document.getElementById('toggle-api-key');
const btnTogglePass   = document.getElementById('toggle-password');
const statusEl        = document.getElementById('opt-status');
const currentUserEl   = document.getElementById('current-user');

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className   = `opt-status opt-status-${type}`;
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className   = 'opt-status';
}

function roleLabel(role) {
  return {
    viewer: 'Viewer',
    editor: 'Editor',
    admin: 'Admin',
    owner: 'Owner'
  }[role] || role || '-';
}

function setCurrentUser(user) {
  if (!currentUserEl) return;

  if (!user) {
    currentUserEl.textContent = 'Nenhum usuário logado.';
    currentUserEl.className = 'opt-status opt-status-info';
    return;
  }

  const name = user.full_name || user.username;
  currentUserEl.textContent = `Logado como ${name} (${roleLabel(user.role)}).`;
  currentUserEl.className = 'opt-status opt-status-success';
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

function getConnectionInputs() {
  const apiBase = inputApiBase.value.trim().replace(/\/$/, '');
  const apiKey  = inputApiKey.value.trim();

  if (!apiBase) {
    throw new Error('Informe a URL do servidor.');
  }

  try {
    new URL(apiBase);
  } catch {
    throw new Error('URL do servidor inválida. Inclua https:// no início.');
  }

  if (!apiKey) {
    throw new Error('Informe a API Key.');
  }

  return { apiBase, apiKey };
}

function saveConnection() {
  try {
    const { apiBase, apiKey } = getConnectionInputs();
    const username = inputUsername.value.trim();

    btnSave.disabled = true;
    chrome.storage.sync.set({
      tfq_api_base: apiBase,
      tfq_api_key: apiKey,
      tfq_username: username
    }, () => {
      if (chrome.runtime.lastError) {
        setStatus(`Erro ao salvar: ${chrome.runtime.lastError.message}`, 'error');
      } else {
        setStatus('Conexão salva com sucesso.', 'success');
      }
      btnSave.disabled = false;
    });
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function loadSettings() {
  chrome.storage.sync.get(['tfq_api_base', 'tfq_api_key', 'tfq_username'], syncResult => {
    if (syncResult.tfq_api_base) inputApiBase.value = syncResult.tfq_api_base;
    if (syncResult.tfq_api_key) inputApiKey.value = syncResult.tfq_api_key;
    if (syncResult.tfq_username) inputUsername.value = syncResult.tfq_username;
  });

  chrome.storage.local.get(['tfq_user'], localResult => {
    setCurrentUser(localResult.tfq_user || null);
  });
}

async function login() {
  let apiBase;
  let apiKey;

  try {
    ({ apiBase, apiKey } = getConnectionInputs());
  } catch (error) {
    setStatus(error.message, 'error');
    return;
  }

  const username = inputUsername.value.trim();
  const password = inputPassword.value;

  if (!username || !password) {
    setStatus('Informe usuário e senha.', 'error');
    return;
  }

  btnLogin.disabled = true;
  setStatus('Entrando...', 'info');

  try {
    const result = await fetchJson(`${apiBase}/login.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({ username, password })
    });

    await chrome.storage.sync.set({
      tfq_api_base: apiBase,
      tfq_api_key: apiKey,
      tfq_username: username
    });

    await chrome.storage.local.set({
      tfq_auth_token: result.token,
      tfq_user: result.user
    });

    inputPassword.value = '';
    setCurrentUser(result.user);
    setStatus(result.message || 'Login realizado com sucesso.', 'success');
    chrome.runtime.sendMessage({ type: 'TFQ_REFRESH_REMINDERS' });
  } catch (error) {
    setStatus(`Falha no login: ${error.message}`, 'error');
  } finally {
    btnLogin.disabled = false;
  }
}

async function logout() {
  const apiBase = inputApiBase.value.trim().replace(/\/$/, '');
  const apiKey = inputApiKey.value.trim();

  btnLogout.disabled = true;
  setStatus('Saindo...', 'info');

  try {
    const stored = await chrome.storage.local.get(['tfq_auth_token']);
    if (apiBase && apiKey && stored.tfq_auth_token) {
      await fetchJson(`${apiBase}/logout.php`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          Authorization: `Bearer ${stored.tfq_auth_token}`
        }
      });
    }
  } catch {
    // Mesmo se o servidor falhar, remove a sessão local.
  }

  await chrome.storage.local.remove(['tfq_auth_token', 'tfq_user', 'tfq_notified_task_keys']);
  setCurrentUser(null);
  setStatus('Sessão local encerrada.', 'success');
  btnLogout.disabled = false;
}

async function testConnection() {
  let apiBase;
  let apiKey;

  try {
    ({ apiBase, apiKey } = getConnectionInputs());
  } catch (error) {
    setStatus(error.message, 'error');
    return;
  }

  const stored = await chrome.storage.local.get(['tfq_auth_token']);
  if (!stored.tfq_auth_token) {
    setStatus('Faça login antes de testar a sessão.', 'error');
    return;
  }

  btnTest.disabled = true;
  setStatus('Testando sessão...', 'info');

  try {
    const result = await fetchJson(`${apiBase}/me.php?_t=${Date.now()}`, {
      headers: {
        'X-Api-Key': apiKey,
        Authorization: `Bearer ${stored.tfq_auth_token}`
      }
    });

    await chrome.storage.local.set({ tfq_user: result.user });
    setCurrentUser(result.user);
    setStatus('Sessão válida. O servidor está respondendo corretamente.', 'success');
  } catch (error) {
    setStatus(`Falha na sessão: ${error.message}`, 'error');
  } finally {
    btnTest.disabled = false;
  }
}

function toggleVisibility(input, button) {
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  button.textContent = isPassword ? '🙈' : '👁';
  button.title = isPassword ? 'Ocultar' : 'Mostrar';
}

btnSave.addEventListener('click', saveConnection);
btnLogin.addEventListener('click', login);
btnLogout.addEventListener('click', logout);
btnTest.addEventListener('click', testConnection);
btnToggleApi.addEventListener('click', () => toggleVisibility(inputApiKey, btnToggleApi));
btnTogglePass.addEventListener('click', () => toggleVisibility(inputPassword, btnTogglePass));

[inputApiBase, inputApiKey, inputUsername, inputPassword].forEach(input => {
  input.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  input.addEventListener('input', clearStatus);
});

loadSettings();
