/**
 * Background service worker da extensão Travel Flow Negócios.
 *
 * Mantém o clique no ícone útil: abre as opções quando a extensão ainda não
 * foi configurada e alterna o painel lateral quando o usuário está no CRM.
 */

const TRAVEL_FLOW_HOST = 'travelflow.tur.br';

function getUserConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['tfq_api_base', 'tfq_api_key'], result => {
      resolve({
        apiBase: (result.tfq_api_base || '').trim(),
        apiKey:  (result.tfq_api_key || '').trim()
      });
    });
  });
}

function isConfigured(config) {
  return Boolean(config.apiBase && config.apiKey);
}

function isTravelFlowTab(tab) {
  try {
    const url = new URL(tab.url || '');
    return url.hostname === TRAVEL_FLOW_HOST && url.pathname.includes('/atendimento-web');
  } catch {
    return false;
  }
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

chrome.action.onClicked.addListener(async tab => {
  const config = await getUserConfig();

  if (!isConfigured(config)) {
    openOptions();
    return;
  }

  if (!tab || !tab.id || !isTravelFlowTab(tab)) {
    openOptions();
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'TFQ_TOGGLE_PANEL' }, response => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      openOptions();
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'TFQ_OPEN_OPTIONS') {
    openOptions();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
