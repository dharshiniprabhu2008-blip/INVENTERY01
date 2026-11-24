import { useCallback, useEffect, useState } from 'react';
import { AuthView } from './components/AuthView';
import { CategoriesView } from './components/CategoriesView';
import { DashboardView } from './components/DashboardView';
import { Layout } from './components/Layout';
import { ProductsView } from './components/ProductsView';
import { ReportsView } from './components/ReportsView';
import { SalesView } from './components/SalesView';
import { SettingsView } from './components/SettingsView';
import { StockView } from './components/StockView';
import { SuppliersView } from './components/SuppliersView';
import { UsersView } from './components/UsersView';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import type { ActiveRoute } from './types';
import { apiRequest } from './utils/api';

function StockMasterApp() {
  const { user, initializing } = useAuth();
  const [activeRoute, setActiveRoute] = useState<ActiveRoute>('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');
  const [lowStockCount, setLowStockCount] = useState(0);

  const refreshAlertsCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest<{ count: number }>('/stock/alerts');
      setLowStockCount(res.count);
    } catch {
      // Ignore transient probe errors
    }
  }, [user]);

  useEffect(() => {
    void refreshAlertsCount();
  }, [refreshAlertsCount]);

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading StockMaster...
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return (
    <Layout
      activeRoute={activeRoute}
      onNavigate={setActiveRoute}
      globalSearch={globalSearch}
      onGlobalSearch={setGlobalSearch}
      lowStockCount={lowStockCount}
    >
      {activeRoute === 'dashboard' && <DashboardView onNavigate={setActiveRoute} />}
      {activeRoute === 'products' && (
        <ProductsView globalSearch={globalSearch} onDataChanged={refreshAlertsCount} />
      )}
      {activeRoute === 'categories' && <CategoriesView onDataChanged={refreshAlertsCount} />}
      {activeRoute === 'suppliers' && <SuppliersView onDataChanged={refreshAlertsCount} />}
      {activeRoute === 'stock' && <StockView onDataChanged={refreshAlertsCount} />}
      {activeRoute === 'sales' && <SalesView onDataChanged={refreshAlertsCount} />}
      {activeRoute === 'reports' && <ReportsView />}
      {activeRoute === 'users' && <UsersView />}
      {activeRoute === 'settings' && <SettingsView onNavigate={setActiveRoute} />}
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <StockMasterApp />
      </AuthProvider>
    </ToastProvider>
  );
}
