import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import type { Product, StockMovement, Supplier } from '../types';
import { apiRequest } from '../utils/api';
import { DataPagination } from './ui/DataPagination';
import { Modal } from './ui/Modal';

export function StockView({ onDataChanged }: { onDataChanged: () => void }) {
  const { showToast } = useToast();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [alerts, setAlerts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });

  const [modalOpen, setModalOpen] = useState(false);
  const [moveType, setMoveType] = useState<'in' | 'out'>('in');
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());

      const [movRes, alertRes, prodRes, supRes] = await Promise.all([
        apiRequest<{
          movements: StockMovement[];
          pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/stock/movements?${params.toString()}`),
        apiRequest<{ alerts: Product[] }>('/stock/alerts'),
        apiRequest<{ products: Product[] }>('/products?limit=100'),
        apiRequest<{ suppliers: Supplier[] }>('/suppliers'),
      ]);

      setMovements(movRes.movements);
      setPagination(movRes.pagination);
      setAlerts(alertRes.alerts);
      setProducts(prodRes.products);
      setSuppliers(supRes.suppliers);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load stock movements', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, search, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openMovementModal = (type: 'in' | 'out', presetProduct?: Product) => {
    setMoveType(type);
    const chosen = presetProduct || products[0];
    setProductId(chosen?.id || '');
    setSupplierId(chosen?.supplierId || suppliers[0]?.id || '');
    setQuantity(type === 'in' ? '10' : '1');
    setReference('');
    setNotes('');
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const qty = Number(quantity);
    if (!productId) {
      setFormError('Please select a product.');
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setFormError('Quantity must be a positive whole number.');
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          type: moveType,
          quantity: qty,
          supplierId: moveType === 'in' ? supplierId : undefined,
          reference: reference.trim(),
          notes: notes.trim(),
        }),
      });
      showToast(
        moveType === 'in'
          ? `Recorded stock-in of ${qty} units`
          : `Recorded stock-out of ${qty} units`
      );
      setModalOpen(false);
      await loadData();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to record stock movement');
    } finally {
      setSaving(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Stock Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Execute stock-in receipts, stock-out dispatches, and monitor low-stock thresholds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openMovementModal('out')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowUpRight className="h-4 w-4 text-amber-600" />
            Stock Out
          </button>
          <button
            type="button"
            onClick={() => openMovementModal('in')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <ArrowDownLeft className="h-4 w-4" />
            Stock In
          </button>
        </div>
      </div>

      {/* Low Stock Notification Strip */}
      {alerts.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/70 px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>Low-Stock Notifications ({alerts.length})</span>
            </div>
            <span className="text-xs text-amber-800">Immediate restock recommended</span>
          </div>
          <div className="divide-y divide-slate-100">
            {alerts.map((prod) => (
              <div key={prod.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{prod.name}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    {prod.sku} · Supplier: {prod.supplierName} · Threshold: {prod.minStockLevel}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      prod.quantity === 0 ? 'text-red-600' : 'text-amber-700'
                    }`}
                  >
                    {prod.quantity} available
                  </span>
                  <button
                    type="button"
                    onClick={() => openMovementModal('in', prod)}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    Restock
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Movement Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search movements by product, SKU, or reference..."
            aria-label="Search stock movements"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', 'in', 'out'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === t
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'all' ? 'All Movements' : t === 'in' ? 'Stock In' : 'Stock Out'}
            </button>
          ))}
        </div>
      </div>

      {/* Movement History Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : movements.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No stock movement records found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Reference &amp; Notes</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Balance</th>
                    <th className="py-3 px-4">Performed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {new Date(mov.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {mov.type === 'in' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                            Stock In
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Stock Out
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{mov.productName}</div>
                        <div className="font-mono text-xs text-slate-500">{mov.sku}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs text-slate-700">{mov.reference || '—'}</div>
                        {mov.notes && <div className="text-xs text-slate-500 truncate max-w-[260px]">{mov.notes}</div>}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold tabular-nums whitespace-nowrap ${
                          mov.type === 'in' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {mov.type === 'in' ? `+${mov.quantity}` : `-${mov.quantity}`}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-600 whitespace-nowrap">
                        {mov.previousQuantity} → <strong className="text-slate-900">{mov.newQuantity}</strong>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {mov.performedBy}
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

      {/* Stock In / Out Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={moveType === 'in' ? 'Record Stock-In Receipt' : 'Record Stock-Out Dispatch'}
        subtitle="Quantities update inventory balances and ledger history atomically."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSubmitMovement} className="space-y-4">
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="mov-product" className="block text-sm font-medium text-slate-700 mb-1">
              Product
            </label>
            <select
              id="mov-product"
              required
              value={productId}
              onChange={(e) => {
                const nextId = e.target.value;
                setProductId(nextId);
                const p = products.find((pr) => pr.id === nextId);
                if (p) setSupplierId(p.supplierId);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — {p.quantity} available
                </option>
              ))}
            </select>
          </div>

          {moveType === 'in' && (
            <div>
              <label htmlFor="mov-supplier" className="block text-sm font-medium text-slate-700 mb-1">
                Supplier
              </label>
              <select
                id="mov-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mov-qty" className="block text-sm font-medium text-slate-700 mb-1">
                Quantity
              </label>
              <input
                id="mov-qty"
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              {selectedProduct && (
                <p className="mt-1 text-xs text-slate-500 tabular-nums">
                  Current stock: {selectedProduct.quantity} units
                </p>
              )}
            </div>
            <div>
              <label htmlFor="mov-ref" className="block text-sm font-medium text-slate-700 mb-1">
                Reference (PO / Slip)
              </label>
              <input
                id="mov-ref"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={moveType === 'in' ? 'PO-2026-112' : 'DISP-042'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="mov-notes" className="block text-sm font-medium text-slate-700 mb-1">
              Notes
            </label>
            <textarea
              id="mov-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for adjustment or dock verification notes..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Updating...' : moveType === 'in' ? 'Confirm Stock In' : 'Confirm Stock Out'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
