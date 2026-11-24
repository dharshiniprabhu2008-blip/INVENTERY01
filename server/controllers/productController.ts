import type { Request, Response } from 'express';
import { z } from 'zod';
import { generateSku } from '../../src/utils/inventoryMath.js';
import { db } from '../db/repository.js';

function isValidImageReference(val: string): boolean {
  if (!val) return true;
  if (val.startsWith('/src/assets/')) return true;
  if (val.startsWith('data:image/')) {
    return val.length <= 2_800_000;
  }
  try {
    const u = new URL(val);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(140),
  sku: z.string().trim().min(2, 'SKU is required').max(40),
  categoryId: z.string().trim().min(1, 'Category is required'),
  supplierId: z.string().trim().min(1, 'Supplier is required'),
  purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative'),
  sellingPrice: z.coerce.number().min(0, 'Selling price cannot be negative'),
  quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative'),
  minStockLevel: z.coerce.number().int().min(0, 'Minimum stock level cannot be negative'),
  description: z.string().trim().max(1000).default(''),
  imageUrl: z
    .string()
    .trim()
    .default('')
    .refine(isValidImageReference, 'Image must be a valid image upload or HTTPS URL'),
});

export async function listProducts(req: Request, res: Response): Promise<void> {
  const [products, categories, suppliers] = await Promise.all([
    db.listProducts(),
    db.listCategories(),
    db.listSuppliers(),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const supMap = new Map(suppliers.map((s) => [s.id, s.name]));

  let enriched = products.map((p) => ({
    ...p,
    categoryName: catMap.get(p.categoryId) || 'Uncategorized',
    supplierName: supMap.get(p.supplierId) || 'Unknown Supplier',
  }));

  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
  const stockStatus = typeof req.query.stockStatus === 'string' ? req.query.stockStatus.trim() : '';
  const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  if (search) {
    enriched = enriched.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.sku.toLowerCase().includes(search) ||
        p.categoryName.toLowerCase().includes(search) ||
        p.supplierName.toLowerCase().includes(search)
    );
  }

  if (categoryId && categoryId !== 'all') {
    enriched = enriched.filter((p) => p.categoryId === categoryId);
  }

  if (stockStatus === 'low') {
    enriched = enriched.filter((p) => p.quantity > 0 && p.quantity <= p.minStockLevel);
  } else if (stockStatus === 'out') {
    enriched = enriched.filter((p) => p.quantity === 0);
  } else if (stockStatus === 'in') {
    enriched = enriched.filter((p) => p.quantity > p.minStockLevel);
  } else if (stockStatus === 'alert') {
    enriched = enriched.filter((p) => p.quantity <= p.minStockLevel);
  }

  enriched.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name) * sortOrder;
      case 'sku':
        return a.sku.localeCompare(b.sku) * sortOrder;
      case 'sellingPrice':
        return (a.sellingPrice - b.sellingPrice) * sortOrder;
      case 'purchasePrice':
        return (a.purchasePrice - b.purchasePrice) * sortOrder;
      case 'quantity':
        return (a.quantity - b.quantity) * sortOrder;
      default:
        return a.createdAt.localeCompare(b.createdAt) * sortOrder;
    }
  });

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const total = enriched.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const paginated = enriched.slice((page - 1) * limit, page * limit);

  res.json({
    products: paginated,
    pagination: { page, limit, total, totalPages },
  });
}

export async function getProductById(req: Request, res: Response): Promise<void> {
  const product = await db.findProductById(req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }
  const [cat, sup] = await Promise.all([
    db.findCategoryById(product.categoryId),
    db.findSupplierById(product.supplierId),
  ]);
  res.json({
    product: {
      ...product,
      categoryName: cat?.name || 'Uncategorized',
      supplierName: sup?.name || 'Unknown Supplier',
    },
  });
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const payload = req.body as z.infer<typeof productSchema>;

  const [cat, sup, existingSku] = await Promise.all([
    db.findCategoryById(payload.categoryId),
    db.findSupplierById(payload.supplierId),
    db.findProductBySku(payload.sku),
  ]);

  if (!cat) {
    res.status(400).json({ error: 'Selected category does not exist.' });
    return;
  }
  if (!sup) {
    res.status(400).json({ error: 'Selected supplier does not exist.' });
    return;
  }
  if (existingSku) {
    res.status(409).json({ error: `SKU "${payload.sku.toUpperCase()}" is already assigned to another product.` });
    return;
  }

  const created = await db.createProduct(payload);
  if (created.quantity > 0) {
    await db.createStockMovement({
      productId: created.id,
      productName: created.name,
      sku: created.sku,
      supplierId: sup.id,
      supplierName: sup.name,
      type: 'in',
      quantity: created.quantity,
      previousQuantity: 0,
      newQuantity: created.quantity,
      unitCost: created.purchasePrice,
      reference: 'INIT-STOCK',
      notes: 'Opening stock upon product creation',
      performedBy: req.user?.name || 'System',
    });
  }

  res.status(201).json({
    product: {
      ...created,
      categoryName: cat.name,
      supplierName: sup.name,
    },
  });
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const payload = req.body as z.infer<typeof productSchema>;

  const existing = await db.findProductById(id);
  if (!existing) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }

  const [cat, sup, skuMatch] = await Promise.all([
    db.findCategoryById(payload.categoryId),
    db.findSupplierById(payload.supplierId),
    db.findProductBySku(payload.sku),
  ]);

  if (!cat) {
    res.status(400).json({ error: 'Selected category does not exist.' });
    return;
  }
  if (!sup) {
    res.status(400).json({ error: 'Selected supplier does not exist.' });
    return;
  }
  if (skuMatch && skuMatch.id !== id) {
    res.status(409).json({ error: `SKU "${payload.sku.toUpperCase()}" belongs to another product.` });
    return;
  }

  const updated = await db.updateProduct(id, payload);
  if (!updated) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }

  if (payload.quantity !== existing.quantity) {
    const diff = Math.abs(payload.quantity - existing.quantity);
    await db.createStockMovement({
      productId: updated.id,
      productName: updated.name,
      sku: updated.sku,
      supplierId: sup.id,
      supplierName: sup.name,
      type: payload.quantity > existing.quantity ? 'in' : 'out',
      quantity: diff,
      previousQuantity: existing.quantity,
      newQuantity: payload.quantity,
      unitCost: updated.purchasePrice,
      reference: 'CATALOG-EDIT',
      notes: 'Stock quantity updated from product editor',
      performedBy: req.user?.name || 'System',
    });
  }

  res.json({
    product: {
      ...updated,
      categoryName: cat.name,
      supplierName: sup.name,
    },
  });
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const deleted = await db.deleteProduct(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }
  res.json({ message: 'Product deleted.' });
}

export async function generateSkuEndpoint(req: Request, res: Response): Promise<void> {
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : '';
  const [cat, products] = await Promise.all([
    categoryId ? db.findCategoryById(categoryId) : Promise.resolve(null),
    db.listProducts(),
  ]);
  const sku = generateSku(
    name,
    cat?.name || 'GEN',
    products.map((p) => p.sku)
  );
  res.json({ sku });
}
