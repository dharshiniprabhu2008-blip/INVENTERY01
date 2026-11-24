import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/repository.js';

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Category name is required').max(80),
  description: z.string().trim().max(400).default(''),
});

export async function listCategories(_req: Request, res: Response): Promise<void> {
  const [categories, products] = await Promise.all([db.listCategories(), db.listProducts()]);

  const enriched = categories.map((cat) => {
    const catProducts = products.filter((p) => p.categoryId === cat.id);
    const totalUnits = catProducts.reduce((sum, p) => sum + p.quantity, 0);
    return {
      ...cat,
      productCount: catProducts.length,
      totalUnits,
    };
  });

  res.json({ categories: enriched });
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const { name, description } = req.body as z.infer<typeof categorySchema>;
  const existing = (await db.listCategories()).find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    res.status(409).json({ error: 'A category with this name already exists.' });
    return;
  }
  const category = await db.createCategory({ name, description });
  res.status(201).json({ category: { ...category, productCount: 0, totalUnits: 0 } });
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { name, description } = req.body as z.infer<typeof categorySchema>;
  const existing = (await db.listCategories()).find(
    (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== id
  );
  if (existing) {
    res.status(409).json({ error: 'Another category with this name already exists.' });
    return;
  }
  const updated = await db.updateCategory(id, { name, description });
  if (!updated) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  res.json({ category: updated });
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const products = await db.listProducts();
  const inUse = products.some((p) => p.categoryId === id);
  if (inUse) {
    res.status(409).json({
      error: 'Cannot delete a category that still has assigned products. Reassign products first.',
    });
    return;
  }
  const deleted = await db.deleteCategory(id);
  if (!deleted) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  res.json({ message: 'Category deleted.' });
}

export async function getCategoryProducts(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const category = await db.findCategoryById(id);
  if (!category) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  const [products, suppliers] = await Promise.all([db.listProducts(), db.listSuppliers()]);
  const supMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const items = products
    .filter((p) => p.categoryId === id)
    .map((p) => ({
      ...p,
      categoryName: category.name,
      supplierName: supMap.get(p.supplierId) || 'Unknown Supplier',
    }));

  res.json({ category, products: items });
}
