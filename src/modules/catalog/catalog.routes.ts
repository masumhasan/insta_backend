import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles, STAFF_ROLES } from '../../middlewares/roleGuard.middleware';
import { getMediaOfferings } from './catalog.media';
import {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getPackages,
  createPackage,
  updatePackage,
  deletePackage,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getServiceItems,
  createServiceItem,
  updateServiceItem,
  deleteServiceItem,
  getActiveAnnouncements,
  getAddOns,
  getPrintOptions,
} from './catalog.controller';
const router = Router();

const staffOnly = authorizeRoles(...STAFF_ROLES);
const warehouseWriters = authorizeRoles(...STAFF_ROLES, 'Warehouse manager');

// The public site reads the FAQ without signing in; every other catalog route needs a signed-in user.
const publicFaqOnly = (req: Request, res: Response, next: NextFunction) =>
  (req.params.type || req.query.type) === 'faq' ? next() : authenticate(req, res, next);
router.get('/items', publicFaqOnly, getServiceItems);
router.get('/items/:type', publicFaqOnly, getServiceItems);
router.use(authenticate);

// Warehouses
router.get('/warehouses', getWarehouses);
router.post('/warehouses', warehouseWriters, createWarehouse);
router.patch('/warehouses/:id', warehouseWriters, updateWarehouse);
router.delete('/warehouses/:id', staffOnly, deleteWarehouse);

// Materials
router.get('/materials', getMaterials);
router.post('/materials', warehouseWriters, createMaterial);
router.patch('/materials/:id', warehouseWriters, updateMaterial);
router.delete('/materials/:id', staffOnly, deleteMaterial);

// Packages
router.get('/packages', getPackages);
router.post('/packages', staffOnly, createPackage);
router.patch('/packages/:id', staffOnly, updatePackage);
router.delete('/packages/:id', staffOnly, deletePackage);

// Coupons
// Coupon codes are staff-only; customers validate a code through GET /orders/coupon-preview.
router.get('/coupons', staffOnly, getCoupons);
router.post('/coupons', staffOnly, createCoupon);
router.patch('/coupons/:id', staffOnly, updateCoupon);
router.delete('/coupons/:id', staffOnly, deleteCoupon);

// Service Items (Services, Sign Types, Sizes, Delivery Methods, Options, etc.)
// Announcements that are currently live for a portal (?portal=agent|assistant|team_lead|warehouse|installer|sign_company)
router.get('/announcements/active', getActiveAnnouncements);
// Read lists for the order forms (any signed-in user); staff manage the rows through /items.
router.get('/add-ons', getAddOns);
router.get('/print-options', getPrintOptions);
// Media Services order form: photography, videography, media packages, extras and add-ons (with durations).
router.get('/media-offerings', getMediaOfferings);
router.post('/items', staffOnly, createServiceItem);
router.patch('/items/:id', staffOnly, updateServiceItem);
router.delete('/items/:id', staffOnly, deleteServiceItem);

export const catalogRoutes = router;
