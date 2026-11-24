import type { Request, Response } from 'express';
import { z } from 'zod';
import { applyStockAdjustment, isLowStock } from '../../src/utils/inventoryMath.js';
import { db, runInTransaction } from '../db/repository.js';

export const stockMovementSchema = z.object({
  productId: z.string().trim().min(1, 'Product is required'),
  type: z.enum(['in', 'out']),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  supplierId: z.string().trim().optional(),
  reference: z.string().trim().max(80).default(''),
  notes: z.string().trim().max(400).default(''),
});

export async function listStockMovements(req: Request, res: Response): Promise<void> {
  const movements = await db.listStockMovements();
  const typeFilter = typeof req.query.type === 'string' ? req.query.type : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let filtered = movements;
  if (typeFilter === 'in' || typeFilter === 'out' || typeFilter === 'adjustment') {
    filtered = filtered.filter((m) => m.type === typeFilter);
  }
  if (search) {
    filtered = filtered.filter(
      (m) =>
        m.productName.toLowerCase().includes(search) ||
        m.sku.toLowerCase().includes(search) ||
        m.reference.toLowerCase().includes(search) ||
        m.notes.toLowerCase().includes(search) ||
        (m.supplierName || '').toLowerCase().includes(search)
    );
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  res.json({
    movements: paginated,
    pagination: { page, limit, total, totalPages },
  });
}

export async function recordStockMovement(req: Request, res: Response): Promise<void> {
  const payload = req.body as z.infer<typeof stockMovementSchema>;

  try {
    const result = await runInTransaction(async (session) => {
      const product = await db.findProductById(payload.productId, session);
      if (!product) {
        return { status: 404 as const, error: 'Product not found.' };
      }

      const adj = applyStockAdjustment(product.quantity, payload.type, payload.quantity);
      if (!adj.ok) {
        return { status: 400 as const, error: adj.error || 'Invalid stock adjustment.' };
      }

      const supplierId = payload.supplierId || product.supplierId;
      const supplier = supplierId ? await db.findSupplierById(supplierId) : null;

      const updatedProduct = await db.updateProduct(
        product.id,
        { quantity: adj.newQuantity },
        session
      );

      const movement = await db.createStockMovement(
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          supplierId: supplier?.id || '',
          supplierName: supplier?.name || '',
          type: payload.type,
          quantity: payload.quantity,
          previousQuantity: product.quantity,
          newQuantity: adj.newQuantity,
          unitCost: product.purchasePrice,
          reference:
            payload.reference ||
            `${payload.type === 'in' ? 'STK-IN' : 'STK-OUT'}-${Date.now().toString().slice(-6)}`,
          notes: payload.notes,
          performedBy: req.user?.name || 'System',
        },
        session
      );

      return { status: 201 as const, movement, product: updatedProduct };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({
      movement: result.movement,
      product: result.product,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to record stock movement.',
    });
  }
}

export async function getLowStockAlerts(_req: Request, res: Response): Promise<void> {
  const [products, categories, suppliers] = await Promise.all([
    db.listProducts(),
    db.listCategories(),
    db.listSuppliers(),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const supMap = new Map(suppliers.map((s) => [s.id, s.name]));

  const alerts = products
    .filter((p) => isLowStock(p))
    .map((p) => ({
      ...p,
      categoryName: catMap.get(p.categoryId) || 'Uncategorized',
      supplierName: supMap.get(p.supplierId) || 'Unknown Supplier',
    }))
    .sort((a, b) => a.quantity - b.quantity);

  res.json({ alerts, count: alerts.length });
}
