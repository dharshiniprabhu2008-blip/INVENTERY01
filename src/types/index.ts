export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  productCount?: number;
  totalUnits?: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  productCount?: number;
  purchaseCount?: number;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName?: string;
  supplierId: string;
  supplierName?: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStockLevel: number;
  description: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType = 'in' | 'out' | 'adjustment';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  supplierId?: string;
  supplierName?: string;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  unitCost?: number;
  reference: string;
  notes: string;
  performedBy: string;
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  items: SaleItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: 'card' | 'cash' | 'bank_transfer' | 'invoice';
  status: 'completed' | 'refunded';
  createdBy: string;
  createdAt: string;
}

export interface DashboardAnalytics {
  kpis: {
    totalProducts: number;
    totalCategories: number;
    totalSuppliers: number;
    totalInventoryValue: number;
    totalRetailValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    totalSalesRevenue: number;
    totalSalesCount: number;
  };
  monthlySales: Array<{
    month: string;
    revenue: number;
    orders: number;
    units: number;
  }>;
  stockAvailability: Array<{
    category: string;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    totalUnits: number;
  }>;
  lowStockProducts: Product[];
  recentTransactions: Array<{
    id: string;
    kind: 'sale' | 'stock_in' | 'stock_out';
    reference: string;
    description: string;
    amountOrQty: string;
    date: string;
    actor: string;
  }>;
}

export type ActiveRoute =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'suppliers'
  | 'stock'
  | 'sales'
  | 'reports'
  | 'users'
  | 'settings';
