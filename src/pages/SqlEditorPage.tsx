import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Play, Save, Clock, CheckCircle2, AlertCircle, Copy, Download, Terminal, ChevronRight, Loader2, Server } from 'lucide-react';
import { Card, Badge, Button, PageHeader } from '@/components/ui';
import { fetchConnections, executeQuery, fetchQueryHistory, type DbConnection, type QueryResult, type QueryHistoryEntry } from '@/lib/api';
import type { SqlDraft } from '@/lib/sqlTemplates';

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'INDEX', 'ALTER', 'ADD', 'DROP', 'LIMIT', 'ORDER', 'BY', 'GROUP',
  'HAVING', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'AND', 'OR', 'NOT',
  'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'EXISTS', 'UNION', 'ALL', 'DISTINCT', 'COUNT',
  'SUM', 'AVG', 'MIN', 'MAX', 'WITH', 'EXPLAIN', 'VACUUM', 'ANALYZE', 'INTERVAL',
  'NOW', 'DAY', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'BEGIN', 'COMMIT', 'ROLLBACK',
  'TRUNCATE', 'SHOW', 'DESCRIBE', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT',
  'CONSTRAINT', 'UNIQUE', 'CHECK', 'CASCADE', 'RENAME', 'TO', 'COLUMN', 'DATABASE',
]);

function highlightSQL(sql: string): string {
  const tokens: { text: string; type: string }[] = [];
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      const text = end === -1 ? rest : sql.slice(i, end);
      tokens.push({ text, type: 'cmt' }); i += text.length; continue;
    }
    if (rest[0] === "'" || rest[0] === '"') {
      const q = rest[0]; let j = 1;
      while (j < rest.length && rest[j] !== q) { if (rest[j] === '\\') j++; j++; }
      const text = rest.slice(0, j + 1);
      tokens.push({ text, type: 'str' }); i += text.length; continue;
    }
    if (/\d/.test(rest[0])) {
      const m = rest.match(/^\d+(\.\d+)?/);
      if (m) { tokens.push({ text: m[0], type: 'num' }); i += m[0].length; continue; }
    }
    if (/[a-zA-Z_]/.test(rest[0])) {
      const m = rest.match(/^[a-zA-Z_]\w*/);
      if (m) {
        const upper = m[0].toUpperCase();
        const type = SQL_KEYWORDS.has(upper) ? 'key' : 'var';
        tokens.push({ text: m[0], type }); i += m[0].length; continue;
      }
    }
    if (/[=<>!+\-*/%.,;()]/.test(rest[0])) {
      tokens.push({ text: rest[0], type: 'op' }); i += 1; continue;
    }
    const m = rest.match(/^\s+/);
    if (m) { tokens.push({ text: m[0], type: 'ws' }); i += m[0].length; continue; }
    tokens.push({ text: rest[0], type: 'ws' }); i += 1;
  }
  return tokens.map((t) => {
    if (t.type === 'ws' || t.type === 'op') return escapeHtml(t.text);
    if (t.type === 'var') return `<span class="tok-var">${escapeHtml(t.text)}</span>`;
    return `<span class="tok-${t.type}">${escapeHtml(t.text)}</span>`;
  }).join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SAMPLE_QUERY = `-- Get top customers by order count
SELECT
  u.name,
  u.email,
  COUNT(o.id) AS total_orders,
  SUM(o.total) AS revenue
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.created_at > NOW() - INTERVAL 30 DAY
GROUP BY u.name, u.email
ORDER BY revenue DESC
LIMIT 100;`;

