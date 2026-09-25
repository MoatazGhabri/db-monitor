import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table2, Plus, RefreshCw, Trash2, ChevronLeft, ChevronRight, Columns3, Key, Database,
  Terminal, Download, ArrowRight, Lock, Hash, ArrowUp, ArrowDown, ChevronDown,
  Loader2, AlertCircle, Pencil, Wrench,
} from 'lucide-react';
import { Card, Badge, Button, PageHeader, SearchInput, EmptyState } from '@/components/ui';
import {
  fetchConnections, fetchTables, fetchColumns, fetchIndexes, fetchTableData,
  type DbConnection, type TableSummary, type ColumnInfo, type IndexInfo, type TableDataResult,
} from '@/lib/api';
import { formatBytes, formatNumber, formatDate } from '@/lib/format';
import * as sql from '@/lib/sqlTemplates';
import type { PageKey } from '@/lib/types';

type DetailTab = 'columns' | 'indexes' | 'data' | 'info';

interface Props {
  connectionId?: string;
  onConnectionChange?: (id: string) => void;
  onNavigate?: (p: PageKey) => void;
  /** Hand a statement to the SQL editor (pre-filled, never auto-executed). */
  onOpenSql?: (connectionId: string, statement: string) => void;
}

const keyOf = (t: TableSummary) => `${t.schema}.${t.name}`;
const rowsLabel = (t: TableSummary) =>
  t.rows === null ? '—' : `${t.rows_estimated ? '~' : ''}${formatNumber(t.rows)}`;

