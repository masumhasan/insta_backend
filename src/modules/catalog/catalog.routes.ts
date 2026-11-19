import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
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
} from './catalog.controller';

const router = Router();

// Warehouses
router.get('/warehouses', getWarehouses);
router.post('/warehouses', createWarehouse);
router.patch('/warehouses/:id', updateWarehouse);
router.delete('/warehouses/:id', deleteWarehouse);

// Materials
router.get('/materials', getMaterials);
router.post('/materials', createMaterial);
router.patch('/materials/:id', updateMaterial);
router.delete('/materials/:id', deleteMaterial);

// Packages
router.get('/packages', getPackages);
router.post('/packages', createPackage);
router.patch('/packages/:id', updatePackage);
router.delete('/packages/:id', deletePackage);

// Coupons
router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.patch('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

// Service Items (Services, Sign Types, Sizes, Delivery Methods, Options, etc.)
// Announcements that are currently live for a portal (?portal=agent|assistant|team_lead|warehouse|installer|sign_company)
router.get('/announcements/active', authenticate, getActiveAnnouncements);
router.get('/items', getServiceItems);
router.get('/items/:type', getServiceItems);
router.post('/items', createServiceItem);
router.patch('/items/:id', updateServiceItem);
router.delete('/items/:id', deleteServiceItem);

export const catalogRoutes = router;
