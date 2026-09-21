import { useState } from 'react';
import {
  Table2, Plus, RefreshCw, Trash2, Edit3, ChevronDown, ArrowUpDown,
  ChevronLeft, Columns3, Key, Database, Search, Terminal, Download,
  ArrowRight, Lock, Hash, ChevronRight,
} from 'lucide-react';
import { Card, Badge, Button, PageHeader, SearchInput } from '@/components/ui';
import { allTables, type TableInfo } from '@/data/mockData';

type View = 'list' | 'detail';
type DetailTab = 'columns' | 'indexes' | 'data' | 'info';

export function TablesPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<View>('list');
  const [activeTable, setActiveTable] = useState<TableInfo | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('columns');

  const tables = allTables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const toggleAll = () => {
    if (selected.length === tables.length) setSelected([]);
    else setSelected(tables.map((t) => t.name));
  };

  const toggleOne = (name: string) => {
    setSelected((prev) => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const openTable = (table: TableInfo) => {
    setActiveTable(table);
    setView('detail');
    setDetailTab('columns');
  };

  const backToList = () => {
    setView('list');
    setActiveTable(null);
  };

  if (view === 'detail' && activeTable) {
    return (
      <TableDetailView table={activeTable} onBack={backToList} tab={detailTab} setTab={setDetailTab} />
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Tables"
        subtitle="Browse and manage tables in ecommerce_prod"
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className="w-3.5 h-3.5" />}>Refresh</Button>
            <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>New Table</Button>
          </>
        }
      />

      {/* DB selector pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <span className="text-xs text-ink-400 shrink-0">Database:</span>
        {['ecommerce_prod', 'analytics', 'immobilier_tn', 'crm_system', 'data_warehouse'].map((db, i) => (
          <button
            key={db}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              i === 0 ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'
            }`}
          >
            {db}
          </button>
        ))}
      </div>

      <Card>
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-5 py-3 border-b border-ink-100">
          <SearchInput placeholder="Search tables…" value={search} onChange={setSearch} />
          <div className="flex-1" />
          {selected.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-500">{selected.length} selected</span>
              <Button variant="ghost" size="sm" icon={<Edit3 className="w-3.5 h-3.5" />}>Edit</Button>
              <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />}>Drop</Button>
            </div>
          )}
          <Button variant="ghost" size="sm" icon={<ArrowUpDown className="w-3.5 h-3.5" />}>Sort</Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                <th className="px-5 py-2.5 w-10">
                  <input type="checkbox" checked={selected.length === tables.length && tables.length > 0} onChange={toggleAll}
                    className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
                </th>
                <th className="text-left font-medium px-3 py-2.5">Table Name</th>
                <th className="text-right font-medium px-3 py-2.5">Rows</th>
                <th className="text-right font-medium px-3 py-2.5">Size</th>
                <th className="text-left font-medium px-3 py-2.5">Engine</th>
                <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Collation</th>
                <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Last Modified</th>
                <th className="text-right font-medium px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr
                  key={t.name}
                  className="border-b border-ink-50 last:border-0 hover:bg-blue-50/30 transition-colors group cursor-pointer"
                  onClick={() => openTable(t)}
                >
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.includes(t.name)} onChange={() => toggleOne(t.name)}
                      className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-ink-100 flex items-center justify-center shrink-0">
                        <Table2 className="w-3.5 h-3.5 text-ink-500" />
                      </div>
                      <div>
                        <span className="font-mono text-xs font-medium text-ink-800 group-hover:text-blue-600 transition-colors">{t.name}</span>
                        {t.detail && (
                          <span className="text-[10px] text-ink-400 ml-2">{t.detail.columns.length} columns</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{t.rows}</td>
                  <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{t.size}</td>
                  <td className="px-3 py-3"><Badge tone="slate">{t.engine}</Badge></td>
                  <td className="px-3 py-3 text-ink-500 text-xs hidden md:table-cell font-mono">{t.collation}</td>
                  <td className="px-3 py-3 text-ink-400 text-xs hidden lg:table-cell">{t.lastModified}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openTable(t); }}
                        className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="View columns"
                      >
                        <Columns3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => e.stopPropagation()} className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tables.length === 0 && (
          <div className="py-16 text-center">
            <Table2 className="w-8 h-8 text-ink-300 mx-auto mb-2" />
            <p className="text-sm text-ink-500">No tables found</p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Table Detail View ---------- */
function TableDetailView({
  table,
  onBack,
  tab,
  setTab,
}: {
  table: TableInfo;
  onBack: () => void;
  tab: DetailTab;
  setTab: (t: DetailTab) => void;
}) {
  const detail = table.detail;

  const tabs: { key: DetailTab; label: string; icon: typeof Columns3 }[] = [
    { key: 'columns', label: 'Columns', icon: Columns3 },
    { key: 'indexes', label: 'Indexes', icon: Key },
    { key: 'data', label: 'Data', icon: Table2 },
    { key: 'info', label: 'Table Info', icon: Database },
  ];

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <button onClick={onBack} className="flex items-center gap-1 text-ink-500 hover:text-blue-600 transition-colors font-medium">
          <ChevronLeft className="w-4 h-4" />
          Tables
        </button>
        <span className="text-ink-300">/</span>
        <span className="text-ink-400">ecommerce_prod</span>
        <span className="text-ink-300">/</span>
        <span className="font-mono text-sm font-semibold text-ink-800">{table.name}</span>
      </div>

      {/* Table header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Table2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900 tracking-tight font-mono">{table.name}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-ink-400">
              <span>{table.rows} rows</span>
              <span>{table.size}</span>
              <Badge tone="slate">{table.engine}</Badge>
              {detail && <span>{detail.columns.length} columns</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<Download className="w-3.5 h-3.5" />}>Export</Button>
          <Button variant="secondary" icon={<Terminal className="w-3.5 h-3.5" />}>Query</Button>
          <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>Add Column</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-ink-100 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-ink-400 hover:text-ink-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'columns' && detail && (
        <Card className="animate-fade-in overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                  <th className="text-center font-medium px-3 py-2.5 w-12">#</th>
                  <th className="text-left font-medium px-3 py-2.5">Column Name</th>
                  <th className="text-left font-medium px-3 py-2.5">Type</th>
                  <th className="text-center font-medium px-3 py-2.5">Null</th>
                  <th className="text-center font-medium px-3 py-2.5">Key</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Default</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Extra</th>
                  <th className="text-right font-medium px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {detail.columns.map((col, i) => (
                  <tr key={col.name} className="border-b border-ink-50 last:border-0 hover:bg-blue-50/20 transition-colors group">
                    <td className="px-3 py-3 text-center text-ink-300 text-xs tabular-nums">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {col.key === 'PRI' ? (
                          <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        ) : col.key === 'UNI' ? (
                          <Lock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        ) : (
                          <Hash className="w-3.5 h-3.3.5 text-ink-300 shrink-0" style={{ width: '14px', height: '14px' }} />
                        )}
                        <span className="font-mono text-xs font-medium text-ink-800">{col.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs text-blue-600">{col.type}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {col.nullable ? (
                        <span className="text-xs text-ink-400">YES</span>
                      ) : (
                        <span className="text-xs text-ink-600 font-medium">NO</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {col.key === 'PRI' && <Badge tone="amber">PRIMARY</Badge>}
                      {col.key === 'UNI' && <Badge tone="blue">UNIQUE</Badge>}
                      {col.key === 'MUL' && <Badge tone="cyan">INDEX</Badge>}
                      {col.key === '' && <span className="text-ink-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      {col.defaultValue !== null ? (
                        <code className="font-mono text-xs text-ink-500">{col.defaultValue}</code>
                      ) : (
                        <span className="text-ink-300 text-xs">NULL</span>
                      )}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {col.extra ? (
                        <span className="text-xs text-violet-600 font-medium">{col.extra}</span>
                      ) : (
                        <span className="text-ink-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Column summary footer */}
          <div className="px-5 py-3 bg-ink-50/30 border-t border-ink-100 flex items-center gap-4 text-xs text-ink-400 flex-wrap">
            <span>{detail.columns.length} columns</span>
            <span className="flex items-center gap-1"><Key className="w-3 h-3 text-amber-500" />{detail.columns.filter(c => c.key === 'PRI').length} primary</span>
            <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-blue-500" />{detail.columns.filter(c => c.key === 'UNI').length} unique</span>
            <span>{detail.columns.filter(c => !c.nullable).length} NOT NULL</span>
          </div>
        </Card>
      )}

      {tab === 'indexes' && detail && (
        <Card className="animate-fade-in overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900">Indexes</h3>
            <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />}>Add Index</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                  <th className="text-left font-medium px-5 py-2.5">Index Name</th>
                  <th className="text-left font-medium px-3 py-2.5">Columns</th>
                  <th className="text-left font-medium px-3 py-2.5">Type</th>
                  <th className="text-center font-medium px-3 py-2.5">Unique</th>
                  <th className="text-right font-medium px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {detail.indexes.map((idx) => (
                  <tr key={idx.name} className="border-b border-ink-50 last:border-0 hover:bg-blue-50/20 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Key className="w-3.5 h-3.5 text-amber-500" />
                        <span className="font-mono text-xs font-medium text-ink-800">{idx.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {idx.columns.map((col, ci) => (
                          <span key={ci} className="inline-flex items-center gap-1">
                            {ci > 0 && <ArrowRight className="w-3 h-3 text-ink-300" />}
                            <code className="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{col}</code>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3"><Badge tone="violet">{idx.type}</Badge></td>
                    <td className="px-3 py-3 text-center">
                      {idx.unique ? (
                        <Badge tone="green">Yes</Badge>
                      ) : (
                        <span className="text-xs text-ink-400">No</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'data' && detail && (
        <Card className="animate-fade-in overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Sample Data</h3>
              <p className="text-xs text-ink-400 mt-0.5">First 5 rows</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={<Terminal className="w-3.5 h-3.5" />}>Query</Button>
              <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5" />}>Export</Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-ink-100 text-xs text-ink-400 bg-white">
                  <th className="px-3 py-2.5 w-10 text-right font-normal text-ink-300">#</th>
                  {Object.keys(detail.sampleData[0] || {}).map((key) => (
                    <th key={key} className="text-left font-medium px-3 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-blue-600">{key}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.sampleData.map((row, i) => (
                  <tr key={i} className="border-b border-ink-50 last:border-0 hover:bg-blue-50/20 transition-colors">
                    <td className="px-3 py-2.5 text-right text-ink-300 text-xs tabular-nums">{i + 1}</td>
                    {Object.values(row).map((val, vi) => (
                      <td key={vi} className="px-3 py-2.5 text-xs text-ink-700 font-mono whitespace-nowrap">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 bg-ink-50/30 border-t border-ink-100 flex items-center justify-between text-xs text-ink-400">
            <span>Showing 5 of {table.rows} rows</span>
            <div className="flex items-center gap-1">
              <button className="px-2 py-1 rounded text-ink-400 hover:bg-ink-100 disabled:opacity-30" disabled>Prev</button>
              <span className="px-2">Page 1</span>
              <button className="px-2 py-1 rounded text-ink-400 hover:bg-ink-100">Next</button>
            </div>
          </div>
        </Card>
      )}

      {tab === 'info' && (
        <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <div className="px-5 py-3 border-b border-ink-100">
              <h3 className="text-sm font-semibold text-ink-900">Table Properties</h3>
            </div>
            <div className="divide-y divide-ink-50">
              {[
                { label: 'Name', value: table.name, mono: true },
                { label: 'Engine', value: table.engine ?? '—' },
                { label: 'Collation', value: table.collation ?? '—', mono: true },
                { label: 'Row Count', value: table.rows },
                { label: 'Data Size', value: table.size },
                { label: 'Last Modified', value: table.lastModified ?? '—' },
                { label: 'Auto Increment', value: '1,240,001' },
                { label: 'Row Format', value: 'DYNAMIC' },
                { label: 'Comment', value: '—' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-xs text-ink-400">{item.label}</span>
                  <span className={`text-xs font-medium text-ink-800 ${item.mono ? 'font-mono' : ''}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="px-5 py-3 border-b border-ink-100">
              <h3 className="text-sm font-semibold text-ink-900">Space Usage</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-ink-500">Data</span>
                  <span className="font-medium text-ink-800">{table.size}</span>
                </div>
                <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '72%' }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-ink-500">Index</span>
                  <span className="font-medium text-ink-800">0.4 GB</span>
                </div>
                <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: '18%' }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-ink-500">Overhead</span>
                  <span className="font-medium text-ink-800">12 MB</span>
                </div>
                <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '5%' }} />
                </div>
              </div>
              <div className="pt-3 border-t border-ink-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-400">Effective Size</span>
                  <span className="font-semibold text-ink-800">{table.size}</span>
                </div>
              </div>
              <Button variant="secondary" size="sm" className="w-full" icon={<RefreshCw className="w-3.5 h-3.5" />}>Optimize Table</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
