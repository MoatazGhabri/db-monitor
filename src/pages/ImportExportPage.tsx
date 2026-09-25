import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Download, FileText, CheckCircle2, AlertCircle, Loader2, FileUp, Database } from 'lucide-react';
import { Card, Badge, Button, PageHeader } from '@/components/ui';
import {
  fetchConnections, fetchTables, fetchIoJobs, exportData, importData,
  type DbConnection, type TableSummary, type IoJob,
} from '@/lib/api';
import { formatBytes, timeAgo } from '@/lib/format';

export function ImportExportPage() {
  const [mode, setMode] = useState<'import' | 'export'>('import');
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [connId, setConnId] = useState('');
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [jobs, setJobs] = useState<IoJob[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);

  // import state
  const [file, setFile] = useState<File | null>(null);
  const [importFormat, setImportFormat] = useState<'sql' | 'csv' | 'json'>('sql');
  const [tableName, setTableName] = useState('');
  const [createTable, setCreateTable] = useState(true);
  const [truncate, setTruncate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // export state
  const [exportFormat, setExportFormat] = useState<'sql' | 'csv' | 'json'>('sql');
  const [exportTable, setExportTable] = useState('');
  const [gzip, setGzip] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnections().then((c) => { setConnections(c); setConnId((cur) => cur || (c.find((x) => x.status === 'online') ?? c[0])?.id || ''); }).catch(() => {});
    refreshJobs();
  }, []);

  useEffect(() => { if (connId) fetchTables(connId).then((r) => setTables(r.tables)).catch(() => setTables([])); else setTables([]); }, [connId]);

  const refreshJobs = useCallback(() => {
    fetchIoJobs().then((r) => { setJobs(r.jobs); setJobsError(null); }).catch((err) => setJobsError(err instanceof Error ? err.message : 'Failed to load jobs'));
  }, []);

  const detectFormat = (name: string): 'sql' | 'csv' | 'json' => {
    if (name.endsWith('.csv')) return 'csv';
    if (name.endsWith('.json')) return 'json';
    return 'sql';
  };

  const pickFile = (f: File | null) => {
    setFile(f);
    setImportResult(null);
    if (f) {
      const fmt = detectFormat(f.name);
      setImportFormat(fmt);
      if (fmt === 'csv') setTableName(f.name.replace(/\.csv$/i, '').replace(/[^\w]+/g, '_').toLowerCase());
    }
  };

  const runImport = async () => {
    if (!file || !connId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const content = await file.text();
      const res = await importData({
        connectionId: connId, format: importFormat, filename: file.name, content,
        tableName: tableName || undefined, createTable, truncate,
      });
      const msg = importFormat === 'sql'
        ? `${res.statements} statement${res.statements === 1 ? '' : 's'} executed${res.failed ? `, ${res.failed} failed` : ''}`
        : `${res.rows} row${res.rows === 1 ? '' : 's'} imported`;
      setImportResult({ ok: res.success, message: res.success ? msg : (res.errors[0]?.error || msg) });
      if (res.success) { setFile(null); fetchTables(connId).then((r) => setTables(r.tables)).catch(() => {}); }
    } catch (err) {
      setImportResult({ ok: false, message: err instanceof Error ? err.message : 'Import failed' });
    } finally {
      setImporting(false);
      refreshJobs();
    }
  };

  const runExport = async () => {
    if (!connId) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportData({ connectionId: connId, format: exportFormat, tables: exportTable ? [exportTable] : undefined, gzip: exportFormat !== 'csv' && gzip });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      refreshJobs();
    }
  };

  const conn = connections.find((c) => c.id === connId);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Import / Export" subtitle="Migrate data in and out of your real databases" />

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <span className="text-xs text-ink-400 shrink-0">Database:</span>
        {connections.map((c) => (
          <button key={c.id} onClick={() => setConnId(c.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${c.id === connId ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />{c.name}
          </button>
        ))}
        {connections.length === 0 && <span className="text-xs text-ink-400">Connect a database first</span>}
      </div>

      <Card className="mb-5 overflow-hidden">
        <div className="flex border-b border-ink-100">
          <button onClick={() => setMode('import')} className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${mode === 'import' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30' : 'text-ink-400 hover:text-ink-700'}`}>
            <Upload className="w-4 h-4" /> Import Data
          </button>
          <button onClick={() => setMode('export')} className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${mode === 'export' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30' : 'text-ink-400 hover:text-ink-700'}`}>
            <Download className="w-4 h-4" /> Export Data
          </button>
        </div>

        <div className="p-6">
          {mode === 'import' ? (
            <div className="space-y-4">
              <div
                ref={dropRef}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]); }}
                onClick={() => document.getElementById('import-file-input')?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer group ${dragOver ? 'border-blue-400 bg-blue-50/30' : 'border-ink-200 hover:border-blue-400 hover:bg-blue-50/30'}`}
              >
                <input id="import-file-input" type="file" accept=".sql,.csv,.json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                <div className="w-14 h-14 rounded-2xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center mx-auto mb-4 transition-colors">
                  <FileUp className="w-7 h-7 text-blue-600" />
                </div>
                {file ? (
                  <p className="text-sm font-medium text-ink-800">{file.name} <span className="text-ink-400 font-normal">({formatBytes(file.size)})</span></p>
                ) : (
                  <p className="text-sm font-medium text-ink-800">Drop your file here, or click to browse</p>
                )}
                <p className="text-xs text-ink-400 mt-1">Supports SQL, CSV, JSON</p>
              </div>

              {file && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-600 mb-1.5">Format</label>
                    <select value={importFormat} onChange={(e) => setImportFormat(e.target.value as typeof importFormat)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                      <option value="sql">SQL script</option><option value="csv">CSV</option><option value="json">JSON</option>
                    </select>
                  </div>
                  {importFormat !== 'sql' && (
                    <div>
                      <label className="block text-xs font-medium text-ink-600 mb-1.5">Destination table</label>
                      <input list="import-tables" type="text" value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="table_name"
                        className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                      <datalist id="import-tables">{tables.map((t) => <option key={t.name} value={t.name} />)}</datalist>
                    </div>
                  )}
                </div>
              )}
              {file && importFormat !== 'sql' && (
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-xs text-ink-500 cursor-pointer">
                    <input type="checkbox" checked={createTable} onChange={(e) => setCreateTable(e.target.checked)} className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
                    Create the table if it does not exist
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink-500 cursor-pointer">
                    <input type="checkbox" checked={truncate} onChange={(e) => setTruncate(e.target.checked)} className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
                    Empty the table first
                  </label>
                </div>
              )}

              {importResult && (
                <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${importResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
                  {importResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span>{importResult.message}</span>
                </div>
              )}

              <Button variant="primary" icon={importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                disabled={!file || !connId || importing || (importFormat !== 'sql' && !tableName.trim())} onClick={runImport}>
                {importing ? 'Importing…' : 'Start Import'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">Format</label>
                  <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="sql">SQL Dump</option><option value="csv">CSV (single table)</option><option value="json">JSON</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">Table {exportFormat !== 'csv' && '(optional — leave empty for all)'}</label>
                  <select value={exportTable} onChange={(e) => setExportTable(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="">{exportFormat === 'csv' ? 'Choose a table…' : 'All tables'}</option>
                    {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              {exportError && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertCircle className="w-4 h-4 shrink-0" />{exportError}</div>}
              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="primary" icon={exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  disabled={!connId || exporting || (exportFormat === 'csv' && !exportTable)} onClick={runExport}>
                  {exporting ? 'Preparing…' : 'Start Export'}
                </Button>
                {exportFormat !== 'csv' && (
                  <label className="flex items-center gap-2 text-xs text-ink-500 cursor-pointer">
                    <input type="checkbox" checked={gzip} onChange={(e) => setGzip(e.target.checked)} className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
                    Compress with gzip
                  </label>
                )}
              </div>
            </div>
          )}
          {!conn && <p className="text-xs text-ink-400 mt-3">Select a database above to {mode}.</p>}
        </div>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900">Recent Jobs</h3>
          <Button variant="secondary" size="sm" onClick={refreshJobs}>Refresh</Button>
        </div>
        {jobsError && <div className="px-5 py-3 text-sm text-rose-600">{jobsError}</div>}
        <div className="divide-y divide-ink-50">
          {jobs.map((job) => (
            <div key={job.id} className="px-5 py-3 hover:bg-ink-50/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${job.type === 'Import' ? 'bg-blue-50' : 'bg-emerald-50'}`}>
                  {job.type === 'Import' ? <Upload className="w-4 h-4 text-blue-600" /> : <Download className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-800 truncate">{job.filename || job.target || job.type}</span>
                    <Badge tone="slate">{job.format}</Badge>
                    <Badge tone={job.status === 'Completed' ? 'green' : job.status === 'Failed' ? 'red' : 'amber'} dot={job.status === 'running'}>{job.status === 'running' ? 'Running' : job.status}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-400 flex-wrap">
                    <span className="flex items-center gap-1"><Database className="w-3 h-3" />{job.connection_name}</span>
                    {job.target && job.target !== job.filename && <span>{job.target}</span>}
                    {job.size_bytes > 0 && <span>{formatBytes(job.size_bytes)}</span>}
                    {job.rows_count > 0 && <span>{job.rows_count} rows</span>}
                    <span>{timeAgo(job.created_at)}</span>
                  </div>
                  {job.error && <p className="text-[11px] text-rose-600 mt-1 truncate" title={job.error}>{job.error}</p>}
                </div>
                <div className="shrink-0">
                  {job.status === 'Completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : job.status === 'Failed' ? <AlertCircle className="w-4 h-4 text-rose-500" /> : <FileText className="w-4 h-4 text-ink-300" />}
                </div>
              </div>
            </div>
          ))}
          {jobs.length === 0 && !jobsError && <div className="py-12 text-center text-sm text-ink-400">No import/export jobs yet</div>}
        </div>
      </Card>
    </div>
  );
}