export function SqlEditorPage({ draft }: { draft?: SqlDraft | null }) {
  const [query, setQuery] = useState(draft?.sql ?? SAMPLE_QUERY);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState(draft?.connectionId ?? '');
  const [loadingConns, setLoadingConns] = useState(true);
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const highlighted = useMemo(() => highlightSQL(query), [query]);

  const loadConnections = useCallback(async () => {
    setLoadingConns(true);
    try {
      const data = await fetchConnections();
      setConnections(data);
      if (data.length > 0 && !selectedConnId) setSelectedConnId(data[0].id);
    } catch { /* ignore */ } finally { setLoadingConns(false); }
  }, [selectedConnId]);

  const loadHistory = useCallback(async () => {
    if (!selectedConnId) return;
    try {
      const data = await fetchQueryHistory(selectedConnId);
      setHistory(data);
    } catch { /* ignore */ }
  }, [selectedConnId]);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  // A statement handed over from another page (e.g. Tables → "New Table", "Drop"…):
  // pre-fill the editor, but never run it automatically.
  useEffect(() => {
    if (!draft) return;
    setQuery(draft.sql);
    setSelectedConnId(draft.connectionId);
    setResult(null);
    setError(null);
  }, [draft]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleExecute = async () => {
    if (!selectedConnId) { setError('Please select a database connection first'); return; }
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const res = await executeQuery(selectedConnId, query, 'admin');
      setResult(res);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newQuery = query.slice(0, start) + '  ' + query.slice(end);
      setQuery(newQuery);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  };

  const selectedConn = connections.find(c => c.id === selectedConnId);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="SQL Editor"
        subtitle="Write and execute queries with syntax highlighting"
        actions={
          <>
            <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />}>Save</Button>
            <Button variant="primary" icon={executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} onClick={handleExecute}>
              {executing ? 'Executing…' : 'Run Query'}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {/* Editor + Results */}
        <div className="xl:col-span-2 space-y-3">
          {/* DB selector bar */}
          <Card className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-ink-400 shrink-0 flex items-center gap-1"><Server className="w-3.5 h-3.5" />Connection:</span>
            {loadingConns ? (
              <Loader2 className="w-3.5 h-3.5 text-ink-400 animate-spin" />
            ) : connections.length === 0 ? (
              <span className="text-xs text-amber-600">No connections — add one in Databases</span>
            ) : (
              <select
                value={selectedConnId}
                onChange={(e) => setSelectedConnId(e.target.value)}
                className="text-xs font-medium text-ink-700 bg-transparent border-none focus:outline-none cursor-pointer"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.host}:{c.port})</option>
                ))}
              </select>
            )}
            {selectedConn && <Badge tone={selectedConn.status === 'online' ? 'green' : 'slate'} dot={selectedConn.status === 'online'}>{selectedConn.engine}</Badge>}
            <div className="flex-1" />
            <span className="text-[10px] text-ink-400 hidden sm:block">⌘+Enter to run</span>
          </Card>

          {/* Code editor */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-ink-100 bg-ink-50/50">
              <Terminal className="w-3.5 h-3.5 text-ink-400" />
              <span className="text-xs font-medium text-ink-600">query.sql</span>
              <div className="flex-1" />
              <button className="text-ink-400 hover:text-ink-700"><Copy className="w-3.5 h-3.5" /></button>
              <button className="text-ink-400 hover:text-ink-700"><Download className="w-3.5 h-3.5" /></button>
            </div>
            <div className="relative sql-editor">
              <div className="flex">
                <div className="py-3 px-2 text-right text-xs text-ink-300 select-none bg-ink-50/30 border-r border-ink-100 font-mono shrink-0" style={{ minWidth: '2.5rem' }}>
                  {query.split('\n').map((_, i) => (
                    <div key={i} className="leading-6">{i + 1}</div>
                  ))}
                </div>
                <div className="relative flex-1">
                  <pre
                    className="absolute inset-0 p-3 text-xs font-mono leading-6 whitespace-pre-wrap break-words pointer-events-none overflow-hidden text-ink-900"
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    className="relative w-full p-3 text-xs font-mono leading-6 bg-transparent text-transparent caret-blue-600 resize-none focus:outline-none whitespace-pre-wrap break-words overflow-hidden"
                    style={{ minHeight: '240px' }}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Error state */}
          {error && !executing && (
            <Card className="animate-slide-up p-4">
              <div className="flex items-center gap-2 text-sm text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            </Card>
          )}

          {/* Executing */}
          {executing && (
            <Card className="p-8 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-ink-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Executing query on {selectedConn?.name}…
              </div>
            </Card>
          )}

          {/* Results */}
          {result && !executing && (
            <Card className="animate-slide-up overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-ink-100 bg-ink-50/30">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-medium text-ink-700">Query executed successfully</span>
                <div className="flex-1" />
                <span className="text-xs text-ink-400 tabular-nums">{result.rowsAffected} rows · {result.durationMs}ms</span>
              </div>
              {result.rows.length > 0 ? (
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr className="border-b border-ink-100 text-xs text-ink-400 bg-white">
                        <th className="px-3 py-2 w-10 text-right font-normal text-ink-300">#</th>
                        {result.columns.map((col) => (
                          <th key={col} className="text-left font-medium px-3 py-2 whitespace-nowrap">
                            <span className="font-mono text-blue-600">{col}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b border-ink-50 last:border-0 hover:bg-blue-50/30 transition-colors">
                          <td className="px-3 py-2 text-right text-ink-300 tabular-nums text-xs">{i + 1}</td>
                          {result.columns.map((col) => (
                            <td key={col} className="px-3 py-2 text-ink-700 text-xs font-mono whitespace-nowrap">
                              {String(row[col] ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-ink-400">
                  Query returned no rows. {result.rowsAffected > 0 && `${result.rowsAffected} row(s) affected.`}
                </div>
              )}
            </Card>
          )}

          {!result && !executing && !error && (
            <Card className="p-8 text-center">
              <Terminal className="w-8 h-8 text-ink-200 mx-auto mb-2" />
              <p className="text-sm text-ink-400">Press Run Query or ⌘+Enter to execute</p>
            </Card>
          )}
        </div>

        {/* Query history panel */}
        <div className="space-y-3">
          <Card>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100">
              <Clock className="w-4 h-4 text-ink-400" />
              <h3 className="text-sm font-semibold text-ink-900">Query History</h3>
            </div>
            <div className="divide-y divide-ink-50 max-h-96 overflow-y-auto">
              {history.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-ink-400">No queries executed yet</div>
              ) : (
                history.slice(0, 20).map((h) => (
                  <button key={h.id} className="w-full text-left px-4 py-2.5 hover:bg-ink-50/50 transition-colors group">
                    <div className="flex items-center gap-2 mb-1">
                      {h.status === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        : h.status === 'slow' ? <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        : <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                      <span className="text-[10px] text-ink-400 tabular-nums">{h.duration_ms}ms · {h.rows_affected} rows</span>
                      <span className="text-[10px] text-ink-400 ml-auto">{new Date(h.executed_at).toLocaleTimeString()}</span>
                    </div>
                    <code className="text-xs font-mono text-ink-600 block truncate group-hover:text-ink-800 transition-colors">{h.query}</code>
                  </button>
                ))
              )}
            </div>
          </Card>

          {/* Saved queries */}
          <Card>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100">
              <Save className="w-4 h-4 text-ink-400" />
              <h3 className="text-sm font-semibold text-ink-900">Saved Queries</h3>
            </div>
            <div className="divide-y divide-ink-50">
              {['Top customers (30d)', 'Revenue by category', 'Daily active users', 'Slow queries audit'].map((q, i) => (
                <button key={i} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-ink-50/50 transition-colors text-left">
                  <ChevronRight className="w-3.5 h-3.5 text-ink-300" />
                  <span className="text-xs text-ink-600">{q}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
