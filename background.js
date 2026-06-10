/**
 * Background service worker da extensão Zap Negócios.
 *
 * Mantém o clique no ícone útil: abre as opções quando a extensão ainda não
 * foi configurada e alterna o painel lateral quando o usuário está no CRM
 * ou no WhatsApp Web.
 */

const TRAVEL_FLOW_HOST = 'travelflow.tur.br';
const WHATSAPP_HOST = 'web.whatsapp.com';
const REMINDER_ALARM_NAME = 'tfq_task_reminders';
const REMINDER_INTERVAL_MINUTES = 5;
const REMINDER_LOOKAHEAD_MINUTES = 15;

function getUserConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['tfq_api_base', 'tfq_api_key'], syncResult => {
      chrome.storage.local.get(['tfq_auth_token'], localResult => {
        resolve({
          apiBase: (syncResult.tfq_api_base || '').trim(),
          apiKey:  (syncResult.tfq_api_key || '').trim(),
          token:   (localResult.tfq_auth_token || '').trim()
        });
      });
    });
  });
}

function isConfigured(config) {
  return Boolean(config.apiBase && config.apiKey && config.token);
}

function normalizeApiBase(apiBase) {
  return String(apiBase || '').trim().replace(/\/$/, '');
}

function scheduleReminderAlarm() {
  chrome.alarms.create(REMINDER_ALARM_NAME, {
    periodInMinutes: REMINDER_INTERVAL_MINUTES
  });
}

function notificationKey(task) {
  return `${task.id}:${task.due_at || ''}`;
}

function parseTaskDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTaskDue(value) {
  const date = parseTaskDate(value);
  if (!date) return 'Sem prazo definido';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

async function fetchReminderTasks(config) {
  const apiBase = normalizeApiBase(config.apiBase);
  const params = new URLSearchParams({
    action: 'reminders',
    minutes: String(REMINDER_LOOKAHEAD_MINUTES),
    _t: Date.now().toString()
  });

  const response = await fetch(`${apiBase}/tasks.php?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'X-Api-Key': config.apiKey,
      Authorization: `Bearer ${config.token}`
    }
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(result.message || `HTTP ${response.status}`);
  }

  return Array.isArray(result.tasks) ? result.tasks : [];
}

async function showTaskReminder(task, notifiedMap) {
  const key = notificationKey(task);
  if (notifiedMap[key]) return;

  const lead = task.lead_name || task.negocio_nome_lead || 'Lead';
  const negocio = task.negocio_destino ? ` • ${task.negocio_destino}` : '';
  const due = formatTaskDue(task.due_at);
  const notificationId = `tfq-task-${task.id}-${Math.abs(key.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0))}`;

  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: `Tarefa: ${task.title || 'sem título'}`,
    message: `${lead}${negocio}\nLembrete: ${due}`,
    priority: task.priority === 'alta' ? 2 : 1
  });

  notifiedMap[key] = Date.now();
}

async function checkTaskReminders() {
  const config = await getUserConfig();
  if (!isConfigured(config)) return;

  try {
    const tasks = await fetchReminderTasks(config);
    const stored = await chrome.storage.local.get(['tfq_notified_task_keys']);
    const notifiedMap = stored.tfq_notified_task_keys || {};
    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);

    Object.keys(notifiedMap).forEach(key => {
      if (Number(notifiedMap[key]) < cutoff) delete notifiedMap[key];
    });

    for (const task of tasks) {
      await showTaskReminder(task, notifiedMap);
    }

    await chrome.storage.local.set({ tfq_notified_task_keys: notifiedMap });
  } catch {
    // Falhas de rede ou sessão expirada não devem interromper o service worker.
  }
}

function isSupportedTab(tab) {
  try {
    const url = new URL(tab.url || '');
    return (
      (url.hostname === TRAVEL_FLOW_HOST && url.pathname.includes('/atendimento-web')) ||
      url.hostname === WHATSAPP_HOST
    );
  } catch {
    return false;
  }
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleReminderAlarm();
  checkTaskReminders();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleReminderAlarm();
  checkTaskReminders();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === REMINDER_ALARM_NAME) {
    checkTaskReminders();
  }
});

chrome.action.onClicked.addListener(async tab => {
  const config = await getUserConfig();

  if (!isConfigured(config)) {
    openOptions();
    return;
  }

  if (!tab || !tab.id || !isSupportedTab(tab)) {
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

  if (message && message.type === 'TFQ_REFRESH_REMINDERS') {
    scheduleReminderAlarm();
    checkTaskReminders();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

scheduleReminderAlarm();
