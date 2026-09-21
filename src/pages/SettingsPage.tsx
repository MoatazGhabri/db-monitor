import { useState } from 'react';
import { User, Bell, Shield, Palette, Server, Globe, Check } from 'lucide-react';
import { Card, CardHeader, Badge, Button, PageHeader } from '@/components/ui';

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile');
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState({ email: true, slack: true, webhook: false });
  const [autoBackup, setAutoBackup] = useState(true);
  const [twoFactor, setTwoFactor] = useState(true);

  const sections = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'appearance', label: 'Appearance', icon: Palette },
    { key: 'connections', label: 'Connections', icon: Server },
    { key: 'locale', label: 'Locale', icon: Globe },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Settings" subtitle="Manage your account and platform preferences" />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Sidebar */}
        <Card className="lg:col-span-1 h-fit">
          <nav className="p-2">
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeSection === s.key ? 'bg-blue-50 text-blue-700' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
                }`}
              >
                <s.icon className="w-4 h-4" />
                {s.label}
              </button>
            ))}
          </nav>
        </Card>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">
          {activeSection === 'profile' && (
            <Card>
              <CardHeader title="Profile" subtitle="Your personal information" />
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-semibold">SC</div>
                  <div>
                    <Button variant="secondary" size="sm">Change Avatar</Button>
                    <p className="text-xs text-ink-400 mt-1.5">JPG, PNG or GIF. Max 2MB.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full Name" value="Sarah Chen" />
                  <Field label="Email" value="sarah.c@dbhub.io" />
                  <Field label="Role" value="Admin" />
                  <Field label="Timezone" value="UTC+01:00 (Tunis)" />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                  <Button variant="secondary">Cancel</Button>
                  <Button variant="primary" icon={<Check className="w-3.5 h-3.5" />}>Save Changes</Button>
                </div>
              </div>
            </Card>
          )}

          {activeSection === 'notifications' && (
            <Card>
              <CardHeader title="Notifications" subtitle="Choose how you receive alerts" />
              <div className="divide-y divide-ink-50">
                {[
                  { key: 'email', label: 'Email Alerts', desc: 'Critical system events and backup failures' },
                  { key: 'slack', label: 'Slack Integration', desc: 'Push notifications to #db-alerts channel' },
                  { key: 'webhook', label: 'Webhook', desc: 'Send events to your custom endpoint' },
                ].map((n) => (
                  <div key={n.key} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink-800">{n.label}</p>
                      <p className="text-xs text-ink-400 mt-0.5">{n.desc}</p>
                    </div>
                    <Toggle checked={notifications[n.key as keyof typeof notifications]} onChange={() => setNotifications(prev => ({ ...prev, [n.key]: !prev[n.key as keyof typeof notifications] }))} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeSection === 'security' && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Authentication" subtitle="Protect your account" />
                <div className="divide-y divide-ink-50">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink-800">Two-Factor Authentication</p>
                      <p className="text-xs text-ink-400 mt-0.5">Require a verification code at sign-in</p>
                    </div>
                    <Badge tone="green" dot>Enabled</Badge>
                    <Toggle checked={twoFactor} onChange={() => setTwoFactor(!twoFactor)} />
                  </div>
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink-800">Password</p>
                      <p className="text-xs text-ink-400 mt-0.5">Last changed 23 days ago</p>
                    </div>
                    <Button variant="secondary" size="sm">Change Password</Button>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="Active Sessions" subtitle="Devices currently signed in" />
                <div className="divide-y divide-ink-50">
                  {[
                    { device: 'MacBook Pro · Chrome', location: 'Tunis, TN', current: true, time: 'Active now' },
                    { device: 'iPhone 16 · Safari', location: 'Tunis, TN', current: false, time: '2 hours ago' },
                    { device: 'Linux · Firefox', location: 'Paris, FR', current: false, time: '3 days ago' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink-800">{s.device}</p>
                        <p className="text-xs text-ink-400 mt-0.5">{s.location} · {s.time}</p>
                      </div>
                      {s.current ? <Badge tone="green" dot>Current</Badge> : <Button variant="ghost" size="sm">Revoke</Button>}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeSection === 'appearance' && (
            <Card>
              <CardHeader title="Appearance" subtitle="Customize the interface" />
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink-800">Dark Mode</p>
                    <p className="text-xs text-ink-400 mt-0.5">Switch to a dark color scheme</p>
                  </div>
                  <Toggle checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
                </div>
                <div className="pt-3 border-t border-ink-100">
                  <p className="text-sm font-medium text-ink-800 mb-3">Accent Color</p>
                  <div className="flex items-center gap-3">
                    {['#2563eb', '#059669', '#d97706', '#e11d48', '#0891b2'].map((c, i) => (
                      <button key={c} className={`w-8 h-8 rounded-lg ring-2 transition-all ${i === 0 ? 'ring-ink-300 scale-110' : 'ring-transparent hover:scale-105'}`} style={{ background: c }} />
                    ))}
                  </div>
                </div>
                <div className="pt-3 border-t border-ink-100">
                  <p className="text-sm font-medium text-ink-800 mb-3">Density</p>
                  <div className="flex items-center gap-2">
                    <button className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-200">Comfortable</button>
                    <button className="px-4 py-2 rounded-lg text-sm font-medium text-ink-500 hover:bg-ink-50">Compact</button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeSection === 'connections' && (
            <Card>
              <CardHeader title="Database Connections" subtitle="Configured server connections" action={<Button variant="primary" size="sm">Add Connection</Button>} />
              <div className="divide-y divide-ink-50">
                {[
                  { name: 'us-east-1.prod', host: 'db-prod-01.dbhub.io:5432', status: 'connected', latency: '2ms' },
                  { name: 'eu-west.replica', host: 'db-replica-eu.dbhub.io:5432', status: 'connected', latency: '45ms' },
                  { name: 'asia.staging', host: 'db-stage-asia.dbhub.io:3306', status: 'disconnected', latency: '—' },
                ].map((c) => (
                  <div key={c.name} className="flex items-center gap-4 px-5 py-3">
                    <div className={`w-2 h-2 rounded-full ${c.status === 'connected' ? 'bg-emerald-500 animate-pulse-dot' : 'bg-ink-300'}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink-800">{c.name}</p>
                      <p className="text-xs text-ink-400 font-mono mt-0.5">{c.host}</p>
                    </div>
                    <span className="text-xs text-ink-400 tabular-nums">{c.latency}</span>
                    <Badge tone={c.status === 'connected' ? 'green' : 'slate'}>{c.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeSection === 'locale' && (
            <Card>
              <CardHeader title="Locale & Regional" subtitle="Language and formatting preferences" />
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">Language</label>
                  <select className="w-full sm:w-64 text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option>English (US)</option><option>Français</option><option>العربية</option><option>Deutsch</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">Date Format</label>
                  <select className="w-full sm:w-64 text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option>YYYY-MM-DD (ISO 8601)</option><option>MM/DD/YYYY</option><option>DD/MM/YYYY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">Time Format</label>
                  <div className="flex items-center gap-2">
                    <button className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-200">24-hour</button>
                    <button className="px-4 py-2 rounded-lg text-sm font-medium text-ink-500 hover:bg-ink-50">12-hour (AM/PM)</button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-600 mb-1.5">{label}</label>
      <input type="text" defaultValue={value} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
      <div className="w-10 h-5.5 bg-ink-200 peer-checked:bg-blue-600 rounded-full transition-colors" style={{ height: '22px' }} />
      <div className="absolute left-0.5 top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform peer-checked:translate-x-[18px] shadow-soft" style={{ width: '18px', height: '18px' }} />
    </label>
  );
}
