import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Search,
  Settings,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { ActiveRoute } from '../types';

interface LayoutProps {
  activeRoute: ActiveRoute;
  onNavigate: (route: ActiveRoute) => void;
  globalSearch: string;
  onGlobalSearch: (query: string) => void;
  lowStockCount: number;
  children: React.ReactNode;
}

const ROUTE_TITLES: Record<ActiveRoute, string> = {
  dashboard: 'Dashboard',
  products: 'Products',
  categories: 'Categories',
  suppliers: 'Suppliers',
  stock: 'Stock Management',
  sales: 'Sales',
  reports: 'Reports',
  users: 'Users',
  settings: 'Settings',
};

export function Layout({
  activeRoute,
  onNavigate,
  globalSearch,
  onGlobalSearch,
  lowStockCount,
  children,
}: LayoutProps) {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{
    id: ActiveRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'categories', label: 'Categories', icon: FolderTree },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'stock', label: 'Stock Management', icon: ArrowLeftRight },
    { id: 'sales', label: 'Sales', icon: Receipt },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users, adminOnly: true },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (route: ActiveRoute) => {
    onNavigate(route);
    setMobileMenuOpen(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRoute !== 'products') {
      onNavigate('products');
    }
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Boxes className="h-4 w-4" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            StockMaster
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeRoute === item.id;
          const restricted = item.adminOnly && user?.role !== 'admin';
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'stock' && lowStockCount > 0 && (
                <span className="text-xs font-semibold tabular-nums text-amber-700">
                  {lowStockCount}
                </span>
              )}
              {restricted && (
                <span className="text-[11px] font-medium text-slate-400">Admin</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3 shrink-0">
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[80vw] h-full">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                Workspace
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display text-base sm:text-lg font-semibold text-slate-900 truncate">
                {ROUTE_TITLES[activeRoute]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <form onSubmit={handleSearchSubmit} className="hidden md:block relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={globalSearch}
                onChange={(e) => {
                  onGlobalSearch(e.target.value);
                  if (e.target.value.trim() && activeRoute !== 'products') {
                    onNavigate('products');
                  }
                }}
                placeholder="Search products or SKU..."
                aria-label="Global product search"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
            </form>

            {lowStockCount > 0 && (
              <button
                type="button"
                onClick={() => handleNavClick('stock')}
                aria-label={`${lowStockCount} low stock alerts`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span className="tabular-nums">{lowStockCount} Low Stock</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleNavClick('settings')}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              aria-label="Open account settings"
            >
              <img
                src={user?.avatarUrl || '/src/assets/images/avatar_manager_1795368919229.jpg'}
                alt={user?.name || 'User avatar'}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-lg object-cover border border-slate-200 bg-slate-100"
              />
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-900 leading-tight max-w-[120px] truncate">
                  {user?.name}
                </div>
                <div className="text-[11px] text-slate-500 capitalize leading-tight">
                  {user?.role}
                </div>
              </div>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
