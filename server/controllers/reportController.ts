import type { Request, Response } from 'express';
import {
  calculateInventoryValuation,
  getStockStatus,
  groupSalesByPeriod,
  isLowStock,
} from '../../src/utils/inventoryMath.js';
import { db } from '../db/repository.js';

export async function getSalesReport(req: Request, res: Response): Promise<void> {
  const periodParam = req.query.period;
  const period =
    periodParam === 'daily' || periodParam === 'weekly' || periodParam === 'monthly'
      ? periodParam
      : 'monthly';

  const sales = await db.listSales();
  const completed = sales.filter((s) => s.status !== 'refunded');
  const buckets = groupSalesByPeriod(completed, period);

  const totalRevenue = completed.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalOrders = completed.length;
  const totalUnits = completed.reduce(
    (sum, s) => sum + s.items.reduce((acc, i) => acc + i.quantity, 0),
    0
  );

  res.json({
    period,
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      totalUnits,
      averageOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    },
    series: buckets,
    sales: completed,
  });
}

export async function getValuationReport(_req: Request, res: Response): Promise<void> {
  const [products, categories, suppliers] = await Promise.all([
    db.listProducts(),
    db.listCategories(),
    db.listSuppliers(),
  ]);
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const supMap = new Map(suppliers.map((s) => [s.id, s.name]));

  const summary = calculateInventoryValuation(products);
  const items = products.map((p) => {
    const costValue = Math.round(p.quantity * p.purchasePrice * 100) / 100;
    const retailValue = Math.round(p.quantity * p.sellingPrice * 100) / 100;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      categoryName: catMap.get(p.categoryId) || 'Uncategorized',
      supplierName: supMap.get(p.supplierId) || 'Unknown',
      quantity: p.quantity,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      costValue,
      retailValue,
      potentialProfit: Math.round((retailValue - costValue) * 100) / 100,
    };
  });

  res.json({ summary, items });
}

export async function getLowStockReport(_req: Request, res: Response): Promise<void> {
  const [products, categories, suppliers] = await Promise.all([
    db.listProducts(),
    db.listCategories(),
    db.listSuppliers(),
  ]);
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const supMap = new Map(suppliers.map((s) => [s.id, s.name]));

  const items = products
    .filter((p) => isLowStock(p))
    .map((p) => ({
      ...p,
      categoryName: catMap.get(p.categoryId) || 'Uncategorized',
      supplierName: supMap.get(p.supplierId) || 'Unknown',
      status: getStockStatus(p),
      deficit: Math.max(0, p.minStockLevel - p.quantity),
      recommendedRestock: Math.max(p.minStockLevel * 2 - p.quantity, 5),
    }))
    .sort((a, b) => a.quantity - b.quantity);

  res.json({
    count: items.length,
    outOfStockCount: items.filter((i) => i.quantity === 0).length,
    items,
  });
}
