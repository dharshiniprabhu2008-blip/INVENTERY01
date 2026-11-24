import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useToast } from '../context/ToastContext';
import type { Product, Sale } from '../types';
import { apiRequest } from '../utils/api';
import { downloadCsv, downloadReportPdf } from '../utils/exportUtils';
import { formatCurrency, formatNumber } from '../utils/inventoryMath';

type ReportTab = 'daily' | 'weekly' | 'monthly' | 'valuation' | 'low-stock';

interface SalesReportResponse {
  period: 'daily' | 'weekly' | 'monthly';
  summary: {
    totalRevenue: number;
    totalOrders: number;
    totalUnits: number;
    averageOrderValue: number;
  };
  series: Array<{ label: string; sortKey: string; revenue: number; orders: number; units: number }>;
  sales: Sale[];
}

interface ValuationReportResponse {
  summary: {
    totalCostValue: number;
    totalRetailValue: number;
    potentialProfit: number;
    totalUnits: number;
  };
  items: Array<{
    id: string;
    name: string;
    sku: string;
    categoryName: string;
    supplierName: string;
    quantity: number;
    purchasePrice: number;
    sellingPrice: number;
    costValue: number;
    retailValue: number;
    potentialProfit: number;
  }>;
}

interface LowStockReportResponse {
  count: number;
  outOfStockCount: number;
  items: Array<
    Product & {
      status: string;
      deficit: number;
      recommendedRestock: number;
    }
  >;
}

const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'daily', label: 'Daily Sales' },
  { id: 'weekly', label: 'Weekly Sales' },
  { id: 'monthly', label: 'Monthly Sales' },
  { id: 'valuation', label: 'Inventory Valuation' },
  { id: 'low-stock', label: 'Low-Stock Report' },
];

