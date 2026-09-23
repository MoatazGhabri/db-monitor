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

/** Send a platform event to the configured Slack / webhook endpoints (never throws). */
export async function notifyEvent(event, title, detail = '') {
  const n = getSettings().notifications;
  if (n.events && n.events[event] === false) return;
  const at = new Date().toISOString();
  const jobs = [];
  if (n.slack?.enabled && n.slack.url) jobs.push(post(n.slack.url, { text: `*DBHub — ${title}*${detail ? `\n${detail}` : ''}` }));
  if (n.webhook?.enabled && n.webhook.url) jobs.push(post(n.webhook.url, { source: 'dbhub', event, title, detail, at }));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') console.error('[notify] delivery failed:', r.reason?.message || r.reason);
}

/** Used by the "Send test" buttons in Settings. */
export async function sendTest(channel, url) {
  if (!url) throw new Error('Enter a URL first');
  if (channel === 'slack') await post(url, { text: '*DBHub* — test notification ✅' });
  else await post(url, { source: 'dbhub', event: 'test', title: 'Test notification', at: new Date().toISOString() });
}
