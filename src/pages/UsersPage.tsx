import { useState } from 'react';
import { UserPlus, MoreHorizontal, Shield, Check, X } from 'lucide-react';
import { Card, Badge, Button, statusTone, PageHeader, SearchInput, Avatar } from '@/components/ui';
import { users, permissionsMatrix } from '@/data/mockData';

const roleTone: Record<string, 'blue' | 'green' | 'violet' | 'slate'> = {
  Admin: 'blue', DBA: 'violet', Developer: 'green', 'Read-Only': 'slate',
};

const permTone: Record<string, 'blue' | 'green' | 'slate' | 'red'> = {
  'Full': 'blue', 'Read/Write': 'green', 'Read': 'slate', 'None': 'red',
};

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'users' | 'permissions'>('users');

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Users & Permissions"
        subtitle="Manage team members and database access rights"
        actions={<Button variant="primary" icon={<UserPlus className="w-3.5 h-3.5" />}>Invite User</Button>}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-ink-100">
        {(['users', 'permissions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-ink-400 hover:text-ink-700'
            }`}
          >
            {t === 'users' ? 'Team Members' : 'Permissions Matrix'}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <Card>
          <div className="flex items-center gap-3 px-5 py-3 border-b border-ink-100">
            <SearchInput placeholder="Search users…" value={search} onChange={setSearch} />
            <div className="flex-1" />
            <span className="text-xs text-ink-400">{filtered.length} members</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                  <th className="text-left font-medium px-5 py-2.5">User</th>
                  <th className="text-left font-medium px-3 py-2.5">Role</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Last Active</th>
                  <th className="text-right font-medium px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar initials={u.initials} color={u.avatarColor} size={36} />
                        <div>
                          <div className="font-medium text-ink-800 text-xs">{u.name}</div>
                          <div className="text-ink-400 text-xs font-mono">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><Badge tone={roleTone[u.role]}>{u.role}</Badge></td>
                    <td className="px-3 py-3"><Badge tone={statusTone(u.status)} dot={u.status === 'Active'}>{u.status}</Badge></td>
                    <td className="px-3 py-3 text-ink-400 text-xs hidden md:table-cell">{u.lastActive}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'permissions' && (
        <div className="space-y-4">
          {/* Role cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { role: 'Admin', count: 2, icon: Shield, color: 'blue', desc: 'Full access to everything' },
              { role: 'DBA', count: 2, icon: Shield, color: 'violet', desc: 'Manage schemas & backups' },
              { role: 'Developer', count: 5, icon: Shield, color: 'green', desc: 'Read/write on app DBs' },
              { role: 'Read-Only', count: 3, icon: Shield, color: 'slate', desc: 'Query data only' },
            ].map((r) => {
              const colorMap: Record<string, string> = {
                blue: 'bg-blue-50 text-blue-600 ring-blue-100', violet: 'bg-violet-50 text-violet-600 ring-violet-100',
                green: 'bg-emerald-50 text-emerald-600 ring-emerald-100', slate: 'bg-ink-100 text-ink-600 ring-ink-200',
              };
              return (
                <Card key={r.role} className="p-4" hover>
                  <div className={`w-9 h-9 rounded-lg ring-1 ring-inset flex items-center justify-center mb-3 ${colorMap[r.color]}`}>
                    <r.icon className="w-4.5 h-4.5" strokeWidth={2.2} />
                  </div>
                  <p className="text-sm font-semibold text-ink-900">{r.role}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{r.desc}</p>
                  <p className="text-lg font-bold text-ink-800 mt-2 tabular-nums">{r.count} <span className="text-xs font-normal text-ink-400">users</span></p>
                </Card>
              );
            })}
          </div>

          {/* Matrix */}
          <Card>
            <div className="px-5 py-3 border-b border-ink-100">
              <h3 className="text-sm font-semibold text-ink-900">Database Access Matrix</h3>
              <p className="text-xs text-ink-400 mt-0.5">Access level by role and database</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                    <th className="text-left font-medium px-5 py-2.5">Database</th>
                    <th className="text-center font-medium px-3 py-2.5">Admin</th>
                    <th className="text-center font-medium px-3 py-2.5">DBA</th>
                    <th className="text-center font-medium px-3 py-2.5">Developer</th>
                    <th className="text-center font-medium px-3 py-2.5">Read-Only</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionsMatrix.map((p) => (
                    <tr key={p.resource} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs font-medium text-ink-800">{p.resource}</td>
                      <td className="px-3 py-3 text-center"><Badge tone={permTone[p.admin]}>{p.admin}</Badge></td>
                      <td className="px-3 py-3 text-center"><Badge tone={permTone[p.dba]}>{p.dba}</Badge></td>
                      <td className="px-3 py-3 text-center"><Badge tone={permTone[p.developer]}>{p.developer}</Badge></td>
                      <td className="px-3 py-3 text-center"><Badge tone={permTone[p.readonly]}>{p.readonly}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
