import React, { useCallback, useEffect, useState } from 'react';
import { Download, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import type { Product, Sale } from '../types';
import { apiRequest } from '../utils/api';
import { downloadInvoicePdf } from '../utils/exportUtils';
import { calculateSaleTotals, formatCurrency, validateStockSufficiency } from '../utils/inventoryMath';
import { DataPagination } from './ui/DataPagination';
import { Modal } from './ui/Modal';

interface DraftSaleLine {
  productId: string;
  quantity: number;
}

export function SalesView({ onDataChanged }: { onDataChanged: () => void }) {
  const { showToast } = useToast();

  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });

  const [createOpen, setCreateOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'invoice' | 'card' | 'cash' | 'bank_transfer'>(
    'invoice'
  );
  const [taxRatePct, setTaxRatePct] = useState('8');
  const [lines, setLines] = useState<DraftSaleLine[]>([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [invoiceSale, setInvoiceSale] = useState<Sale | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search.trim()) params.set('search', search.trim());

      const [salesRes, prodRes] = await Promise.all([
        apiRequest<{
          sales: Sale[];
          pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/sales?${params.toString()}`),
        apiRequest<{ products: Product[] }>('/products?limit=100'),
      ]);
      setSales(salesRes.sales);
      setPagination(salesRes.pagination);
      setProducts(prodRes.products);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load sales', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, showToast]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const openNewSaleModal = () => {
    const firstAvailable = products.find((p) => p.quantity > 0) || products[0];
    setCustomerName('');
    setCustomerEmail('');
    setPaymentMethod('invoice');
    setTaxRatePct('8');
    setLines(firstAvailable ? [{ productId: firstAvailable.id, quantity: 1 }] : []);
    setFormError('');
    setCreateOpen(true);
  };

  const addLine = () => {
    const firstAvailable = products.find((p) => p.quantity > 0) || products[0];
    if (!firstAvailable) return;
    setLines((prev) => [...prev, { productId: firstAvailable.id, quantity: 1 }]);
  };

  const updateLine = (idx: number, patch: Partial<DraftSaleLine>) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const productsById = new Map(products.map((p) => [p.id, p]));
  const taxRate = Math.max(0, Number(taxRatePct) || 0) / 100;
  const computedTotals = calculateSaleTotals(
    lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: productsById.get(l.productId)?.sellingPrice || 0,
    })),
    taxRate
  );

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (customerName.trim().length < 2) {
      setFormError('Customer or company name is required.');
      return;
    }

    const stockValidation = validateStockSufficiency(lines, productsById);
    if (!stockValidation.ok) {
      setFormError(stockValidation.errors[0]);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ sale: Sale }>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          paymentMethod,
          taxRate,
          items: lines,
        }),
      });
      showToast(`Invoice ${res.sale.invoiceNumber} created and stock updated`);
      setCreateOpen(false);
      setInvoiceSale(res.sale);
      await loadSales();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to process sale');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Sales &amp; Invoices</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Create customer orders with automatic stock validation, deductions, and PDF invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewSaleModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Sale
        </button>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by invoice #, customer, or product..."
            aria-label="Search sales history"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Sales Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : sales.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No sales recorded</p>
            <p className="mt-1 text-sm text-slate-500">Create a sale to generate an invoice and update stock.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">Invoice</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4 text-right">Items</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700 whitespace-nowrap">
                        {sale.invoiceNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{sale.customerName}</div>
                        {sale.customerEmail && (
                          <div className="text-xs text-slate-500">{sale.customerEmail}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                        {sale.items.reduce((s, it) => s + it.quantity, 0)} units
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-600 whitespace-nowrap">
                        {sale.paymentMethod.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatCurrency(sale.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {new Date(sale.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setInvoiceSale(sale)}
                            aria-label={`View invoice ${sale.invoiceNumber}`}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadInvoicePdf(sale)}
                            aria-label={`Download PDF for ${sale.invoiceNumber}`}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700 cursor-pointer"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataPagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* Create Sale Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Sale"
        subtitle="Select products and quantities. Stock levels are verified and updated atomically."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleCreateSale} className="space-y-4">
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sale-customer" className="block text-sm font-medium text-slate-700 mb-1">
                Customer / Company
              </label>
              <input
                id="sale-customer"
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Acme Logistics Inc."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sale-email" className="block text-sm font-medium text-slate-700 mb-1">
                Customer Email (optional)
              </label>
              <input
                id="sale-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="billing@acme.com"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sale-payment" className="block text-sm font-medium text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                id="sale-payment"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as 'invoice' | 'card' | 'cash' | 'bank_transfer'
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="invoice">Net Invoice</option>
                <option value="card">Corporate Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div>
              <label htmlFor="sale-tax" className="block text-sm font-medium text-slate-700 mb-1">
                Tax Rate (%)
              </label>
              <input
                id="sale-tax"
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Order Line Items</span>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Line Item
              </button>
            </div>

            <div className="space-y-2.5">
              {lines.map((line, idx) => {
                const prod = productsById.get(line.productId);
                const lineTotal = (prod?.sellingPrice || 0) * line.quantity;
                return (
                  <div
                    key={idx}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                  >
                    <select
                      aria-label={`Line item ${idx + 1} product`}
                      value={line.productId}
                      onChange={(e) => updateLine(idx, { productId: e.target.value })}
                      className="flex-1 min-w-[180px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id} disabled={p.quantity === 0}>
                          {p.name} ({p.quantity} in stock · {formatCurrency(p.sellingPrice)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      aria-label={`Line item ${idx + 1} quantity`}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    <div className="w-24 text-right text-sm font-medium tabular-nums text-slate-900">
                      {formatCurrency(lineTotal)}
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        aria-label={`Remove line item ${idx + 1}`}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums font-medium text-slate-900">
                {formatCurrency(computedTotals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax ({taxRatePct || 0}%)</span>
              <span className="tabular-nums font-medium text-slate-900">
                {formatCurrency(computedTotals.taxAmount)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(computedTotals.totalAmount)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Processing...' : 'Complete Sale & Generate Invoice'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Invoice Preview Modal */}
      <Modal
        open={Boolean(invoiceSale)}
        onClose={() => setInvoiceSale(null)}
        title={invoiceSale ? `Invoice ${invoiceSale.invoiceNumber}` : 'Invoice'}
        subtitle={invoiceSale ? `Issued to ${invoiceSale.customerName}` : undefined}
        maxWidthClass="max-w-xl"
      >
        {invoiceSale && (
          <div className="space-y-5">
            <div className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-4 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Bill To
                </div>
                <div className="mt-1 font-semibold text-slate-900">{invoiceSale.customerName}</div>
                {invoiceSale.customerEmail && (
                  <div className="text-slate-500">{invoiceSale.customerEmail}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">
                  Date:{' '}
                  {new Date(invoiceSale.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="text-xs text-slate-500 capitalize">
                  Method: {invoiceSale.paymentMethod.replace('_', ' ')}
                </div>
                <div className="text-xs text-slate-500">Issued by: {invoiceSale.createdBy}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Unit Price</th>
                    <th className="py-2 pl-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoiceSale.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-900">{item.productName}</div>
                        <div className="font-mono text-xs text-slate-500">{item.sku}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-medium tabular-nums">
                        {formatCurrency(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(invoiceSale.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax ({Math.round(invoiceSale.taxRate * 100)}%)</span>
                <span className="tabular-nums">{formatCurrency(invoiceSale.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1">
                <span>Total Amount</span>
                <span className="tabular-nums">{formatCurrency(invoiceSale.totalAmount)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setInvoiceSale(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => downloadInvoicePdf(invoiceSale)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                Download PDF Invoice
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
