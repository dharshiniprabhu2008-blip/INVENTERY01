import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import type {
  Category,
  Product,
  Sale,
  StockMovement,
  Supplier,
  UserRole,
} from '../../src/types/index.js';
import { ENV } from '../config/env.js';
import {
  CategoryModel,
  ProductModel,
  SaleModel,
  StockMovementModel,
  SupplierModel,
  UserModel,
} from '../models/index.js';
import { createSeedDataset } from './seedData.js';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

interface DatabaseSnapshot {
  users: StoredUser[];
  categories: Category[];
  suppliers: Supplier[];
  products: Product[];
  stockMovements: StockMovement[];
  sales: Sale[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'stockmaster-db.json');

let usingMongo = false;
let initialized = false;
let localState: DatabaseSnapshot | null = null;
let txQueue: Promise<unknown> = Promise.resolve();

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function loadLocalState(): DatabaseSnapshot {
  if (localState) return localState;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseSnapshot;
      localState = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
        products: Array.isArray(parsed.products) ? parsed.products : [],
        stockMovements: Array.isArray(parsed.stockMovements) ? parsed.stockMovements : [],
        sales: Array.isArray(parsed.sales) ? parsed.sales : [],
      };
      return localState;
    } catch {
      // Fall through to fresh seed if corrupted
    }
  }

  const seed = createSeedDataset();
  localState = {
    users: [],
    categories: seed.categories,
    suppliers: seed.suppliers,
    products: seed.products,
    stockMovements: seed.stockMovements,
    sales: seed.sales,
  };
  persistLocalState(localState);
  return localState;
}

function persistLocalState(snapshot: DatabaseSnapshot): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_FILE);
}

function mapMongoDoc<T extends { id: string }>(doc: Record<string, unknown>): T {
  const obj = { ...doc } as Record<string, unknown>;
  if (obj._id !== undefined) {
    obj.id = String(obj._id);
    delete obj._id;
  }
  delete obj.__v;
  if (obj.createdAt instanceof Date) obj.createdAt = obj.createdAt.toISOString();
  if (obj.updatedAt instanceof Date) obj.updatedAt = obj.updatedAt.toISOString();
  return obj as T;
}

