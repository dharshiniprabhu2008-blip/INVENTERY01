import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Category, Product, Supplier } from '../types';
import { apiRequest } from '../utils/api';
import { formatCurrency, getStockStatus } from '../utils/inventoryMath';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { DataPagination } from './ui/DataPagination';
import { Modal } from './ui/Modal';
import { ProductThumbnail } from './ui/ProductThumbnail';

interface ProductsViewProps {
  globalSearch: string;
  onDataChanged: () => void;
}

interface ProductFormState {
  name: string;
  sku: string;
  categoryId: string;
  supplierId: string;
  purchasePrice: string;
  sellingPrice: string;
  quantity: string;
  minStockLevel: string;
  description: string;
  imageUrl: string;
}

const EMPTY_FORM: ProductFormState = {
  name: '',
  sku: '',
  categoryId: '',
  supplierId: '',
  purchasePrice: '',
  sellingPrice: '',
  quantity: '0',
  minStockLevel: '5',
  description: '',
  imageUrl: '',
};

export function ProductsView({ globalSearch, onDataChanged }: ProductsViewProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(globalSearch);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSearch(globalSearch);
    setPage(1);
  }, [globalSearch]);

  const loadMetadata = useCallback(async () => {
    const [catRes, supRes] = await Promise.all([
      apiRequest<{ categories: Category[] }>('/categories'),
      apiRequest<{ suppliers: Supplier[] }>('/suppliers'),
    ]);
    setCategories(catRes.categories);
    setSuppliers(supRes.suppliers);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        sortBy,
        sortOrder,
      });
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter);
      if (statusFilter !== 'all') params.set('stockStatus', statusFilter);

      const res = await apiRequest<{
        products: Product[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/products?${params.toString()}`);

      setProducts(res.products);
      setPagination(res.pagination);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, search, categoryFilter, statusFilter, showToast]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const openAddModal = () => {
    setEditingProduct(null);
    setForm({
      ...EMPTY_FORM,
      categoryId: categories[0]?.id || '',
      supplierId: suppliers[0]?.id || '',
    });
    setFormError('');
    setFormModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      supplierId: product.supplierId,
      purchasePrice: String(product.purchasePrice),
      sellingPrice: String(product.sellingPrice),
      quantity: String(product.quantity),
      minStockLevel: String(product.minStockLevel),
      description: product.description,
      imageUrl: product.imageUrl || '',
    });
    setFormError('');
    setFormModalOpen(true);
  };

  const handleGenerateSku = async () => {
    try {
      const params = new URLSearchParams({
        name: form.name || 'Product',
        categoryId: form.categoryId || '',
      });
      const res = await apiRequest<{ sku: string }>(`/products/generate-sku?${params.toString()}`);
      setForm((prev) => ({ ...prev, sku: res.sku }));
    } catch {
      showToast('Unable to generate SKU', 'error');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }
    if (file.size > 1.8 * 1024 * 1024) {
      setFormError('Image size must be under 1.8 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (form.name.trim().length < 2) {
      setFormError('Product name must be at least 2 characters.');
      return;
    }
    if (form.sku.trim().length < 2) {
      setFormError('SKU is required. Click Generate SKU or enter one manually.');
      return;
    }
    if (!form.categoryId || !form.supplierId) {
      setFormError('Please select both a category and a supplier.');
      return;
    }

    const purchasePrice = Number(form.purchasePrice);
    const sellingPrice = Number(form.sellingPrice);
    const quantity = Number(form.quantity);
    const minStockLevel = Number(form.minStockLevel);

    if (Number.isNaN(purchasePrice) || purchasePrice < 0 || Number.isNaN(sellingPrice) || sellingPrice < 0) {
      setFormError('Prices must be zero or positive numbers.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(minStockLevel) || minStockLevel < 0) {
      setFormError('Quantities must be non-negative whole numbers.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        categoryId: form.categoryId,
        supplierId: form.supplierId,
        purchasePrice,
        sellingPrice,
        quantity,
        minStockLevel,
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim(),
      };

      if (editingProduct) {
        await apiRequest(`/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast(`Updated "${payload.name}"`);
      } else {
        await apiRequest('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(`Added "${payload.name}" to catalog`);
      }

      setFormModalOpen(false);
      await loadProducts();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/products/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await loadProducts();
      onDataChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete product', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Product Catalog</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage SKUs, pricing, supplier links, and threshold levels.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      {/* Filters & Sorting Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by name, SKU, category, or supplier..."
            aria-label="Search products"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
          />
        </div>

        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by stock status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
        >
          <option value="all">All Stock Levels</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>

        <select
          aria-label="Sort products"
          value={`${sortBy}:${sortOrder}`}
          onChange={(e) => {
            const [col, dir] = e.target.value.split(':') as [string, 'asc' | 'desc'];
            setSortBy(col);
            setSortOrder(dir);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
        >
          <option value="createdAt:desc">Newest First</option>
          <option value="name:asc">Name (A-Z)</option>
          <option value="name:desc">Name (Z-A)</option>
          <option value="quantity:asc">Stock (Low to High)</option>
          <option value="quantity:desc">Stock (High to Low)</option>
          <option value="sellingPrice:desc">Price (High to Low)</option>
          <option value="sellingPrice:asc">Price (Low to High)</option>
        </select>
      </div>

      {/* Product Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No products match your filters</p>
            <p className="mt-1 text-sm text-slate-500">
              Adjust your search criteria or add a new product to the catalog.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add First Product
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-3">Product</th>
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3">Category / Supplier</th>
                    <th className="py-3 px-3 text-right">Cost</th>
                    <th className="py-3 px-3 text-right">Price</th>
                    <th className="py-3 px-3 text-right">Available</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {products.map((prod) => {
                    const status = getStockStatus(prod);
                    return (
                      <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-3 min-w-[180px]">
                            <ProductThumbnail src={prod.imageUrl} alt={prod.name} />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate max-w-[220px]">
                                {prod.name}
                              </div>
                              <div className="text-xs text-slate-500 truncate max-w-[220px]">
                                Min level: {prod.minStockLevel}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {prod.sku}
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-slate-900 whitespace-nowrap">{prod.categoryName}</div>
                          <div className="text-xs text-slate-500 whitespace-nowrap">
                            {prod.supplierName}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {formatCurrency(prod.purchasePrice)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium tabular-nums text-slate-900 whitespace-nowrap">
                          {formatCurrency(prod.sellingPrice)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                          {prod.quantity}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {status === 'in_stock' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              In Stock
                            </span>
                          )}
                          {status === 'low_stock' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Low Stock
                            </span>
                          )}
                          {status === 'out_of_stock' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                              <XCircle className="h-3.5 w-3.5" />
                              Out of Stock
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailProduct(prod)}
                              aria-label={`View details for ${prod.name}`}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(prod)}
                              aria-label={`Edit ${prod.name}`}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700 transition-colors cursor-pointer"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {user?.role === 'admin' && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(prod)}
                                aria-label={`Delete ${prod.name}`}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      {/* Add / Edit Product Modal */}
      <Modal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
        subtitle="Complete SKU, pricing, and inventory threshold fields."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="prod-name" className="block text-sm font-medium text-slate-700 mb-1">
                Product Name
              </label>
              <input
                id="prod-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Ergonomic Aluminum Laptop Stand"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prod-sku" className="block text-sm font-medium text-slate-700 mb-1">
                SKU
              </label>
              <div className="flex gap-2">
                <input
                  id="prod-sku"
                  type="text"
                  required
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                  placeholder="PER-ITEM-0013"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleGenerateSku}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  Generate
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="prod-category" className="block text-sm font-medium text-slate-700 mb-1">
                Category
              </label>
              <select
                id="prod-category"
                required
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="" disabled>
                  Select category
                </option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prod-supplier" className="block text-sm font-medium text-slate-700 mb-1">
                Supplier
              </label>
              <select
                id="prod-supplier"
                required
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="" disabled>
                  Select supplier
                </option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prod-purchase" className="block text-sm font-medium text-slate-700 mb-1">
                Purchase Price ($)
              </label>
              <input
                id="prod-purchase"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prod-selling" className="block text-sm font-medium text-slate-700 mb-1">
                Selling Price ($)
              </label>
              <input
                id="prod-selling"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prod-qty" className="block text-sm font-medium text-slate-700 mb-1">
                Available Quantity
              </label>
              <input
                id="prod-qty"
                type="number"
                min="0"
                step="1"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prod-min" className="block text-sm font-medium text-slate-700 mb-1">
                Minimum Stock Level
              </label>
              <input
                id="prod-min"
                type="number"
                min="0"
                step="1"
                required
                value={form.minStockLevel}
                onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="prod-desc" className="block text-sm font-medium text-slate-700 mb-1">
                Description
              </label>
              <textarea
                id="prod-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Specifications, dimensions, or packaging notes..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Product Image</span>
              <div className="flex flex-wrap items-center gap-4">
                <ProductThumbnail src={form.imageUrl} alt={form.name || 'Preview'} sizeClass="h-14 w-14" />
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {form.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, imageUrl: '' })}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove image
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setFormModalOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Product Details Modal */}
      <Modal
        open={Boolean(detailProduct)}
        onClose={() => setDetailProduct(null)}
        title={detailProduct?.name || 'Product Details'}
        subtitle={detailProduct ? `SKU ${detailProduct.sku}` : undefined}
        maxWidthClass="max-w-lg"
      >
        {detailProduct && (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <ProductThumbnail
                src={detailProduct.imageUrl}
                alt={detailProduct.name}
                sizeClass="h-20 w-20"
              />
              <div className="space-y-1 text-sm">
                <div className="text-slate-500">
                  Category: <span className="font-medium text-slate-900">{detailProduct.categoryName}</span>
                </div>
                <div className="text-slate-500">
                  Supplier: <span className="font-medium text-slate-900">{detailProduct.supplierName}</span>
                </div>
                <div className="text-slate-500">
                  Stock:{' '}
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {detailProduct.quantity} units
                  </span>{' '}
                  (Min threshold: {detailProduct.minStockLevel})
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-y border-slate-200 py-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Purchase Price</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  {formatCurrency(detailProduct.purchasePrice)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Selling Price</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  {formatCurrency(detailProduct.sellingPrice)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Unit Margin</div>
                <div className="mt-0.5 font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(detailProduct.sellingPrice - detailProduct.purchasePrice)}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Description
              </h4>
              <p className="text-sm text-slate-700 leading-relaxed">
                {detailProduct.description || 'No description provided for this product.'}
              </p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}" (${deleteTarget?.sku})? This action cannot be undone.`}
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
