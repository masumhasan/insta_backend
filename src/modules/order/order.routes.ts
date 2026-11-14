import { Router } from 'express';
import {
  getOrders,
  getRoutePlan,
  getRevenue,
  getOrderById,
  createOrder,
  importCsvOrders,
  updateOrder,
  assignInstaller,
  addPhoto,
  removePhoto,
  refundOrder,
  requestDueDateChange,
  updateOrderPullList,
} from './order.controller';
import { uploadImage } from '../../middlewares/upload.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/roleGuard.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getOrders);
router.get('/route-plan', getRoutePlan);
router.get('/revenue', authorizeRoles('Admin', 'Sign company', 'Office Manager'), getRevenue);
router.post('/import-csv', authorizeRoles('Admin', 'Sign company', 'Office Manager'), importCsvOrders);
router.post('/', createOrder);
router.get('/:id', getOrderById);
router.patch('/:id', updateOrder);
router.patch(
  '/:id/assign',
  authorizeRoles('Admin', 'Sign company', 'Warehouse manager', 'Office Manager'),
  assignInstaller
);
router.patch('/:id/due-date-request', requestDueDateChange);
router.patch(
  '/:id/pull-list',
  authorizeRoles('Admin', 'Sign company', 'Installer', 'Photographer', 'Warehouse manager', 'Office Manager'),
  updateOrderPullList
);
router.post('/:id/refund', authorizeRoles('Admin', 'Sign company', 'Office Manager'), refundOrder);
router.post(
  '/:id/photo',
  authorizeRoles('Admin', 'Sign company', 'Installer', 'Photographer', 'Warehouse manager', 'Office Manager'),
  uploadImage.any(),
  addPhoto
);
router.delete(
  '/:id/photo',
  authorizeRoles('Admin', 'Sign company', 'Installer', 'Photographer', 'Warehouse manager', 'Office Manager'),
  removePhoto
);

export const orderRoutes = router;
