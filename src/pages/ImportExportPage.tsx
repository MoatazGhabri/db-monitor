import { useState } from 'react';
import { Upload, Download, FileText, CheckCircle2, AlertCircle, Loader2, FileUp, Database } from 'lucide-react';
import { Card, Badge, Button, statusTone, PageHeader, Progress } from '@/components/ui';
import { importExportJobs } from '@/data/mockData';

export function ImportExportPage() {
  const [mode, setMode] = useState<'import' | 'export'>('import');

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Import / Export"
        subtitle="Migrate data in and out of your databases"
      />

      {/* Drop zone */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex border-b border-ink-100">
          <button
            onClick={() => setMode('import')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${
              mode === 'import' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30' : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            <Upload className="w-4 h-4" /> Import Data
          </button>
          <button
            onClick={() => setMode('export')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${
              mode === 'export' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30' : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            <Download className="w-4 h-4" /> Export Data
          </button>
        </div>

        <div className="p-6">
          {mode === 'import' ? (
            <div className="border-2 border-dashed border-ink-200 rounded-xl p-10 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center mx-auto mb-4 transition-colors">
                <FileUp className="w-7 h-7 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-ink-800">Drop your file here, or click to browse</p>
              <p className="text-xs text-ink-400 mt-1">Supports CSV, JSON, SQL, Parquet · Max 5 GB</p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button variant="primary" size="sm">Select File</Button>
                <select className="text-xs bg-white border border-ink-200 rounded-lg px-3 py-1.5 text-ink-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option>ecommerce_prod</option>
                  <option>analytics</option>
                  <option>immobilier_tn</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">Database</label>
                  <select className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option>ecommerce_prod</option>
                    <option>analytics</option>
                    <option>immobilier_tn</option>
                    <option>data_warehouse</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">Format</label>
                  <select className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option>SQL Dump</option>
                    <option>CSV</option>
                    <option>JSON</option>
                    <option>Parquet</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-600 mb-1.5">Tables (optional — leave empty for all)</label>
                <input type="text" placeholder="users, orders, products…" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div className="flex items-center gap-3">
                <Button variant="primary" icon={<Download className="w-3.5 h-3.5" />}>Start Export</Button>
                <label className="flex items-center gap-2 text-xs text-ink-500 cursor-pointer">
                  <input type="checkbox" className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
                  Compress with gzip
                </label>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Recent jobs */}
      <Card>
        <div className="px-5 py-3 border-b border-ink-100">
          <h3 className="text-sm font-semibold text-ink-900">Recent Jobs</h3>
        </div>
        <div className="divide-y divide-ink-50">
          {importExportJobs.map((job) => (
            <div key={job.id} className="px-5 py-3 hover:bg-ink-50/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  job.type === 'Import' ? 'bg-blue-50' : 'bg-emerald-50'
                }`}>
                  {job.type === 'Import' ? <Upload className="w-4 h-4 text-blue-600" /> : <Download className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-800 truncate">{job.filename}</span>
                    <Badge tone="slate">{job.format}</Badge>
                    <Badge tone={statusTone(job.status)} dot={job.status === 'In Progress'}>{job.status}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-400 flex-wrap">
                    <span className="flex items-center gap-1"><Database className="w-3 h-3" />{job.database}</span>
                    <span>{job.size}</span>
                    <span>{job.timestamp}</span>
                  </div>
                </div>
                <div className="shrink-0 w-24">
                  {job.status === 'In Progress' ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                      <Progress value={job.progress} tone="blue" />
                      <span className="text-xs text-ink-500 tabular-nums">{job.progress}%</span>
                    </div>
                  ) : job.status === 'Completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />
                  ) : job.status === 'Failed' ? (
                    <AlertCircle className="w-4 h-4 text-rose-500 ml-auto" />
                  ) : (
                    <FileText className="w-4 h-4 text-ink-300 ml-auto" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
