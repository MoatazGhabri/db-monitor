import { useState, useEffect, useCallback } from 'react';
import {
  User, Bell, Sliders, Info, Save, CheckCircle2, AlertCircle, Loader2, Send, Server, ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, Badge, Button, PageHeader } from '@/components/ui';
import { fetchSettings, saveSettings, testNotification, type Settings, type SystemInfo } from '@/lib/api';

type Tab = 'profile' | 'notifications' | 'preferences' | 'system';

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchSettings().then((r) => { setSettings(r.settings); setSystem(r.system); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (patch: Partial<Settings>) => {
    setSaving(true);
    setError(null);
    try {
      const r = await saveSettings(patch);
      setSettings(r.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <div className="py-24 text-center animate-fade-in"><Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" /><p className="text-sm text-ink-400">Loading settings…</p></div>;
  }

  const tabs: { key: Tab; label: string; icon: typeof User }[] = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'preferences', label: 'Preferences', icon: Sliders },
    { key: 'system', label: 'System', icon: Info },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Platform configuration"
        actions={saved ? <Badge tone="green"><CheckCircle2 className="w-3 h-3" />Saved</Badge> : undefined}
      />
      {error && <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

      <div className="flex gap-3">
        <div className="w-44 shrink-0 hidden sm:block">
          <Card className="p-1.5">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-blue-50 text-blue-700' : 'text-ink-500 hover:bg-ink-50'}`}>
                <t.icon className="w-4 h-4" />{t.label}
              </button>
            ))}
          </Card>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex sm:hidden items-center gap-1 mb-2 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-white border border-ink-200 text-ink-600'}`}>{t.label}</button>
            ))}
          </div>

          {tab === 'profile' && <ProfileTab settings={settings} system={system} saving={saving} onSave={save} />}
          {tab === 'notifications' && <NotificationsTab settings={settings} saving={saving} onSave={save} />}
          {tab === 'preferences' && <PreferencesTab settings={settings} saving={saving} onSave={save} />}
          {tab === 'system' && <SystemTab system={system} />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ settings, system, saving, onSave }: { settings: Settings; system: SystemInfo | null; saving: boolean; onSave: (p: Partial<Settings>) => void }) {
  const [name, setName] = useState(settings.profile.name);
  const [email, setEmail] = useState(settings.profile.email);
  const [role, setRole] = useState(settings.profile.role);
  const [timezone, setTimezone] = useState(settings.profile.timezone);

  return (
    <Card>
      <CardHeader title="Profile" subtitle="Shown across DBHub and used as the default schedule time zone" />
      <div className="p-5 space-y-4 max-w-md">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-lg font-semibold shrink-0">
            {(name || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div><p className="text-sm font-medium text-ink-800">{name || 'Administrator'}</p><p className="text-xs text-ink-400">{role}</p></div>
        </div>
        <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
        <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
        <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Role</label><input value={role} onChange={(e) => setRole(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1.5">Time zone</label>
          <input list="tz-list" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <datalist id="tz-list">{(system?.timezones ?? []).map((z) => <option key={z} value={z} />)}</datalist>
          <p className="text-[11px] text-ink-400 mt-1">Used as the default time zone for new backup schedules.</p>
        </div>
        <Button variant="primary" icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} onClick={() => onSave({ profile: { name, email, role, timezone } })}>Save</Button>
      </div>
    </Card>
  );
}

function NotificationsTab({ settings, saving, onSave }: { settings: Settings; saving: boolean; onSave: (p: Partial<Settings>) => void }) {
  const [telegram, setTelegram] = useState(settings.notifications.telegram);
  const [slack, setSlack] = useState(settings.notifications.slack);
  const [webhook, setWebhook] = useState(settings.notifications.webhook);
  const [events, setEvents] = useState(settings.notifications.events);
  const [testing, setTesting] = useState<'telegram' | 'slack' | 'webhook' | null>(null);
  const [testMsg, setTestMsg] = useState<{ channel: string; ok: boolean; message: string } | null>(null);

  const testTelegram = async () => {
    setTesting('telegram');
    setTestMsg(null);
    try { await testNotification('telegram', { botToken: telegram.botToken, chatId: telegram.chatId }); setTestMsg({ channel: 'telegram', ok: true, message: 'Test message sent — check Telegram' }); }
    catch (err) { setTestMsg({ channel: 'telegram', ok: false, message: err instanceof Error ? err.message : 'Failed to send' }); }
    finally { setTesting(null); }
  };
  const testUrlChannel = async (channel: 'slack' | 'webhook', url: string) => {
    setTesting(channel);
    setTestMsg(null);
    try { await testNotification(channel, { url }); setTestMsg({ channel, ok: true, message: 'Test notification sent' }); }
    catch (err) { setTestMsg({ channel, ok: false, message: err instanceof Error ? err.message : 'Failed to send' }); }
    finally { setTesting(null); }
  };

  const eventLabels: { key: keyof typeof events; label: string }[] = [
    { key: 'connectionDown', label: 'A database connection goes offline' },
    { key: 'backupFailed', label: 'A backup fails' },
    { key: 'backupSucceeded', label: 'A backup completes successfully (path, size, and where it was saved)' },
    { key: 'diskFull', label: 'The server disk is almost full' },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Telegram"
          subtitle="A bot messages you directly — no server or app needed on your side"
          action={<label className="flex items-center gap-2 cursor-pointer text-xs text-ink-500"><input type="checkbox" checked={telegram.enabled} onChange={(e) => setTelegram({ ...telegram, enabled: e.target.checked })} className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />Enabled</label>}
        />
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="mb-1">To set this up:</p>
              <ul className="space-y-0.5 list-disc list-inside marker:text-blue-400">
                <li>In Telegram, message <span className="font-mono">@BotFather</span> → <span className="font-mono">/newbot</span> → follow the prompts. It gives you a token like <span className="font-mono">123456:ABC-def…</span>.</li>
                <li>Start a chat with your new bot (search its username and press Start), or add it to a group.</li>
                <li>Get your chat ID: message <span className="font-mono">@userinfobot</span> (for a personal chat) or add <span className="font-mono">@RawDataBot</span> to your group briefly — it replies with the numeric ID.</li>
              </ul>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Bot token</label>
            <input type="text" value={telegram.botToken} onChange={(e) => setTelegram({ ...telegram, botToken: e.target.value })} placeholder="123456789:AAH4mss4jbjQ…" disabled={!telegram.enabled} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Chat ID</label>
            <input type="text" value={telegram.chatId} onChange={(e) => setTelegram({ ...telegram, chatId: e.target.value })} placeholder="123456789" disabled={!telegram.enabled} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50" />
          </div>
          {testMsg?.channel === 'telegram' && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${testMsg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
              {testMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}{testMsg.message}
            </div>
          )}
          <Button variant="secondary" size="sm" icon={testing === 'telegram' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} disabled={!telegram.botToken || !telegram.chatId || testing !== null} onClick={testTelegram}>Send test</Button>
        </div>
      </Card>

      {[{ key: 'slack' as const, label: 'Slack', value: slack, set: setSlack, placeholder: 'https://hooks.slack.com/services/…' },
        { key: 'webhook' as const, label: 'Webhook', value: webhook, set: setWebhook, placeholder: 'https://example.com/hooks/dbhub' }].map((ch) => (
        <Card key={ch.key}>
          <CardHeader title={ch.label} subtitle={ch.key === 'slack' ? 'Incoming webhook URL' : 'Any HTTP endpoint — receives a JSON POST'} action={<label className="flex items-center gap-2 cursor-pointer text-xs text-ink-500"><input type="checkbox" checked={ch.value.enabled} onChange={(e) => ch.set({ ...ch.value, enabled: e.target.checked })} className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />Enabled</label>} />
          <div className="p-5 space-y-3">
            <input type="text" value={ch.value.url} onChange={(e) => ch.set({ ...ch.value, url: e.target.value })} placeholder={ch.placeholder} disabled={!ch.value.enabled} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50" />
            {testMsg?.channel === ch.key && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${testMsg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
                {testMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}{testMsg.message}
              </div>
            )}
            <Button variant="secondary" size="sm" icon={testing === ch.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} disabled={!ch.value.url || testing !== null} onClick={() => testUrlChannel(ch.key, ch.value.url)}>Send test</Button>
          </div>
        </Card>
      ))}

      <Card>
        <CardHeader title="Alert on" />
        <div className="p-5 space-y-3">
          {eventLabels.map((e) => (
            <label key={e.key} className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={events[e.key]} onChange={(ev) => setEvents({ ...events, [e.key]: ev.target.checked })} className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
              <span className="text-sm text-ink-600">{e.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <Button variant="primary" icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} onClick={() => onSave({ notifications: { telegram, slack, webhook, events } })}>Save</Button>
    </div>
  );
}

function PreferencesTab({ settings, saving, onSave }: { settings: Settings; saving: boolean; onSave: (p: Partial<Settings>) => void }) {
  const [p, setP] = useState(settings.preferences);
  const field = <K extends keyof typeof p>(k: K) => ({ value: p[k], onChange: (v: (typeof p)[K]) => setP({ ...p, [k]: v }) });

  return (
    <Card>
      <CardHeader title="Preferences" subtitle="Query behavior and defaults, applied across DBHub" />
      <div className="p-5 space-y-4 max-w-md">
        <NumberField label="Slow query threshold (ms)" hint="Queries slower than this are flagged 'slow' in the history and monitoring pages." {...field('slowQueryMs')} min={1} max={3600000} />
        <NumberField label="Query timeout (seconds)" hint="0 disables the timeout." {...field('queryTimeoutSec')} min={0} max={3600} />
        <NumberField label="Query history retention (days)" hint="0 keeps history forever." {...field('historyRetentionDays')} min={0} max={3650} />
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1.5">Default page size</label>
          <select value={p.defaultPageSize} onChange={(e) => setP({ ...p, defaultPageSize: Number(e.target.value) })} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} rows</option>)}
          </select>
        </div>
        <Button variant="primary" icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} onClick={() => onSave({ preferences: p })}>Save</Button>
      </div>
    </Card>
  );
}

function NumberField({ label, hint, value, onChange, min, max }: { label: string; hint?: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-600 mb-1.5">{label}</label>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value, 10) || min)))} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
      {hint && <p className="text-[11px] text-ink-400 mt-1">{hint}</p>}
    </div>
  );
}

function SystemTab({ system }: { system: SystemInfo | null }) {
  if (!system) return null;
  const rows: [string, string][] = [
    ['Version', system.version], ['Hostname', system.hostname], ['Runtime', system.docker ? 'Docker' : 'Host process'],
    ['Node.js', system.node], ['Started', new Date(system.startedAt).toLocaleString()],
  ];
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader title="System" action={<Server className="w-4 h-4 text-ink-400" />} />
        <div className="divide-y divide-ink-50">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-5 py-2.5"><span className="text-xs text-ink-400">{k}</span><span className="text-xs font-medium text-ink-800 font-mono">{v}</span></div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Credential Encryption" action={<ShieldCheck className="w-4 h-4 text-emerald-500" />} />
        <div className="p-5 text-sm text-ink-600">
          Database passwords are encrypted at rest with AES-256-GCM. Key source: <span className="font-mono text-xs bg-ink-100 px-1.5 py-0.5 rounded">{system.encryption}</span>.
        </div>
      </Card>
    </div>
  );
}
