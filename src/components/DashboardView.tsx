import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  FolderTree,
  Package,
  Receipt,
  Truck,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ActiveRoute, DashboardAnalytics } from '../types';
import { apiRequest } from '../utils/api';
import { formatCurrency, formatNumber } from '../utils/inventoryMath';
import { ProductThumbnail } from './ui/ProductThumbnail';

interface DashboardViewProps {
  onNavigate: (route: ActiveRoute) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<DashboardAnalytics>('/dashboard/analytics')
      .then((res) => {
        if (active) {
          setData(res);
          setError('');
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 rounded-xl border border-slate-200 bg-white p-5 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 rounded-xl border border-slate-200 bg-white animate-pulse" />
          <div className="h-80 rounded-xl border border-slate-200 bg-white animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error || 'Unable to load dashboard analytics.'}
      </div>
    );
  }

  const { kpis, monthlySales, stockAvailability, lowStockProducts, recentTransactions } = data;

  const kpiCards = [
    {
      label: 'Total Products',
      value: formatNumber(kpis.totalProducts),
      meta: `${formatNumber(kpis.outOfStockCount)} out of stock`,
      icon: Package,
      onClick: () => onNavigate('products'),
    },
    {
      label: 'Total Categories',
      value: formatNumber(kpis.totalCategories),
      meta: 'Active catalog groups',
      icon: FolderTree,
      onClick: () => onNavigate('categories'),
    },
    {
      label: 'Total Suppliers',
      value: formatNumber(kpis.totalSuppliers),
      meta: 'Verified vendors',
      icon: Truck,
      onClick: () => onNavigate('suppliers'),
    },
    {
      label: 'Total Inventory Value',
      value: formatCurrency(kpis.totalInventoryValue),
      meta: `Retail value ${formatCurrency(kpis.totalRetailValue)}`,
      icon: DollarSign,
      onClick: () => onNavigate('reports'),
    },
    {
      label: 'Low Stock Products',
      value: formatNumber(kpis.lowStockCount),
      meta: kpis.lowStockCount > 0 ? 'Requires replenishment' : 'All SKUs healthy',
      icon: AlertTriangle,
      highlight: kpis.lowStockCount > 0 ? 'amber' : 'normal',
      onClick: () => onNavigate('stock'),
    },
    {
      label: 'Total Sales',
      value: formatCurrency(kpis.totalSalesRevenue),
      meta: `${formatNumber(kpis.totalSalesCount)} completed invoices`,
      icon: Receipt,
      onClick: () => onNavigate('sales'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Operations Overview</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Live inventory valuation, stock availability, and sales performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('sales')}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Sale Invoice
          </button>
        </div>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          const isAlert = card.highlight === 'amber';
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="text-left rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-500">{card.label}</span>
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isAlert ? 'text-amber-600' : 'text-slate-400'
                  }`}
                />
              </div>
              <div
                className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${
                  isAlert ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {card.value}
              </div>
              <div className="mt-1 text-xs text-slate-500">{card.meta}</div>
            </button>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Monthly Sales Revenue</h3>
              <p className="text-xs text-slate-500">Completed invoices aggregated by month</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              View Reports
            </button>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySales} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value) || 0), 'Revenue']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#salesGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Stock Availability by Category</h3>
              <p className="text-xs text-slate-500">Product SKUs grouped by threshold health</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              Manage Catalog
            </button>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockAvailability} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val: string) =>
                    val.length > 14 ? `${val.slice(0, 12)}…` : val
                  }
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="inStock" name="In Stock" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="lowStock" name="Low Stock" stackId="a" fill="#d97706" radius={[0, 0, 0, 0]} />
                <Bar dataKey="outOfStock" name="Out of Stock" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Low Stock & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Low Stock Alerts</h3>
              <p className="text-xs text-slate-500">Items at or below minimum threshold</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              Restock Items
            </button>
          </div>
          {lowStockProducts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              All products are above minimum stock levels.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lowStockProducts.slice(0, 6).map((prod) => (
                <div key={prod.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProductThumbnail src={prod.imageUrl} alt={prod.name} sizeClass="h-9 w-9" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {prod.name}
                      </div>
                      <div className="text-xs text-slate-500 font-mono truncate">
                        {prod.sku} · Min {prod.minStockLevel}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-semibold tabular-nums ${
                        prod.quantity === 0 ? 'text-red-600' : 'text-amber-700'
                      }`}
                    >
                      {prod.quantity} left
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {prod.quantity === 0 ? 'Out of stock' : 'Low stock'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Recent Transactions</h3>
              <p className="text-xs text-slate-500">Latest sales invoices and stock movements</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              Full Ledger
            </button>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No recent transactions recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Reference</th>
                    <th className="py-2.5 px-4">Activity</th>
                    <th className="py-2.5 px-4 text-right">Amount / Qty</th>
                    <th className="py-2.5 px-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {tx.kind === 'stock_in' ? (
                            <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-blue-600" />
                          )}
                          {tx.reference}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-[240px] truncate">
                        {tx.description}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium tabular-nums text-slate-900 whitespace-nowrap">
                        {tx.amountOrQty}
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
