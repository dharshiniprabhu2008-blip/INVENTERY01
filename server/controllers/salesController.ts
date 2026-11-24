import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  calculateSaleTotals,
  roundCurrency,
  validateStockSufficiency,
} from '../../src/utils/inventoryMath.js';
import { db, runInTransaction } from '../db/repository.js';

export const createSaleSchema = z.object({
  customerName: z.string().trim().min(2, 'Customer name is required').max(120),
  customerEmail: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  paymentMethod: z.enum(['card', 'cash', 'bank_transfer', 'invoice']).default('invoice'),
  taxRate: z.coerce.number().min(0).max(0.5).default(0.08),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
      })
    )
    .min(1, 'Select at least one product'),
});

export async function listSales(req: Request, res: Response): Promise<void> {
  const sales = await db.listSales();
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let filtered = sales;
  if (search) {
    filtered = filtered.filter(
      (s) =>
        s.invoiceNumber.toLowerCase().includes(search) ||
        s.customerName.toLowerCase().includes(search) ||
        (s.customerEmail || '').toLowerCase().includes(search) ||
        s.items.some((it) => it.productName.toLowerCase().includes(search))
    );
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  res.json({
    sales: paginated,
    pagination: { page, limit, total, totalPages },
  });
}

export async function getSaleById(req: Request, res: Response): Promise<void> {
  const sale = await db.findSaleById(req.params.id);
  if (!sale) {
    res.status(404).json({ error: 'Sale invoice not found.' });
    return;
  }
  res.json({ sale });
}

export async function createSale(req: Request, res: Response): Promise<void> {
  const payload = req.body as z.infer<typeof createSaleSchema>;

  try {
    const result = await runInTransaction(async (session) => {
      const products = await db.listProducts(session);
      const productsById = new Map(products.map((p) => [p.id, p]));

      const stockCheck = validateStockSufficiency(payload.items, productsById);
      if (!stockCheck.ok) {
        return { status: 400 as const, error: stockCheck.errors.join(' ') };
      }

      // Combine duplicate product rows cleanly
      const mergedQuantities = new Map<string, number>();
      for (const item of payload.items) {
        mergedQuantities.set(
          item.productId,
          (mergedQuantities.get(item.productId) || 0) + item.quantity
        );
      }

      const saleItems = Array.from(mergedQuantities.entries()).map(([productId, quantity]) => {
        const product = productsById.get(productId)!;
        const lineTotal = roundCurrency(quantity * product.sellingPrice);
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity,
          unitPrice: product.sellingPrice,
          lineTotal,
        };
      });

      const totals = calculateSaleTotals(
        saleItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        payload.taxRate
      );

      const existingSales = await db.listSales();
      const year = new Date().getUTCFullYear();
      const maxSeq = existingSales.reduce((max, s) => {
        const match = s.invoiceNumber.match(/(\d+)$/);
        const num = match ? Number(match[1]) : 0;
        return Number.isFinite(num) && num > max ? num : max;
      }, 1000);
      const seq = Math.max(1001 + existingSales.length, maxSeq + 1);
      const invoiceNumber = `INV-${year}-${String(seq).padStart(4, '0')}`;

      const createdSale = await db.createSale(
        {
          invoiceNumber,
          customerName: payload.customerName,
          customerEmail: payload.customerEmail || '',
          items: saleItems,
          subtotal: totals.subtotal,
          taxRate: payload.taxRate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          paymentMethod: payload.paymentMethod,
          status: 'completed',
          createdBy: req.user?.name || 'System',
        },
        session
      );

      // Decrement product quantities & log stock movements atomically
      for (const item of saleItems) {
        const prod = productsById.get(item.productId)!;
        const previousQuantity = prod.quantity;
        const newQuantity = previousQuantity - item.quantity;
        await db.updateProduct(prod.id, { quantity: newQuantity }, session);
        await db.createStockMovement(
          {
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            supplierId: prod.supplierId,
            supplierName: '',
            type: 'out',
            quantity: item.quantity,
            previousQuantity,
            newQuantity,
            unitCost: prod.purchasePrice,
            reference: invoiceNumber,
            notes: `Sold to ${payload.customerName}`,
            performedBy: req.user?.name || 'System',
          },
          session
        );
      }

      return { status: 201 as const, sale: createdSale };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({ sale: result.sale });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to create sale.',
    });
  }
}
