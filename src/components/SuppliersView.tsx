import React, { useCallback, useEffect, useState } from 'react';
import { History, Mail, MapPin, Pencil, Phone, Plus, Trash2, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Product, StockMovement, Supplier } from '../types';
import { apiRequest } from '../utils/api';
import { formatCurrency } from '../utils/inventoryMath';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Modal } from './ui/Modal';

interface SupplierForm {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
}

const EMPTY_SUPPLIER: SupplierForm = {
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
};

export function SuppliersView({ onDataChanged }: { onDataChanged: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(EMPTY_SUPPLIER);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);
  const [historyData, setHistoryData] = useState<{
    products: Product[];
    purchaseHistory: StockMovement[];
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ suppliers: Supplier[] }>('/suppliers');
      setSuppliers(res.suppliers);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load suppliers', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_SUPPLIER);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (sup: Supplier) => {
    setEditing(sup);
    setForm({
      name: sup.name,
      contactPerson: sup.contactPerson,
      email: sup.email,
      phone: sup.phone,
      address: sup.address,
    });
    setFormError('');
    setModalOpen(true);
  };

  const openHistory = async (sup: Supplier) => {
    setHistorySupplier(sup);
    setLoadingHistory(true);
    try {
      const res = await apiRequest<{
        supplier: Supplier;
        products: Product[];
        purchaseHistory: StockMovement[];
      }>(`/suppliers/${sup.id}/history`);
      setHistoryData({ products: res.products, purchaseHistory: res.purchaseHistory });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load supplier history', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (form.name.trim().length < 2 || form.contactPerson.trim().length < 2) {
      setFormError('Company name and contact person are required.');
      return;
    }
    if (!form.email.includes('@')) {
      setFormError('Valid email address is required.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/suppliers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        showToast(`Updated supplier "${form.name}"`);
      } else {
        await apiRequest('/suppliers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        showToast(`Added supplier "${form.name}"`);
      }
      setModalOpen(false);
      await loadSuppliers();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/suppliers/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(`Deleted supplier "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await loadSuppliers();
      onDataChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to delete supplier', 'error');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Suppliers Directory</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Maintain vendor contacts, supplied SKUs, and inbound purchase history.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Supplier
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-900">No suppliers registered</p>
          <p className="mt-1 text-sm text-slate-500">Add a supplier to link products and track restock orders.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suppliers.map((sup) => (
            <div
              key={sup.id}
              className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{sup.name}</h3>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <User className="h-3.5 w-3.5" />
                      <span>{sup.contactPerson}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(sup)}
                      aria-label={`Edit ${sup.name}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700 cursor-pointer"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(sup)}
                        aria-label={`Delete ${sup.name}`}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{sup.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{sup.phone}</span>
                  </div>
                  {sup.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{sup.address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="tabular-nums">
                  <strong className="font-semibold text-slate-900">{sup.productCount ?? 0}</strong> products ·{' '}
                  <strong className="font-semibold text-slate-900">{sup.purchaseCount ?? 0}</strong> restocks
                </span>
                <button
                  type="button"
                  onClick={() => openHistory(sup)}
                  className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  <History className="h-3.5 w-3.5" />
                  Purchase History
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add New Supplier'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div>
            <label htmlFor="sup-name" className="block text-sm font-medium text-slate-700 mb-1">
              Supplier Name
            </label>
            <input
              id="sup-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sup-contact" className="block text-sm font-medium text-slate-700 mb-1">
                Contact Person
              </label>
              <input
                id="sup-contact"
                type="text"
                required
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sup-phone" className="block text-sm font-medium text-slate-700 mb-1">
                Phone
              </label>
              <input
                id="sup-phone"
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="sup-email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="sup-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="sup-address" className="block text-sm font-medium text-slate-700 mb-1">
              Address
            </label>
            <input
              id="sup-address"
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
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
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Supplier'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(historySupplier)}
        onClose={() => setHistorySupplier(null)}
        title={historySupplier ? `${historySupplier.name} — Purchase History` : 'Purchase History'}
        maxWidthClass="max-w-2xl"
      >
        {loadingHistory || !historyData ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading purchase history...</div>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Supplied Products ({historyData.products.length})
              </h4>
              {historyData.products.length === 0 ? (
                <p className="text-sm text-slate-500">No products linked to this supplier.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {historyData.products.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                      <div>
                        <span className="font-medium text-slate-900">{p.name}</span>{' '}
                        <span className="font-mono text-xs text-slate-500">· {p.sku}</span>
                      </div>
                      <span className="tabular-nums text-slate-600">
                        Cost {formatCurrency(p.purchasePrice)} · {p.quantity} in stock
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Inbound Purchase Receipts ({historyData.purchaseHistory.length})
              </h4>
              {historyData.purchaseHistory.length === 0 ? (
                <p className="text-sm text-slate-500">No inbound stock receipts recorded yet.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Reference</th>
                        <th className="py-2 px-3">Product</th>
                        <th className="py-2 px-3 text-right">Qty Added</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyData.purchaseHistory.map((m) => (
                        <tr key={m.id}>
                          <td className="py-2 px-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                            {new Date(m.createdAt).toLocaleDateString('en-US')}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs text-slate-700">{m.reference}</td>
                          <td className="py-2 px-3 text-slate-900">{m.productName}</td>
                          <td className="py-2 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                            +{m.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Supplier"
        message={`Delete "${deleteTarget?.name}"? Suppliers with active products cannot be deleted until products are reassigned.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
