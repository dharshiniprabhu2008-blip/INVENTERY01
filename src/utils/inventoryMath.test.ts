import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStockAdjustment,
  calculateInventoryValuation,
  calculateSaleTotals,
  generateSku,
  getStockStatus,
  groupSalesByPeriod,
  isLowStock,
  validateStockSufficiency,
} from './inventoryMath';

test('isLowStock and getStockStatus evaluate thresholds accurately', () => {
  assert.equal(isLowStock({ quantity: 5, minStockLevel: 5 }), true);
  assert.equal(isLowStock({ quantity: 6, minStockLevel: 5 }), false);
  assert.equal(getStockStatus({ quantity: 0, minStockLevel: 5 }), 'out_of_stock');
  assert.equal(getStockStatus({ quantity: 4, minStockLevel: 5 }), 'low_stock');
  assert.equal(getStockStatus({ quantity: 12, minStockLevel: 5 }), 'in_stock');
});

test('calculateInventoryValuation sums cost, retail, profit, and units accurately', () => {
  const result = calculateInventoryValuation([
    { quantity: 10, purchasePrice: 50, sellingPrice: 80 },
    { quantity: 5, purchasePrice: 20, sellingPrice: 35 },
  ]);
  assert.equal(result.totalUnits, 15);
  assert.equal(result.totalCostValue, 600);
  assert.equal(result.totalRetailValue, 975);
  assert.equal(result.potentialProfit, 375);
});

test('generateSku creates unique deterministic SKUs avoiding collisions', () => {
  const sku1 = generateSku('Mechanical Keyboard', 'Peripherals', []);
  assert.equal(sku1, 'PER-MEKE-0001');
  const sku2 = generateSku('Mechanical Keyboard', 'Peripherals', ['PER-MEKE-0002']);
  assert.equal(sku2, 'PER-MEKE-0003');
  const sku3 = generateSku('Mechanical Keyboard', 'Peripherals', ['PER-MEKE-0001', 'PER-MEKE-0002']);
  assert.equal(sku3, 'PER-MEKE-0003');
});

test('calculateSaleTotals computes subtotal, tax, and total accurately', () => {
  const totals = calculateSaleTotals(
    [
      { productId: 'p1', quantity: 2, unitPrice: 49.99 },
      { productId: 'p2', quantity: 1, unitPrice: 120.0 },
    ],
    0.1
  );
  assert.equal(totals.subtotal, 219.98);
  assert.equal(totals.taxAmount, 22);
  assert.equal(totals.totalAmount, 241.98);
});

test('validateStockSufficiency prevents sales exceeding available inventory', () => {
  const products = new Map([
    ['p1', { id: 'p1', name: '4K Monitor', quantity: 3 }],
    ['p2', { id: 'p2', name: 'USB-C Hub', quantity: 10 }],
  ]);

  const valid = validateStockSufficiency(
    [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 4 },
    ],
    products
  );
  assert.equal(valid.ok, true);

  const invalid = validateStockSufficiency(
    [
      { productId: 'p1', quantity: 2 },
      { productId: 'p1', quantity: 2 },
    ],
    products
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0], /Insufficient stock/);
});

test('applyStockAdjustment prevents negative stock on stock-out', () => {
  assert.deepEqual(applyStockAdjustment(10, 'in', 5), { ok: true, newQuantity: 15 });
  assert.deepEqual(applyStockAdjustment(10, 'out', 4), { ok: true, newQuantity: 6 });
  const overdraw = applyStockAdjustment(3, 'out', 5);
  assert.equal(overdraw.ok, false);
  assert.equal(overdraw.newQuantity, 3);
});

test('groupSalesByPeriod aggregates daily and monthly sales correctly', () => {
  const sampleSales = [
    {
      totalAmount: 200,
      items: [{ productId: 'p1', productName: 'A', sku: 'S1', quantity: 2, unitPrice: 100, lineTotal: 200 }],
      createdAt: '2026-10-05T12:00:00.000Z',
      status: 'completed' as const,
    },
    {
      totalAmount: 150,
      items: [{ productId: 'p2', productName: 'B', sku: 'S2', quantity: 3, unitPrice: 50, lineTotal: 150 }],
      createdAt: '2026-10-18T12:00:00.000Z',
      status: 'completed' as const,
    },
    {
      totalAmount: 999,
      items: [{ productId: 'p2', productName: 'B', sku: 'S2', quantity: 1, unitPrice: 999, lineTotal: 999 }],
      createdAt: '2026-10-20T12:00:00.000Z',
      status: 'refunded' as const,
    },
  ];

  const monthly = groupSalesByPeriod(sampleSales, 'monthly');
  assert.equal(monthly.length, 1);
  assert.equal(monthly[0].revenue, 350);
  assert.equal(monthly[0].orders, 2);
  assert.equal(monthly[0].units, 5);

  const daily = groupSalesByPeriod(sampleSales, 'daily');
  assert.equal(daily.length, 2);
});
