import React, { useCallback, useEffect, useState } from 'react';
import { Eye, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Category, Product } from '../types';
import { apiRequest } from '../utils/api';
import { formatCurrency } from '../utils/inventoryMath';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Modal } from './ui/Modal';

export function CategoriesView({ onDataChanged }: { onDataChanged: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewingCategory, setViewingCategory] = useState<Category | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ categories: Category[] }>('/categories');
      setCategories(res.categories);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description);
    setFormError('');
    setModalOpen(true);
  };

  const handleViewProducts = async (cat: Category) => {
    setViewingCategory(cat);
    setLoadingProducts(true);
    try {
      const res = await apiRequest<{ category: Category; products: Product[] }>(
        `/categories/${cat.id}/products`
      );
      setCategoryProducts(res.products);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load products', 'error');
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (name.trim().length < 2) {
      setFormError('Category name must be at least 2 characters.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/categories/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        });
        showToast(`Updated category "${name.trim()}"`);
      } else {
        await apiRequest('/categories', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        });
        showToast(`Created category "${name.trim()}"`);
      }
      setModalOpen(false);
      await loadCategories();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/categories/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(`Deleted category "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await loadCategories();
      onDataChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to delete category', 'error');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Product Categories</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Organize catalog inventory and inspect stock distribution by group.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-900">No categories yet</p>
          <p className="mt-1 text-sm text-slate-500">Create your first product category to begin organizing SKUs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <FolderTree className="h-4 w-4" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 truncate">{cat.name}</h3>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(cat)}
                      aria-label={`Edit ${cat.name}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700 cursor-pointer"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(cat)}
                        aria-label={`Delete ${cat.name}`}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600 line-clamp-2 min-h-[2.5rem]">
                  {cat.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="tabular-nums">
                  <strong className="font-semibold text-slate-900">{cat.productCount ?? 0}</strong> SKUs ·{' '}
                  <strong className="font-semibold text-slate-900">{cat.totalUnits ?? 0}</strong> units
                </span>
                <button
                  type="button"
                  onClick={() => handleViewProducts(cat)}
                  className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Products
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Category' : 'Add Category'}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div>
            <label htmlFor="cat-name" className="block text-sm font-medium text-slate-700 mb-1">
              Category Name
            </label>
            <input
              id="cat-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Networking Equipment"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="cat-desc" className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              id="cat-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of products in this category..."
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
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewingCategory)}
        onClose={() => setViewingCategory(null)}
        title={viewingCategory ? `Products in ${viewingCategory.name}` : 'Category Products'}
        maxWidthClass="max-w-2xl"
      >
        {loadingProducts ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading products...</div>
        ) : categoryProducts.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No products are currently assigned to this category.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3 text-right">Stock</th>
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categoryProducts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-700">{p.sku}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{p.name}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{p.quantity}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatCurrency(p.sellingPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Category"
        message={`Delete "${deleteTarget?.name}"? Categories with assigned products cannot be deleted until products are reassigned.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