export function TablesPage({ connectionId, onConnectionChange, onNavigate, onOpenSql }: Props) {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);
  const [connError, setConnError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | undefined>(connectionId);

  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'rows' | 'size'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<string[]>([]);
  const [activeTable, setActiveTable] = useState<TableSummary | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('columns');
  const reqId = useRef(0);

  /* ----- connections ----- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchConnections();
        if (cancelled) return;
        setConnections(data);
        setCurrentId((cur) => {
          if (cur && data.some((c) => c.id === cur)) return cur;
          const pick = data.find((c) => c.status === 'online') ?? data[0];
          if (pick) onConnectionChange?.(pick.id);
          return pick?.id;
        });
      } catch (err) {
        if (!cancelled) setConnError(err instanceof Error ? err.message : 'Failed to load connections');
      } finally {
        if (!cancelled) setLoadingConns(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conn = connections.find((c) => c.id === currentId);

  /* ----- tables of the selected connection ----- */
  const loadTables = useCallback(async (id: string) => {
    const my = ++reqId.current;
    setLoadingTables(true);
    setTablesError(null);
    try {
      const res = await fetchTables(id);
      if (my !== reqId.current) return;
      setTables(res.tables);
      setSelected([]);
    } catch (err) {
      if (my !== reqId.current) return;
      setTables([]);
      setTablesError(err instanceof Error ? err.message : 'Failed to load tables');
    } finally {
      if (my === reqId.current) setLoadingTables(false);
    }
  }, []);

  useEffect(() => {
    setActiveTable(null);
    setSearch('');
    if (currentId) loadTables(currentId);
    else setTables([]);
  }, [currentId, loadTables]);

  const selectConnection = (id: string) => {
    if (id === currentId) return;
    setCurrentId(id);
    onConnectionChange?.(id);
  };

  /* ----- list helpers ----- */
  const sizeOf = (t: TableSummary) => t.data_bytes + t.index_bytes;
  const visible = tables
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'rows') cmp = (a.rows ?? -1) - (b.rows ?? -1);
      else cmp = sizeOf(a) - sizeOf(b);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };
  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k
      ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
      : <ChevronDown className="w-3 h-3 opacity-40" />;

  const allSelected = visible.length > 0 && visible.every((t) => selected.includes(keyOf(t)));
  const toggleAll = () => setSelected(allSelected ? [] : visible.map(keyOf));
  const toggleOne = (k: string) =>
    setSelected((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const openSql = (statement: string) => { if (conn) onOpenSql?.(conn.id, statement); };

  /* ----- detail view ----- */
  if (activeTable && conn) {
    return (
      <TableDetailView
        conn={conn}
        table={activeTable}
        onBack={() => setActiveTable(null)}
        tab={detailTab}
        setTab={setDetailTab}
        onOpenSql={openSql}
      />
    );
  }

  /* ----- states without a usable list ----- */
  if (loadingConns) {
    return (
      <div className="py-24 text-center animate-fade-in">
        <Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" />
        <p className="text-sm text-ink-400">Loading connections…</p>
      </div>
    );
  }

  if (connError) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Tables" subtitle="Browse the tables of your connected databases" />
        <ErrorBanner message={connError} />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Tables" subtitle="Browse the tables of your connected databases" />
        <Card>
          <EmptyState
            icon={<Database className="w-5 h-5" />}
            title="No database connected yet"
            subtitle="Connect a database first, then its tables will show up here."
          />
          <div className="pb-10 text-center -mt-6">
            <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => onNavigate?.('databases')}>Connect a database</Button>
          </div>
        </Card>
      </div>
    );
  }

  const totalSize = tables.reduce((s, t) => s + sizeOf(t), 0);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Tables"
        subtitle={conn ? `Browse tables in ${conn.name} (${conn.database_name})` : 'Browse the tables of your connected databases'}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loadingTables ? 'animate-spin' : ''}`} />}
              disabled={!currentId || loadingTables}
              onClick={() => currentId && loadTables(currentId)}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="w-3.5 h-3.5" />}
              disabled={!conn}
              title="Opens the SQL editor with a CREATE TABLE template"
              onClick={() => conn && openSql(sql.newTable(conn, tables[0]?.schema))}
            >
              New Table
            </Button>
          </>
        }
      />

      {/* Database selector pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <span className="text-xs text-ink-400 shrink-0">Database:</span>
        {connections.map((c) => (
          <button
            key={c.id}
            onClick={() => selectConnection(c.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              c.id === currentId ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {c.name}
          </button>
        ))}
      </div>

      {tablesError && (
        <ErrorBanner
          message={tablesError}
          action={
            <button className="underline underline-offset-2 whitespace-nowrap" onClick={() => onNavigate?.('databases')}>
              Check connection
            </button>
          }
        />
      )}

      <Card>
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-5 py-3 border-b border-ink-100">
          <SearchInput placeholder="Search tables…" value={search} onChange={setSearch} />
          <div className="flex-1" />
          {selected.length > 0 && conn && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-500">{selected.length} selected</span>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                title="Opens the SQL editor with the DROP statements — nothing is deleted until you run them"
                onClick={() => openSql(sql.dropTables(conn, tables.filter((t) => selected.includes(keyOf(t)))))}
              >
                Drop
              </Button>
            </div>
          )}
          <span className="text-xs text-ink-400">{visible.length} of {tables.length}</span>
        </div>

        {loadingTables ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-ink-400">Reading tables from {conn?.name}…</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                    <th className="px-5 py-2.5 w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
                    </th>
                    <th className="text-left font-medium px-3 py-2.5 cursor-pointer hover:text-ink-700" onClick={() => toggleSort('name')}>
                      <span className="inline-flex items-center gap-1">Table Name <SortIcon k="name" /></span>
                    </th>
                    <th className="text-right font-medium px-3 py-2.5 cursor-pointer hover:text-ink-700" onClick={() => toggleSort('rows')}>
                      <span className="inline-flex items-center gap-1" title="~ = engine estimate">Rows <SortIcon k="rows" /></span>
                    </th>
                    <th className="text-right font-medium px-3 py-2.5 cursor-pointer hover:text-ink-700" onClick={() => toggleSort('size')}>
                      <span className="inline-flex items-center gap-1">Size <SortIcon k="size" /></span>
                    </th>
                    <th className="text-left font-medium px-3 py-2.5">Engine</th>
                    <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Collation</th>
                    <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Last Modified</th>
                    <th className="text-right font-medium px-5 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => {
                    const k = keyOf(t);
                    return (
                      <tr
                        key={k}
                        className="border-b border-ink-50 last:border-0 hover:bg-blue-50/30 transition-colors group cursor-pointer"
                        onClick={() => { setActiveTable(t); setDetailTab('columns'); }}
                      >
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.includes(k)} onChange={() => toggleOne(k)}
                            className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-ink-100 flex items-center justify-center shrink-0">
                              <Table2 className="w-3.5 h-3.5 text-ink-500" />
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs font-medium text-ink-800 group-hover:text-blue-600 transition-colors">{t.name}</span>
                              {conn?.engine === 'postgresql' && t.schema !== 'public' && (
                                <span className="text-[10px] text-ink-400 font-mono">{t.schema}</span>
                              )}
                              {t.type !== 'BASE TABLE' && <Badge tone="violet">{t.type === 'VIEW' ? 'VIEW' : t.type.toLowerCase()}</Badge>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{rowsLabel(t)}</td>
                        <td className="px-3 py-3 text-right text-ink-600 tabular-nums" title={`Data ${formatBytes(t.data_bytes)} · Indexes ${formatBytes(t.index_bytes)}`}>
                          {formatBytes(sizeOf(t))}
                        </td>
                        <td className="px-3 py-3">{t.engine ? <Badge tone="slate">{t.engine}</Badge> : <span className="text-ink-300 text-xs">—</span>}</td>
                        <td className="px-3 py-3 text-ink-500 text-xs hidden md:table-cell font-mono">{t.collation ?? '—'}</td>
                        <td className="px-3 py-3 text-ink-400 text-xs hidden lg:table-cell">{formatDate(t.updated_at ?? t.created_at)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); setActiveTable(t); setDetailTab('columns'); }}
                              className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="View columns"
                            >
                              <Columns3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); if (conn) openSql(sql.selectAll(conn, t)); }}
                              className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded"
                              title="Open in SQL editor"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-blue-500 transition-colors" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {visible.length === 0 && !tablesError && (
              <div className="py-16 text-center">
                <Table2 className="w-8 h-8 text-ink-300 mx-auto mb-2" />
                <p className="text-sm text-ink-500">
                  {tables.length === 0 ? 'This database has no tables yet' : 'No tables match your search'}
                </p>
              </div>
            )}

            {tables.length > 0 && (
              <div className="px-5 py-3 bg-ink-50/30 border-t border-ink-100 text-xs text-ink-400 flex items-center gap-4 flex-wrap">
                <span>{tables.length} object{tables.length === 1 ? '' : 's'}</span>
                <span>{formatBytes(totalSize)} total</span>
                <span>~ = estimate from the database engine</span>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function ErrorBanner({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      {action}
    </div>
  );
}

/* ---------- Table Detail View ---------- */
function TableDetailView({
  conn, table, onBack, tab, setTab, onOpenSql,
}: {
  conn: DbConnection;
  table: TableSummary;
  onBack: () => void;
  tab: DetailTab;
  setTab: (t: DetailTab) => void;
  onOpenSql: (statement: string) => void;
}) {
  const [columns, setColumns] = useState<ColumnInfo[] | null>(null);
  const [indexes, setIndexes] = useState<IndexInfo[] | null>(null);
  const [structLoading, setStructLoading] = useState(true);
  const [structError, setStructError] = useState<string | null>(null);

  const [data, setData] = useState<TableDataResult | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [orderBy, setOrderBy] = useState<string | undefined>();
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc');
  const [refreshTick, setRefreshTick] = useState(0);
  const structReq = useRef(0);
  const dataReq = useRef(0);

  const isView = table.type !== 'BASE TABLE';

  /* structure: columns + indexes */
  useEffect(() => {
    const my = ++structReq.current;
    setStructLoading(true);
    setStructError(null);
    Promise.all([
      fetchColumns(conn.id, table.name, table.schema),
      fetchIndexes(conn.id, table.name, table.schema),
    ])
      .then(([c, i]) => {
        if (my !== structReq.current) return;
        setColumns(c.columns);
        setIndexes(i.indexes);
      })
      .catch((err) => {
        if (my !== structReq.current) return;
        setStructError(err instanceof Error ? err.message : 'Failed to load table structure');
      })
      .finally(() => { if (my === structReq.current) setStructLoading(false); });
  }, [conn.id, table.name, table.schema, refreshTick]);

  /* rows: only when the Data tab is open */
  useEffect(() => {
    if (tab !== 'data') return;
    const my = ++dataReq.current;
    setDataLoading(true);
    setDataError(null);
    fetchTableData(conn.id, table.name, { schema: table.schema, page, pageSize, orderBy, orderDir })
      .then((res) => { if (my === dataReq.current) setData(res); })
      .catch((err) => { if (my === dataReq.current) setDataError(err instanceof Error ? err.message : 'Failed to load rows'); })
      .finally(() => { if (my === dataReq.current) setDataLoading(false); });
  }, [tab, conn.id, table.name, table.schema, page, pageSize, orderBy, orderDir, refreshTick]);

  const tabs: { key: DetailTab; label: string; icon: typeof Columns3 }[] = [
    { key: 'columns', label: 'Columns', icon: Columns3 },
    { key: 'indexes', label: 'Indexes', icon: Key },
    { key: 'data', label: 'Data', icon: Table2 },
    { key: 'info', label: 'Table Info', icon: Database },
  ];

  const total = data?.totalExact ? data.total : undefined;
  const rowCount = total !== undefined ? formatNumber(total) : rowsLabel(table);
  const totalRows = data ? data.total : table.rows ?? 0;
  const lastPage = Math.max(1, Math.ceil(totalRows / pageSize));
  const hasNext = data
    ? (data.totalExact ? page < lastPage : data.rows.length === pageSize)
    : false;

  const sortBy = (col: string) => {
    if (orderBy === col) setOrderDir(orderDir === 'asc' ? 'desc' : 'asc');
    else { setOrderBy(col); setOrderDir('asc'); }
    setPage(1);
  };

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [data.columns.map(esc).join(',')];
    for (const row of data.rows) lines.push(data.columns.map((c) => esc(row[c])).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table.name}_page${data.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cols = columns ?? [];
  const idxs = indexes ?? [];
  const dataPct = table.data_bytes + table.index_bytes > 0
    ? Math.round((table.data_bytes / (table.data_bytes + table.index_bytes)) * 100) : 0;

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <button onClick={onBack} className="flex items-center gap-1 text-ink-500 hover:text-blue-600 transition-colors font-medium">
          <ChevronLeft className="w-4 h-4" />
          Tables
        </button>
        <span className="text-ink-300">/</span>
        <span className="text-ink-400">{conn.database_name}</span>
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
            <div className="flex items-center gap-3 mt-0.5 text-xs text-ink-400 flex-wrap">
              {!isView && <span>{rowCount} rows</span>}
              <span>{formatBytes(table.data_bytes + table.index_bytes)}</span>
              {table.engine && <Badge tone="slate">{table.engine}</Badge>}
              {isView && <Badge tone="violet">{table.type}</Badge>}
              {columns && <span>{columns.length} columns</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<RefreshCw className={`w-3.5 h-3.5 ${structLoading || dataLoading ? 'animate-spin' : ''}`} />} onClick={() => setRefreshTick((n) => n + 1)}>Refresh</Button>
          <Button variant="secondary" icon={<Terminal className="w-3.5 h-3.5" />} onClick={() => onOpenSql(sql.selectAll(conn, table))}>Query</Button>
          {!isView && (
            <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />} title="Opens the SQL editor with an ALTER TABLE template" onClick={() => onOpenSql(sql.addColumn(conn, table))}>Add Column</Button>
          )}
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

      {structError && (tab === 'columns' || tab === 'indexes') && <ErrorBanner message={structError} />}

      {/* Columns */}
      {tab === 'columns' && (
        <Card className="animate-fade-in overflow-hidden">
          {structLoading && !columns ? (
            <Loading label="Reading columns…" />
          ) : (
            <>
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
                    {cols.map((col, i) => (
                      <tr key={col.name} className="border-b border-ink-50 last:border-0 hover:bg-blue-50/20 transition-colors group">
                        <td className="px-3 py-3 text-center text-ink-300 text-xs tabular-nums">{i + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {col.key === 'PRI' ? (
                              <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            ) : col.key === 'UNI' ? (
                              <Lock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            ) : (
                              <Hash className="w-3.5 h-3.5 text-ink-300 shrink-0" />
                            )}
                            <span className="font-mono text-xs font-medium text-ink-800" title={col.comment || undefined}>{col.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3"><span className="font-mono text-xs text-blue-600">{col.type}</span></td>
                        <td className="px-3 py-3 text-center">
                          {col.nullable
                            ? <span className="text-xs text-ink-400">YES</span>
                            : <span className="text-xs text-ink-600 font-medium">NO</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {col.key === 'PRI' && <Badge tone="amber">PRIMARY</Badge>}
                          {col.key === 'UNI' && <Badge tone="blue">UNIQUE</Badge>}
                          {col.key === 'MUL' && <Badge tone="cyan">INDEX</Badge>}
                          {col.key === '' && <span className="text-ink-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          {col.defaultValue !== null
                            ? <code className="font-mono text-xs text-ink-500">{col.defaultValue}</code>
                            : <span className="text-ink-300 text-xs">NULL</span>}
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          {col.extra
                            ? <span className="text-xs text-violet-600 font-medium">{col.extra}</span>
                            : <span className="text-ink-300 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {!isView && (
                            <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit column (opens SQL editor)"
                                onClick={() => onOpenSql(sql.editColumn(conn, table, col))}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Drop column (opens SQL editor)"
                                onClick={() => onOpenSql(sql.dropColumn(conn, table, col))}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 bg-ink-50/30 border-t border-ink-100 flex items-center gap-4 text-xs text-ink-400 flex-wrap">
                <span>{cols.length} columns</span>
                <span className="flex items-center gap-1"><Key className="w-3 h-3 text-amber-500" />{cols.filter((c) => c.key === 'PRI').length} primary</span>
                <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-blue-500" />{cols.filter((c) => c.key === 'UNI').length} unique</span>
                <span>{cols.filter((c) => !c.nullable).length} NOT NULL</span>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Indexes */}
      {tab === 'indexes' && (
        <Card className="animate-fade-in overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900">Indexes</h3>
            {!isView && (
              <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} title="Opens the SQL editor with a CREATE INDEX template"
                onClick={() => onOpenSql(sql.addIndex(conn, table, cols))}>
                Add Index
              </Button>
            )}
          </div>
          {structLoading && !indexes ? (
            <Loading label="Reading indexes…" />
          ) : idxs.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-400">{isView ? 'Views have no indexes' : 'This table has no indexes'}</div>
          ) : (
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
                  {idxs.map((idx) => (
                    <tr key={idx.name} className="border-b border-ink-50 last:border-0 hover:bg-blue-50/20 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Key className={`w-3.5 h-3.5 ${idx.primary ? 'text-amber-500' : 'text-ink-300'}`} />
                          <span className="font-mono text-xs font-medium text-ink-800">{idx.name}</span>
                          {idx.primary && <Badge tone="amber">PRIMARY</Badge>}
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
                        {idx.unique ? <Badge tone="green">Yes</Badge> : <span className="text-xs text-ink-400">No</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Drop index (opens SQL editor)"
                            onClick={() => onOpenSql(sql.dropIndex(conn, table, idx))}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Data */}
      {tab === 'data' && (
        <Card className="animate-fade-in overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Table Data</h3>
              <p className="text-xs text-ink-400 mt-0.5">Live rows · click a column header to sort</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="text-xs bg-white border border-ink-200 rounded-lg px-2 py-1.5 text-ink-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} rows</option>)}
              </select>
              <Button variant="secondary" size="sm" icon={<Terminal className="w-3.5 h-3.5" />} onClick={() => onOpenSql(sql.selectAll(conn, table))}>Query</Button>
              <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5" />} disabled={!data || data.rows.length === 0} onClick={exportCsv}>Export page (CSV)</Button>
            </div>
          </div>

          {dataError && <div className="p-4"><ErrorBanner message={dataError} /></div>}

          {!data && dataLoading ? (
            <Loading label="Reading rows…" />
          ) : data ? (
            <div className={`overflow-x-auto max-h-[560px] transition-opacity ${dataLoading ? 'opacity-50' : ''}`}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-ink-100 text-xs text-ink-400 bg-white">
                    <th className="px-3 py-2.5 w-10 text-right font-normal text-ink-300">#</th>
                    {data.columns.map((key) => (
                      <th key={key} className="text-left font-medium px-3 py-2.5 whitespace-nowrap cursor-pointer select-none hover:text-ink-700" onClick={() => sortBy(key)}>
                        <span className="inline-flex items-center gap-1 font-mono text-blue-600">
                          {key}
                          {orderBy === key && (orderDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} className="border-b border-ink-50 last:border-0 hover:bg-blue-50/20 transition-colors">
                      <td className="px-3 py-2.5 text-right text-ink-300 text-xs tabular-nums">{(data.page - 1) * data.pageSize + i + 1}</td>
                      {data.columns.map((c) => <Cell key={c} value={row[c]} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length === 0 && <div className="py-12 text-center text-sm text-ink-400">This table is empty</div>}
            </div>
          ) : null}

          {data && (
            <div className="px-5 py-3 bg-ink-50/30 border-t border-ink-100 flex items-center justify-between text-xs text-ink-400">
              <span>
                {data.rows.length === 0
                  ? '0 rows'
                  : `Showing ${formatNumber((data.page - 1) * data.pageSize + 1)}–${formatNumber((data.page - 1) * data.pageSize + data.rows.length)} of ${data.totalExact ? '' : '~'}${formatNumber(data.total)}`}
              </span>
              <div className="flex items-center gap-1">
                <button className="px-2 py-1 rounded hover:bg-ink-100 disabled:opacity-30 disabled:pointer-events-none" disabled={page <= 1 || dataLoading} onClick={() => setPage(page - 1)}>Prev</button>
                <span className="px-2">Page {page}{data.totalExact ? ` of ${lastPage}` : ''}</span>
                <button className="px-2 py-1 rounded hover:bg-ink-100 disabled:opacity-30 disabled:pointer-events-none" disabled={!hasNext || dataLoading} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Info */}
      {tab === 'info' && (
        <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <div className="px-5 py-3 border-b border-ink-100">
              <h3 className="text-sm font-semibold text-ink-900">Table Properties</h3>
            </div>
            <div className="divide-y divide-ink-50">
              {([
                { label: 'Name', value: table.name, mono: true },
                { label: 'Schema', value: table.schema, mono: true },
                { label: 'Type', value: table.type },
                { label: table.engine && conn.engine === 'postgresql' ? 'Access Method' : 'Engine', value: table.engine ?? '—' },
                { label: 'Collation', value: table.collation ?? '—', mono: true },
                { label: 'Row Count', value: table.rows === null ? '—' : `${table.rows_estimated ? '~' : ''}${formatNumber(total ?? table.rows)}` },
                { label: 'Data Size', value: formatBytes(table.data_bytes) },
                { label: 'Index Size', value: formatBytes(table.index_bytes) },
                { label: 'Created', value: formatDate(table.created_at) },
                { label: 'Last Modified', value: formatDate(table.updated_at) },
                ...(table.auto_increment !== null ? [{ label: 'Auto Increment', value: formatNumber(table.auto_increment) }] : []),
                ...(table.row_format ? [{ label: 'Row Format', value: table.row_format }] : []),
                { label: 'Comment', value: table.comment || '—' },
              ] as { label: string; value: string; mono?: boolean }[]).map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <span className="text-xs text-ink-400">{item.label}</span>
                  <span className={`text-xs font-medium text-ink-800 text-right ${item.mono ? 'font-mono' : ''}`}>{item.value}</span>
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
                  <span className="font-medium text-ink-800">{formatBytes(table.data_bytes)}</span>
                </div>
                <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${dataPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-ink-500">Indexes</span>
                  <span className="font-medium text-ink-800">{formatBytes(table.index_bytes)}</span>
                </div>
                <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${table.data_bytes + table.index_bytes > 0 ? 100 - dataPct : 0}%` }} />
                </div>
              </div>
              <div className="pt-3 border-t border-ink-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-400">Total Size</span>
                  <span className="font-semibold text-ink-800">{formatBytes(table.data_bytes + table.index_bytes)}</span>
                </div>
              </div>
              {!isView && (
                <Button variant="secondary" size="sm" className="w-full justify-center" icon={<Wrench className="w-3.5 h-3.5" />}
                  title="Opens the SQL editor with the maintenance statement"
                  onClick={() => onOpenSql(sql.optimizeTable(conn, table))}>
                  {conn.engine === 'postgresql' ? 'Vacuum & Analyze' : 'Optimize Table'}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="py-14 text-center">
      <Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" />
      <p className="text-sm text-ink-400">{label}</p>
    </div>
  );
}

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <td className="px-3 py-2.5 text-xs font-mono text-ink-300 italic whitespace-nowrap">NULL</td>;
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return (
    <td className="px-3 py-2.5 text-xs text-ink-700 font-mono whitespace-nowrap max-w-[320px] truncate" title={text.length > 40 ? text : undefined}>
      {text}
    </td>
  );
}
