import type { Request, Response } from 'express';
import {
  calculateInventoryValuation,
  formatCurrency,
  getStockStatus,
  groupSalesByPeriod,
  isLowStock,
} from '../../src/utils/inventoryMath.js';
import { db } from '../db/repository.js';

export async function getDashboardAnalytics(_req: Request, res: Response): Promise<void> {
  const [products, categories, suppliers, sales, movements] = await Promise.all([
    db.listProducts(),
    db.listCategories(),
    db.listSuppliers(),
    db.listSales(),
    db.listStockMovements(),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const supMap = new Map(suppliers.map((s) => [s.id, s.name]));

  const valuation = calculateInventoryValuation(products);
  const lowStockProducts = products
    .filter((p) => isLowStock(p))
    .map((p) => ({
      ...p,
      categoryName: catMap.get(p.categoryId) || 'Uncategorized',
      supplierName: supMap.get(p.supplierId) || 'Unknown Supplier',
    }))
    .sort((a, b) => a.quantity - b.quantity);

  const outOfStockCount = products.filter((p) => p.quantity === 0).length;
  const completedSales = sales.filter((s) => s.status !== 'refunded');
  const totalSalesRevenue = completedSales.reduce((sum, s) => sum + s.totalAmount, 0);

  const monthlySales = groupSalesByPeriod(completedSales, 'monthly').map((b) => ({
    month: b.label,
    revenue: b.revenue,
    orders: b.orders,
    units: b.units,
  }));

  const stockAvailability = categories.map((cat) => {
    const catProducts = products.filter((p) => p.categoryId === cat.id);
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalUnits = 0;

    for (const p of catProducts) {
      totalUnits += p.quantity;
      const status = getStockStatus(p);
      if (status === 'in_stock') inStock += 1;
      else if (status === 'low_stock') lowStock += 1;
      else outOfStock += 1;
    }

    return {
      category: cat.name,
      inStock,
      lowStock,
      outOfStock,
      totalUnits,
    };
  });

  const saleTx = completedSales.slice(0, 8).map((s) => ({
    id: `tx-sale-${s.id}`,
    kind: 'sale' as const,
    reference: s.invoiceNumber,
    description: `${s.customerName} (${s.items.reduce((sum, i) => sum + i.quantity, 0)} items)`,
    amountOrQty: formatCurrency(s.totalAmount),
    date: s.createdAt,
    actor: s.createdBy,
  }));

  const movTx = movements.slice(0, 8).map((m) => ({
    id: `tx-mov-${m.id}`,
    kind: m.type === 'in' ? ('stock_in' as const) : ('stock_out' as const),
    reference: m.reference || m.sku,
    description: `${m.productName} (${m.type === 'in' ? 'Restock' : 'Dispatch'})`,
    amountOrQty: `${m.type === 'in' ? '+' : '-'}${m.quantity} units`,
    date: m.createdAt,
    actor: m.performedBy,
  }));

  const recentTransactions = [...saleTx, ...movTx]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  res.json({
    kpis: {
      totalProducts: products.length,
      totalCategories: categories.length,
      totalSuppliers: suppliers.length,
      totalInventoryValue: valuation.totalCostValue,
      totalRetailValue: valuation.totalRetailValue,
      lowStockCount: lowStockProducts.length,
      outOfStockCount,
      totalSalesRevenue: Math.round(totalSalesRevenue * 100) / 100,
      totalSalesCount: completedSales.length,
    },
    monthlySales,
    stockAvailability,
    lowStockProducts,
    recentTransactions,
  });
}