export async function connectDatabase(): Promise<{ mode: 'mongodb' | 'local-store' }> {
  if (initialized) {
    return { mode: usingMongo ? 'mongodb' : 'local-store' };
  }

  if (ENV.MONGODB_URI) {
    try {
      await mongoose.connect(ENV.MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
      usingMongo = true;
      await seedMongoIfEmpty();
      initialized = true;
      return { mode: 'mongodb' };
    } catch (err) {
      console.warn(
        '[StockMaster DB] MONGODB_URI connection failed; falling back to persistent local store:',
        err instanceof Error ? err.message : err
      );
    }
  }

  loadLocalState();
  usingMongo = false;
  initialized = true;
  return { mode: 'local-store' };
}

async function seedMongoIfEmpty(): Promise<void> {
  const catCount = await CategoryModel.countDocuments();
  if (catCount > 0) return;

  const seed = createSeedDataset();
  const catIdMap = new Map<string, string>();
  const supIdMap = new Map<string, string>();
  const prodIdMap = new Map<string, string>();

  for (const cat of seed.categories) {
    const created = await CategoryModel.create({ name: cat.name, description: cat.description });
    catIdMap.set(cat.id, String(created._id));
  }

  for (const sup of seed.suppliers) {
    const created = await SupplierModel.create({
      name: sup.name,
      contactPerson: sup.contactPerson,
      email: sup.email,
      phone: sup.phone,
      address: sup.address,
    });
    supIdMap.set(sup.id, String(created._id));
  }

  for (const prod of seed.products) {
    const created = await ProductModel.create({
      name: prod.name,
      sku: prod.sku,
      categoryId: catIdMap.get(prod.categoryId) || prod.categoryId,
      supplierId: supIdMap.get(prod.supplierId) || prod.supplierId,
      purchasePrice: prod.purchasePrice,
      sellingPrice: prod.sellingPrice,
      quantity: prod.quantity,
      minStockLevel: prod.minStockLevel,
      description: prod.description,
      imageUrl: prod.imageUrl || '',
    });
    prodIdMap.set(prod.id, String(created._id));
  }

  for (const mov of seed.stockMovements) {
    await StockMovementModel.create({
      ...mov,
      productId: prodIdMap.get(mov.productId) || mov.productId,
      supplierId: mov.supplierId ? supIdMap.get(mov.supplierId) || mov.supplierId : '',
      createdAt: new Date(mov.createdAt),
    });
  }

  for (const sale of seed.sales) {
    await SaleModel.create({
      ...sale,
      items: sale.items.map((item) => ({
        ...item,
        productId: prodIdMap.get(item.productId) || item.productId,
      })),
      createdAt: new Date(sale.createdAt),
    });
  }
}

export async function runInTransaction<T>(fn: (session?: mongoose.ClientSession) => Promise<T>): Promise<T> {
  if (usingMongo) {
    try {
      const session = await mongoose.startSession();
      try {
        let result!: T;
        await session.withTransaction(async () => {
          result = await fn(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    } catch (err) {
      // Standalone MongoDB without replica set throws on transactions; run sequential fallback if needed
      if (err instanceof Error && err.message.includes('Transaction numbers are only allowed')) {
        return fn(undefined);
      }
      throw err;
    }
  }

  // Serialized atomic transaction with rollback for local persistent store
  const run = txQueue.then(async () => {
    const state = loadLocalState();
    const backup = structuredClone(state);
    try {
      const result = await fn(undefined);
      persistLocalState(state);
      return result;
    } catch (err) {
      localState = backup;
      persistLocalState(backup);
      throw err;
    }
  });
  txQueue = run.catch(() => {});
  return run;
}

export const db = {
  isMongo: () => usingMongo,

  // USERS
  async countUsers(): Promise<number> {
    if (usingMongo) return UserModel.countDocuments();
    return loadLocalState().users.length;
  },

  async countAdmins(): Promise<number> {
    if (usingMongo) return UserModel.countDocuments({ role: 'admin' });
    return loadLocalState().users.filter((u) => u.role === 'admin').length;
  },

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const normalized = email.trim().toLowerCase();
    if (usingMongo) {
      const doc = await UserModel.findOne({ email: normalized }).lean();
      return doc ? mapMongoDoc<StoredUser>(doc as Record<string, unknown>) : null;
    }
    return loadLocalState().users.find((u) => u.email.toLowerCase() === normalized) || null;
  },

  async findUserById(id: string): Promise<StoredUser | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await UserModel.findById(id).lean();
      return doc ? mapMongoDoc<StoredUser>(doc as Record<string, unknown>) : null;
    }
    return loadLocalState().users.find((u) => u.id === id) || null;
  },

  async listUsers(): Promise<StoredUser[]> {
    if (usingMongo) {
      const docs = await UserModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => mapMongoDoc<StoredUser>(d as Record<string, unknown>));
    }
    return [...loadLocalState().users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createUser(input: Omit<StoredUser, 'id' | 'createdAt'>): Promise<StoredUser> {
    if (usingMongo) {
      const doc = await UserModel.create(input);
      return mapMongoDoc<StoredUser>(doc.toObject() as Record<string, unknown>);
    }
    const state = loadLocalState();
    const user: StoredUser = {
      ...input,
      email: input.email.trim().toLowerCase(),
      id: generateId('usr'),
      createdAt: new Date().toISOString(),
    };
    state.users.push(user);
    persistLocalState(state);
    return user;
  },

  async updateUser(
    id: string,
    patch: Partial<Pick<StoredUser, 'name' | 'email' | 'passwordHash' | 'role' | 'avatarUrl'>>
  ): Promise<StoredUser | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await UserModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
      return doc ? mapMongoDoc<StoredUser>(doc as Record<string, unknown>) : null;
    }
    const state = loadLocalState();
    const user = state.users.find((u) => u.id === id);
    if (!user) return null;
    Object.assign(user, patch);
    persistLocalState(state);
    return user;
  },

  async deleteUser(id: string): Promise<boolean> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return false;
      const res = await UserModel.findByIdAndDelete(id);
      return Boolean(res);
    }
    const state = loadLocalState();
    const idx = state.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    state.users.splice(idx, 1);
    persistLocalState(state);
    return true;
  },

  // CATEGORIES
  async listCategories(): Promise<Category[]> {
    if (usingMongo) {
      const docs = await CategoryModel.find().sort({ name: 1 }).lean();
      return docs.map((d) => mapMongoDoc<Category>(d as Record<string, unknown>));
    }
    return [...loadLocalState().categories].sort((a, b) => a.name.localeCompare(b.name));
  },

  async findCategoryById(id: string): Promise<Category | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await CategoryModel.findById(id).lean();
      return doc ? mapMongoDoc<Category>(doc as Record<string, unknown>) : null;
    }
    return loadLocalState().categories.find((c) => c.id === id) || null;
  },

  async createCategory(input: { name: string; description: string }): Promise<Category> {
    if (usingMongo) {
      const doc = await CategoryModel.create(input);
      return mapMongoDoc<Category>(doc.toObject() as Record<string, unknown>);
    }
    const state = loadLocalState();
    const cat: Category = {
      id: generateId('cat'),
      name: input.name.trim(),
      description: input.description.trim(),
      createdAt: new Date().toISOString(),
    };
    state.categories.push(cat);
    persistLocalState(state);
    return cat;
  },

  async updateCategory(id: string, patch: { name?: string; description?: string }): Promise<Category | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await CategoryModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
      return doc ? mapMongoDoc<Category>(doc as Record<string, unknown>) : null;
    }
    const state = loadLocalState();
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return null;
    if (patch.name !== undefined) cat.name = patch.name.trim();
    if (patch.description !== undefined) cat.description = patch.description.trim();
    persistLocalState(state);
    return cat;
  },

  async deleteCategory(id: string): Promise<boolean> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return false;
      const res = await CategoryModel.findByIdAndDelete(id);
      return Boolean(res);
    }
    const state = loadLocalState();
    const idx = state.categories.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    state.categories.splice(idx, 1);
    persistLocalState(state);
    return true;
  },

  // SUPPLIERS
  async listSuppliers(): Promise<Supplier[]> {
    if (usingMongo) {
      const docs = await SupplierModel.find().sort({ name: 1 }).lean();
      return docs.map((d) => mapMongoDoc<Supplier>(d as Record<string, unknown>));
    }
    return [...loadLocalState().suppliers].sort((a, b) => a.name.localeCompare(b.name));
  },

  async findSupplierById(id: string): Promise<Supplier | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await SupplierModel.findById(id).lean();
      return doc ? mapMongoDoc<Supplier>(doc as Record<string, unknown>) : null;
    }
    return loadLocalState().suppliers.find((s) => s.id === id) || null;
  },

  async createSupplier(input: Omit<Supplier, 'id' | 'createdAt'>): Promise<Supplier> {
    if (usingMongo) {
      const doc = await SupplierModel.create(input);
      return mapMongoDoc<Supplier>(doc.toObject() as Record<string, unknown>);
    }
    const state = loadLocalState();
    const sup: Supplier = {
      ...input,
      id: generateId('sup'),
      createdAt: new Date().toISOString(),
    };
    state.suppliers.push(sup);
    persistLocalState(state);
    return sup;
  },

  async updateSupplier(id: string, patch: Partial<Omit<Supplier, 'id' | 'createdAt'>>): Promise<Supplier | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await SupplierModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
      return doc ? mapMongoDoc<Supplier>(doc as Record<string, unknown>) : null;
    }
    const state = loadLocalState();
    const sup = state.suppliers.find((s) => s.id === id);
    if (!sup) return null;
    Object.assign(sup, patch);
    persistLocalState(state);
    return sup;
  },

  async deleteSupplier(id: string): Promise<boolean> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return false;
      const res = await SupplierModel.findByIdAndDelete(id);
      return Boolean(res);
    }
    const state = loadLocalState();
    const idx = state.suppliers.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    state.suppliers.splice(idx, 1);
    persistLocalState(state);
    return true;
  },

  // PRODUCTS
  async listProducts(session?: mongoose.ClientSession): Promise<Product[]> {
    if (usingMongo) {
      const docs = await ProductModel.find().session(session ?? null).sort({ createdAt: -1 }).lean();
      return docs.map((d) => mapMongoDoc<Product>(d as Record<string, unknown>));
    }
    return loadLocalState()
      .products.map((p) => ({ ...p }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async findProductById(id: string, session?: mongoose.ClientSession): Promise<Product | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await ProductModel.findById(id).session(session ?? null).lean();
      return doc ? mapMongoDoc<Product>(doc as Record<string, unknown>) : null;
    }
    const found = loadLocalState().products.find((p) => p.id === id);
    return found ? { ...found } : null;
  },

  async findProductBySku(sku: string): Promise<Product | null> {
    const normalized = sku.trim().toUpperCase();
    if (usingMongo) {
      const doc = await ProductModel.findOne({ sku: normalized }).lean();
      return doc ? mapMongoDoc<Product>(doc as Record<string, unknown>) : null;
    }
    return loadLocalState().products.find((p) => p.sku.toUpperCase() === normalized) || null;
  },

  async createProduct(
    input: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'categoryName' | 'supplierName'>
  ): Promise<Product> {
    if (usingMongo) {
      const doc = await ProductModel.create({ ...input, sku: input.sku.trim().toUpperCase() });
      return mapMongoDoc<Product>(doc.toObject() as Record<string, unknown>);
    }
    const state = loadLocalState();
    const now = new Date().toISOString();
    const prod: Product = {
      ...input,
      sku: input.sku.trim().toUpperCase(),
      id: generateId('prod'),
      createdAt: now,
      updatedAt: now,
    };
    state.products.push(prod);
    persistLocalState(state);
    return prod;
  },

  async updateProduct(
    id: string,
    patch: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>,
    session?: mongoose.ClientSession
  ): Promise<Product | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await ProductModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, session }
      ).lean();
      return doc ? mapMongoDoc<Product>(doc as Record<string, unknown>) : null;
    }
    const state = loadLocalState();
    const prod = state.products.find((p) => p.id === id);
    if (!prod) return null;
    Object.assign(prod, patch, { updatedAt: new Date().toISOString() });
    if (!session) persistLocalState(state);
    return prod;
  },

  async deleteProduct(id: string): Promise<boolean> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return false;
      const res = await ProductModel.findByIdAndDelete(id);
      return Boolean(res);
    }
    const state = loadLocalState();
    const idx = state.products.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    state.products.splice(idx, 1);
    persistLocalState(state);
    return true;
  },

  // STOCK MOVEMENTS
  async listStockMovements(): Promise<StockMovement[]> {
    if (usingMongo) {
      const docs = await StockMovementModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => mapMongoDoc<StockMovement>(d as Record<string, unknown>));
    }
    return [...loadLocalState().stockMovements].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  },

  async createStockMovement(
    input: Omit<StockMovement, 'id' | 'createdAt'>,
    session?: mongoose.ClientSession
  ): Promise<StockMovement> {
    if (usingMongo) {
      const [doc] = await StockMovementModel.create([input], { session });
      return mapMongoDoc<StockMovement>(doc.toObject() as Record<string, unknown>);
    }
    const state = loadLocalState();
    const mov: StockMovement = {
      ...input,
      id: generateId('mov'),
      createdAt: new Date().toISOString(),
    };
    state.stockMovements.push(mov);
    if (!session) persistLocalState(state);
    return mov;
  },

  // SALES
  async listSales(): Promise<Sale[]> {
    if (usingMongo) {
      const docs = await SaleModel.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => mapMongoDoc<Sale>(d as Record<string, unknown>));
    }
    return [...loadLocalState().sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async findSaleById(id: string): Promise<Sale | null> {
    if (usingMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await SaleModel.findById(id).lean();
      return doc ? mapMongoDoc<Sale>(doc as Record<string, unknown>) : null;
    }
    return loadLocalState().sales.find((s) => s.id === id) || null;
  },

  async createSale(
    input: Omit<Sale, 'id' | 'createdAt'>,
    session?: mongoose.ClientSession
  ): Promise<Sale> {
    if (usingMongo) {
      const [doc] = await SaleModel.create([input], { session });
      return mapMongoDoc<Sale>(doc.toObject() as Record<string, unknown>);
    }
    const state = loadLocalState();
    const sale: Sale = {
      ...input,
      id: generateId('sale'),
      createdAt: new Date().toISOString(),
    };
    state.sales.push(sale);
    if (!session) persistLocalState(state);
    return sale;
  },
};
