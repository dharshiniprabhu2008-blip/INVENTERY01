import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/repository.js';

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name is required').max(120),
  contactPerson: z.string().trim().min(2, 'Contact person is required').max(80),
  email: z.string().trim().email('Valid email is required'),
  phone: z.string().trim().min(5, 'Phone number is required').max(40),
  address: z.string().trim().max(240).default(''),
});

export async function listSuppliers(_req: Request, res: Response): Promise<void> {
  const [suppliers, products, movements] = await Promise.all([
    db.listSuppliers(),
    db.listProducts(),
    db.listStockMovements(),
  ]);

  const enriched = suppliers.map((sup) => ({
    ...sup,
    productCount: products.filter((p) => p.supplierId === sup.id).length,
    purchaseCount: movements.filter((m) => m.supplierId === sup.id && m.type === 'in').length,
  }));

  res.json({ suppliers: enriched });
}

export async function createSupplier(req: Request, res: Response): Promise<void> {
  const payload = req.body as z.infer<typeof supplierSchema>;
  const supplier = await db.createSupplier(payload);
  res.status(201).json({ supplier: { ...supplier, productCount: 0, purchaseCount: 0 } });
}

export async function updateSupplier(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const payload = req.body as z.infer<typeof supplierSchema>;
  const updated = await db.updateSupplier(id, payload);
  if (!updated) {
    res.status(404).json({ error: 'Supplier not found.' });
    return;
  }
  res.json({ supplier: updated });
}

export async function deleteSupplier(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const products = await db.listProducts();
  if (products.some((p) => p.supplierId === id)) {
    res.status(409).json({
      error: 'Cannot delete a supplier with active catalog products. Reassign products first.',
    });
    return;
  }
  const deleted = await db.deleteSupplier(id);
  if (!deleted) {
    res.status(404).json({ error: 'Supplier not found.' });
    return;
  }
  res.json({ message: 'Supplier deleted.' });
}

export async function getSupplierHistory(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const supplier = await db.findSupplierById(id);
  if (!supplier) {
    res.status(404).json({ error: 'Supplier not found.' });
    return;
  }

  const [products, movements] = await Promise.all([db.listProducts(), db.listStockMovements()]);
  const suppliedProducts = products.filter((p) => p.supplierId === id);
  const suppliedProductIds = new Set(suppliedProducts.map((p) => p.id));

  const purchaseHistory = movements.filter(
    (m) => m.type === 'in' && (m.supplierId === id || suppliedProductIds.has(m.productId))
  );

  res.json({
    supplier,
    products: suppliedProducts,
    purchaseHistory,
  });
}
