import { getSettings } from './context.js';

async function post(url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } finally {
    clearTimeout(timer);
  }
}

const TELEGRAM_API_URL = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';

/** Telegram Bot API: https://core.telegram.org/bots/api#sendmessage */
async function telegramSend(botToken, chatId, text) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${TELEGRAM_API_URL}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const data = await r.json().catch(() => null);
      throw new Error(data?.description || `Telegram HTTP ${r.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Send a platform event to every enabled channel (never throws — failures are only logged). */
export async function notifyEvent(event, title, detail = '') {
  const n = getSettings().notifications;
  if (n.events && n.events[event] === false) return;
  const at = new Date().toISOString();
  const text = `DBHub — ${title}${detail ? `\n${detail}` : ''}`;
  const jobs = [];
  if (n.telegram?.enabled && n.telegram.botToken && n.telegram.chatId) jobs.push(telegramSend(n.telegram.botToken, n.telegram.chatId, text));
  if (n.slack?.enabled && n.slack.url) jobs.push(post(n.slack.url, { text: `*DBHub — ${title}*${detail ? `\n${detail}` : ''}` }));
  if (n.webhook?.enabled && n.webhook.url) jobs.push(post(n.webhook.url, { source: 'dbhub', event, title, detail, at }));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') console.error('[notify] delivery failed:', r.reason?.message || r.reason);
}

/** Used by the "Send test" buttons in Settings. Throws with a user-facing message on failure. */
export async function sendTest(channel, params) {
  if (channel === 'telegram') {
    const { botToken, chatId } = params;
    if (!botToken || !chatId) throw new Error('Enter both the bot token and the chat ID');
    await telegramSend(botToken, chatId, 'DBHub — test notification ✅');
    return;
  }
  const { url } = params;
  if (!url) throw new Error('Enter a URL first');
  if (channel === 'slack') await post(url, { text: '*DBHub* — test notification ✅' });
  else await post(url, { source: 'dbhub', event: 'test', title: 'Test notification', at: new Date().toISOString() });
}
