import { Router } from 'express';
import {
  changePassword,
  changePasswordSchema,
  getAuthStatus,
  getMe,
  login,
  loginSchema,
  register,
  registerSchema,
  setupAdmin,
  setupAdminSchema,
  updateProfile,
  updateProfileSchema,
} from '../controllers/authController.js';
import {
  categorySchema,
  createCategory,
  deleteCategory,
  getCategoryProducts,
  listCategories,
  updateCategory,
} from '../controllers/categoryController.js';
import { getDashboardAnalytics } from '../controllers/dashboardController.js';
import {
  createProduct,
  deleteProduct,
  generateSkuEndpoint,
  getProductById,
  listProducts,
  productSchema,
  updateProduct,
} from '../controllers/productController.js';
import {
  getLowStockReport,
  getSalesReport,
  getValuationReport,
} from '../controllers/reportController.js';
import {
  createSale,
  createSaleSchema,
  getSaleById,
  listSales,
} from '../controllers/salesController.js';
import {
  getLowStockAlerts,
  listStockMovements,
  recordStockMovement,
  stockMovementSchema,
} from '../controllers/stockController.js';
import {
  createSupplier,
  deleteSupplier,
  getSupplierHistory,
  listSuppliers,
  supplierSchema,
  updateSupplier,
} from '../controllers/supplierController.js';
import {
  createUser,
  createUserSchema,
  deleteUser,
  listUsers,
  updateUserRole,
  updateUserRoleSchema,
} from '../controllers/userController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { rejectNoSqlOperators, validateBody } from '../middleware/validate.js';

export const apiRouter = Router();

apiRouter.use(rejectNoSqlOperators);

// Auth routes
apiRouter.get('/auth/status', getAuthStatus);
apiRouter.post('/auth/setup-admin', validateBody(setupAdminSchema), setupAdmin);
apiRouter.post('/auth/register', validateBody(registerSchema), register);
apiRouter.post('/auth/login', validateBody(loginSchema), login);
apiRouter.get('/auth/me', authenticate, getMe);
apiRouter.put('/auth/profile', authenticate, validateBody(updateProfileSchema), updateProfile);
apiRouter.put(
  '/auth/password',
  authenticate,
  validateBody(changePasswordSchema),
  changePassword
);

// Dashboard analytics
apiRouter.get('/dashboard/analytics', authenticate, getDashboardAnalytics);

// Products
apiRouter.get('/products/generate-sku', authenticate, generateSkuEndpoint);
apiRouter.get('/products', authenticate, listProducts);
apiRouter.get('/products/:id', authenticate, getProductById);
apiRouter.post('/products', authenticate, validateBody(productSchema), createProduct);
apiRouter.put('/products/:id', authenticate, validateBody(productSchema), updateProduct);
apiRouter.delete('/products/:id', authenticate, requireRole('admin'), deleteProduct);

// Categories
apiRouter.get('/categories', authenticate, listCategories);
apiRouter.get('/categories/:id/products', authenticate, getCategoryProducts);
apiRouter.post('/categories', authenticate, validateBody(categorySchema), createCategory);
apiRouter.put('/categories/:id', authenticate, validateBody(categorySchema), updateCategory);
apiRouter.delete('/categories/:id', authenticate, requireRole('admin'), deleteCategory);

// Suppliers
apiRouter.get('/suppliers', authenticate, listSuppliers);
apiRouter.get('/suppliers/:id/history', authenticate, getSupplierHistory);
apiRouter.post('/suppliers', authenticate, validateBody(supplierSchema), createSupplier);
apiRouter.put('/suppliers/:id', authenticate, validateBody(supplierSchema), updateSupplier);
apiRouter.delete('/suppliers/:id', authenticate, requireRole('admin'), deleteSupplier);

// Stock management
apiRouter.get('/stock/movements', authenticate, listStockMovements);
apiRouter.get('/stock/alerts', authenticate, getLowStockAlerts);
apiRouter.post('/stock/movements', authenticate, validateBody(stockMovementSchema), recordStockMovement);

// Sales
apiRouter.get('/sales', authenticate, listSales);
apiRouter.get('/sales/:id', authenticate, getSaleById);
apiRouter.post('/sales', authenticate, validateBody(createSaleSchema), createSale);

// Reports
apiRouter.get('/reports/sales', authenticate, getSalesReport);
apiRouter.get('/reports/valuation', authenticate, getValuationReport);
apiRouter.get('/reports/low-stock', authenticate, getLowStockReport);

// Users (Admin RBAC)
apiRouter.get('/users', authenticate, requireRole('admin'), listUsers);
apiRouter.post('/users', authenticate, requireRole('admin'), validateBody(createUserSchema), createUser);
apiRouter.patch(
  '/users/:id/role',
  authenticate,
  requireRole('admin'),
  validateBody(updateUserRoleSchema),
  updateUserRole
);
apiRouter.delete('/users/:id', authenticate, requireRole('admin'), deleteUser);
