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
  processOrderPayment,
  requestDueDateChange,
  rescheduleOrderDueDate,
  updateOrderPullList,
  scanPullItem,
  getPricing,
  previewCoupon,
} from './order.controller';
import { uploadImage } from '../../middlewares/upload.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles, STAFF_ROLES } from '../../middlewares/roleGuard.middleware';
import { getOrderNotes, addOrderNote } from './order.notes';
import { markProductionComplete, respondDesignApproval, uploadDesignProof } from './order.designApproval.controller';

const router = Router();

router.use(authenticate);

router.get('/', getOrders);
router.get('/route-plan', getRoutePlan);
router.get('/pricing', getPricing);
router.get('/coupon-preview', previewCoupon);
router.get('/revenue', authorizeRoles('Admin', 'Sign company', 'Office Manager'), getRevenue);
router.post('/import-csv', authorizeRoles('Admin', 'Sign company', 'Office Manager'), importCsvOrders);
router.post('/', createOrder);
router.get('/:id', getOrderById);
router.patch('/:id', updateOrder);
// Custom design approval (order.designApproval.ts): the customer answers, staff send proofs and finish production.
router.post('/:id/design-approval', authorizeRoles('Agent', 'Assistant', 'Team Lead'), respondDesignApproval);
router.post('/:id/design-proof', authorizeRoles(...STAFF_ROLES), uploadDesignProof);
router.patch('/:id/production-complete', authorizeRoles(...STAFF_ROLES), markProductionComplete);
// Internal notes with @mentions (staff only; see order.notes.ts).
router.get('/:id/notes', authorizeRoles(...STAFF_ROLES), getOrderNotes);
router.post('/:id/notes', authorizeRoles(...STAFF_ROLES), addOrderNote);
router.patch(
  '/:id/assign',
  authorizeRoles('Admin', 'Sign company', 'Warehouse manager', 'Office Manager'),
  assignInstaller
);
router.patch('/:id/due-date-request', requestDueDateChange);
router.patch('/:id/reschedule', authorizeRoles('Agent', 'Assistant', 'Team Lead'), rescheduleOrderDueDate);
router.patch(
  '/:id/pull-list',
  authorizeRoles('Admin', 'Sign company', 'Installer', 'Photographer', 'Warehouse manager', 'Office Manager'),
  updateOrderPullList
);
router.post(
  '/:id/pull-list/scan',
  authorizeRoles('Admin', 'Sign company', 'Installer', 'Photographer', 'Warehouse manager', 'Office Manager'),
  scanPullItem
);
router.post('/:id/refund', authorizeRoles('Admin', 'Sign company', 'Office Manager'), refundOrder);
router.post('/:id/process-payment', authorizeRoles('Admin', 'Sign company', 'Office Manager'), processOrderPayment);
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