export function ReportsView() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<ReportTab>('monthly');
  const [loading, setLoading] = useState(true);
  const [salesReport, setSalesReport] = useState<SalesReportResponse | null>(null);
  const [valuationReport, setValuationReport] = useState<ValuationReportResponse | null>(null);
  const [lowStockReport, setLowStockReport] = useState<LowStockReportResponse | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'daily' || tab === 'weekly' || tab === 'monthly') {
        const res = await apiRequest<SalesReportResponse>(`/reports/sales?period=${tab}`);
        setSalesReport(res);
      } else if (tab === 'valuation') {
        const res = await apiRequest<ValuationReportResponse>('/reports/valuation');
        setValuationReport(res);
      } else {
        const res = await apiRequest<LowStockReportResponse>('/reports/low-stock');
        setLowStockReport(res);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, showToast]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleExportCsv = () => {
    if ((tab === 'daily' || tab === 'weekly' || tab === 'monthly') && salesReport) {
      downloadCsv(
        `stockmaster-${tab}-sales.csv`,
        ['Period', 'Orders', 'Units Sold', 'Revenue'],
        salesReport.series.map((r) => [r.label, r.orders, r.units, r.revenue.toFixed(2)])
      );
      showToast('Exported sales CSV report');
    } else if (tab === 'valuation' && valuationReport) {
      downloadCsv(
        'stockmaster-inventory-valuation.csv',
        ['SKU', 'Product', 'Category', 'Qty', 'Unit Cost', 'Cost Value', 'Retail Value', 'Margin'],
        valuationReport.items.map((it) => [
          it.sku,
          it.name,
          it.categoryName,
          it.quantity,
          it.purchasePrice.toFixed(2),
          it.costValue.toFixed(2),
          it.retailValue.toFixed(2),
          it.potentialProfit.toFixed(2),
        ])
      );
      showToast('Exported valuation CSV report');
    } else if (tab === 'low-stock' && lowStockReport) {
      downloadCsv(
        'stockmaster-low-stock.csv',
        ['SKU', 'Product', 'Category', 'Supplier', 'Available', 'Min Level', 'Recommended Order'],
        lowStockReport.items.map((it) => [
          it.sku,
          it.name,
          it.categoryName || '',
          it.supplierName || '',
          it.quantity,
          it.minStockLevel,
          it.recommendedRestock,
        ])
      );
      showToast('Exported low-stock CSV report');
    }
  };

  const handleExportPdf = () => {
    if ((tab === 'daily' || tab === 'weekly' || tab === 'monthly') && salesReport) {
      const label = tab.charAt(0).toUpperCase() + tab.slice(1);
      downloadReportPdf(
        `${label} Sales Report`,
        `Total Revenue: ${formatCurrency(salesReport.summary.totalRevenue)} · ${salesReport.summary.totalOrders} Orders`,
        ['Period', 'Orders', 'Units Sold', 'Revenue'],
        salesReport.series.map((r) => [r.label, r.orders, r.units, formatCurrency(r.revenue)]),
        `stockmaster-${tab}-sales.pdf`
      );
      showToast('Exported sales PDF report');
    } else if (tab === 'valuation' && valuationReport) {
      downloadReportPdf(
        'Inventory Valuation Report',
        `Cost Value: ${formatCurrency(valuationReport.summary.totalCostValue)} · Retail Value: ${formatCurrency(valuationReport.summary.totalRetailValue)}`,
        ['SKU', 'Product', 'Qty', 'Cost Value', 'Retail Value', 'Potential Profit'],
        valuationReport.items.map((it) => [
          it.sku,
          it.name,
          it.quantity,
          formatCurrency(it.costValue),
          formatCurrency(it.retailValue),
          formatCurrency(it.potentialProfit),
        ]),
        'stockmaster-inventory-valuation.pdf'
      );
      showToast('Exported valuation PDF report');
    } else if (tab === 'low-stock' && lowStockReport) {
      downloadReportPdf(
        'Low-Stock Replenishment Report',
        `${lowStockReport.count} SKUs require attention (${lowStockReport.outOfStockCount} out of stock)`,
        ['SKU', 'Product', 'Supplier', 'Available', 'Min Level', 'Recommended Order'],
        lowStockReport.items.map((it) => [
          it.sku,
          it.name,
          it.supplierName || '',
          it.quantity,
          it.minStockLevel,
          it.recommendedRestock,
        ]),
        'stockmaster-low-stock.pdf'
      );
      showToast('Exported low-stock PDF report');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Reports &amp; Analytics</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Inspect sales cadence, asset valuation, and replenishment forecasts with CSV and PDF export.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 w-fit">
        {REPORT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              tab === t.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-80 rounded-xl border border-slate-200 bg-white animate-pulse" />
      ) : (tab === 'daily' || tab === 'weekly' || tab === 'monthly') && salesReport ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Total Revenue</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(salesReport.summary.totalRevenue)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Completed Orders</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                {formatNumber(salesReport.summary.totalOrders)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Units Sold</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                {formatNumber(salesReport.summary.totalUnits)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Avg. Order Value</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(salesReport.summary.averageOrderValue)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-4 capitalize">
              {tab} Sales Breakdown
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesReport.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => [formatCurrency(Number(v) || 0), 'Revenue']} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4 text-right">Orders</th>
                    <th className="py-3 px-4 text-right">Units Sold</th>
                    <th className="py-3 px-4 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesReport.series.map((row) => (
                    <tr key={row.sortKey} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-medium text-slate-900">{row.label}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{row.orders}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{row.units}</td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums text-slate-900">
                        {formatCurrency(row.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : tab === 'valuation' && valuationReport ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Total Units on Hand</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                {formatNumber(valuationReport.summary.totalUnits)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Total Cost Valuation</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(valuationReport.summary.totalCostValue)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Total Retail Valuation</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(valuationReport.summary.totalRetailValue)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Projected Gross Margin</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-700">
                {formatCurrency(valuationReport.summary.potentialProfit)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Cost Value</th>
                    <th className="py-3 px-4 text-right">Retail Value</th>
                    <th className="py-3 px-4 text-right">Potential Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {valuationReport.items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{it.sku}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{it.name}</td>
                      <td className="py-3 px-4 text-slate-600">{it.categoryName}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{it.quantity}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatCurrency(it.costValue)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatCurrency(it.retailValue)}</td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums text-emerald-700">
                        {formatCurrency(it.potentialProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : tab === 'low-stock' && lowStockReport ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Low-Stock SKUs</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-amber-700">
                {lowStockReport.count}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Out of Stock SKUs</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-red-600">
                {lowStockReport.outOfStockCount}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {lowStockReport.items.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No products are currently below minimum stock levels.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4 text-right">Available</th>
                      <th className="py-3 px-4 text-right">Min Level</th>
                      <th className="py-3 px-4 text-right">Recommended Restock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lowStockReport.items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{it.sku}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{it.name}</td>
                        <td className="py-3 px-4 text-slate-600">{it.supplierName}</td>
                        <td
                          className={`py-3 px-4 text-right font-semibold tabular-nums ${
                            it.quantity === 0 ? 'text-red-600' : 'text-amber-700'
                          }`}
                        >
                          {it.quantity}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                          {it.minStockLevel}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold tabular-nums text-blue-700">
                          +{it.recommendedRestock} units
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          <Download className="h-5 w-5 mx-auto mb-2 text-slate-400" />
          No report records available.
        </div>
      )}
    </div>
  );
}
