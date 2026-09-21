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
import type { PageKey } from '@/data/mockData';

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

  const navigate = (p: PageKey) => {
    setPage(p);
    setSidebarOpen(false);
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage onNavigate={navigate} />;
      case 'databases': return <DatabasesPage />;
      case 'tables': return <TablesPage />;
      case 'sql-editor': return <SqlEditorPage />;
      case 'query-history': return <QueryHistoryPage />;
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
        <Topbar title={pageTitles[page]} onMenuClick={() => setSidebarOpen(true)} />
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
