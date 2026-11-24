import type { Product, Sale, StockMovementType } from '../types';

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function isLowStock(product: Pick<Product, 'quantity' | 'minStockLevel'>): boolean {
  return product.quantity <= product.minStockLevel;
}

export function getStockStatus(product: Pick<Product, 'quantity' | 'minStockLevel'>): StockStatus {
  if (product.quantity <= 0) return 'out_of_stock';
  if (product.quantity <= product.minStockLevel) return 'low_stock';
  return 'in_stock';
}

export function calculateInventoryValuation(
  products: Array<Pick<Product, 'quantity' | 'purchasePrice' | 'sellingPrice'>>
): {
  totalCostValue: number;
  totalRetailValue: number;
  potentialProfit: number;
  totalUnits: number;
} {
  let totalCostValue = 0;
  let totalRetailValue = 0;
  let totalUnits = 0;

  for (const p of products) {
    const qty = Math.max(0, Number(p.quantity) || 0);
    const cost = Math.max(0, Number(p.purchasePrice) || 0);
    const retail = Math.max(0, Number(p.sellingPrice) || 0);
    totalUnits += qty;
    totalCostValue += qty * cost;
    totalRetailValue += qty * retail;
  }

  totalCostValue = roundCurrency(totalCostValue);
  totalRetailValue = roundCurrency(totalRetailValue);
  const potentialProfit = roundCurrency(totalRetailValue - totalCostValue);

  return { totalCostValue, totalRetailValue, potentialProfit, totalUnits };
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function generateSku(
  productName: string,
  categoryName: string,
  existingSkus: string[] = []
): string {
  const catPrefix = (categoryName || 'GEN')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');

  const nameTokens = (productName || 'ITEM')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const prodPrefix = (
    nameTokens.length >= 2
      ? nameTokens[0].slice(0, 2) + nameTokens[1].slice(0, 2)
      : (nameTokens[0] || 'ITEM').slice(0, 4)
  )
    .toUpperCase()
    .padEnd(4, '0');

  const existingSet = new Set(existingSkus.map((s) => s.toUpperCase()));
  let seq = existingSkus.length + 1;
  let candidate = `${catPrefix}-${prodPrefix}-${String(seq).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    seq += 1;
    candidate = `${catPrefix}-${prodPrefix}-${String(seq).padStart(4, '0')}`;
  }
  return candidate;
}

export interface SaleLineInput {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export function calculateSaleTotals(
  items: SaleLineInput[],
  taxRate = 0.08
): {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lineTotals: number[];
} {
  const lineTotals = items.map((item) => {
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    const price = Math.max(0, Number(item.unitPrice) || 0);
    return roundCurrency(qty * price);
  });

  const subtotal = roundCurrency(lineTotals.reduce((acc, v) => acc + v, 0));
  const taxAmount = roundCurrency(subtotal * Math.max(0, taxRate));
  const totalAmount = roundCurrency(subtotal + taxAmount);

  return { subtotal, taxAmount, totalAmount, lineTotals };
}

export function validateStockSufficiency(
  requestedItems: Array<{ productId: string; quantity: number }>,
  productsById: Map<string, Pick<Product, 'id' | 'name' | 'quantity'>>
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!requestedItems.length) {
    return { ok: false, errors: ['At least one product item is required for a sale.'] };
  }

  const aggregated = new Map<string, number>();
  for (const item of requestedItems) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      errors.push('Quantity must be greater than zero for every item.');
      continue;
    }
    aggregated.set(item.productId, (aggregated.get(item.productId) || 0) + Math.floor(item.quantity));
  }

  for (const [productId, reqQty] of aggregated.entries()) {
    const product = productsById.get(productId);
    if (!product) {
      errors.push(`Product (${productId}) was not found.`);
      continue;
    }
    if (reqQty > product.quantity) {
      errors.push(
        `Insufficient stock for "${product.name}": requested ${reqQty}, available ${product.quantity}.`
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

export function applyStockAdjustment(
  currentQuantity: number,
  type: StockMovementType,
  delta: number
): { ok: boolean; newQuantity: number; error?: string } {
  const qty = Math.floor(Number(delta));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, newQuantity: currentQuantity, error: 'Adjustment quantity must be a positive integer.' };
  }

  if (type === 'in') {
    return { ok: true, newQuantity: currentQuantity + qty };
  }

  if (type === 'out') {
    if (qty > currentQuantity) {
      return {
        ok: false,
        newQuantity: currentQuantity,
        error: `Cannot deduct ${qty} units when only ${currentQuantity} are available.`,
      };
    }
    return { ok: true, newQuantity: currentQuantity - qty };
  }

  // 'adjustment' sets absolute floor or positive delta
  return { ok: true, newQuantity: qty };
}

export interface PeriodSalesBucket {
  label: string;
  sortKey: string;
  revenue: number;
  orders: number;
  units: number;
}

export function groupSalesByPeriod(
  sales: Array<Pick<Sale, 'totalAmount' | 'items' | 'createdAt' | 'status'>>,
  period: 'daily' | 'weekly' | 'monthly'
): PeriodSalesBucket[] {
  const buckets = new Map<string, PeriodSalesBucket>();

  for (const sale of sales) {
    if (sale.status === 'refunded') continue;
    const d = new Date(sale.createdAt);
    if (Number.isNaN(d.getTime())) continue;

    let sortKey = '';
    let label = '';

    if (period === 'daily') {
      sortKey = d.toISOString().slice(0, 10);
      label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    } else if (period === 'weekly') {
      const utcDay = d.getUTCDay();
      const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday));
      sortKey = monday.toISOString().slice(0, 10);
      label = `Wk ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
    } else {
      const yr = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      sortKey = `${yr}-${mo}`;
      label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    }

    const units = sale.items.reduce((sum, it) => sum + (it.quantity || 0), 0);
    const existing = buckets.get(sortKey);
    if (existing) {
      existing.revenue = roundCurrency(existing.revenue + sale.totalAmount);
      existing.orders += 1;
      existing.units += units;
    } else {
      buckets.set(sortKey, {
        label,
        sortKey,
        revenue: roundCurrency(sale.totalAmount),
        orders: 1,
        units,
      });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Number.isFinite(value) ? value : 0);
}
