import { useState } from 'react';
import { Sidebar, Topbar } from '@/components/layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { DatabasesPage } from '@/pages/DatabasesPage';
import { TablesPage } from '@/pages/TablesPage';
import { SqlEditorPage } from '@/pages/SqlEditorPage';
import { QueryHistoryPage } from '@/pages/QueryHistoryPage';
import { UsersPage } from '@/pages/UsersPage';
import { ImportExportPage } from '@/pages/ImportExportPage';
import { BackupsPage } from '@/pages/BackupsPage';
import { MonitoringPage } from '@/pages/MonitoringPage';
import { SettingsPage } from '@/pages/SettingsPage';
import type { PageKey } from '@/lib/types';
import type { SqlDraft } from '@/lib/sqlTemplates';

const pageTitles: Record<PageKey, string> = {
  'dashboard': 'Dashboard',
  'databases': 'Databases',
  'tables': 'Tables',
  'sql-editor': 'SQL Editor',
  'query-history': 'Query History',
  'users': 'Users & Permissions',
  'import-export': 'Import / Export',
  'backups': 'Backups',
  'monitoring': 'Monitoring',
  'settings': 'Settings',
};

function App() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** connection currently browsed on the Tables page (kept while navigating around) */
  const [activeConnectionId, setActiveConnectionId] = useState<string | undefined>();
  /** statement handed to the SQL editor by another page */
  const [sqlDraft, setSqlDraft] = useState<SqlDraft | null>(null);

  const navigate = (p: PageKey) => {
    setSqlDraft(null);
    setPage(p);
    setSidebarOpen(false);
  };

  const browseTables = (connectionId: string) => {
    setActiveConnectionId(connectionId);
    navigate('tables');
  };

  const openSql = (connectionId: string, sql: string) => {
    setSqlDraft({ connectionId, sql, nonce: Date.now() });
    setPage('sql-editor');
    setSidebarOpen(false);
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage onNavigate={navigate} />;
      case 'databases': return <DatabasesPage onBrowseTables={browseTables} />;
      case 'tables': return (
        <TablesPage
          connectionId={activeConnectionId}
          onConnectionChange={setActiveConnectionId}
          onNavigate={navigate}
          onOpenSql={openSql}
        />
      );
      case 'sql-editor': return <SqlEditorPage draft={sqlDraft} />;
      case 'query-history': return <QueryHistoryPage onOpenSql={openSql} />;
      case 'users': return <UsersPage />;
      case 'import-export': return <ImportExportPage />;
      case 'backups': return <BackupsPage />;
      case 'monitoring': return <MonitoringPage />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar current={page} onNavigate={navigate} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={pageTitles[page]} onMenuClick={() => setSidebarOpen(true)} onNavigate={navigate} />
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          <div className="max-w-[1600px] mx-auto">
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
