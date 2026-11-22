import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles, STAFF_ROLES } from '../../middlewares/roleGuard.middleware';
import { UserRole } from '../auth/user.model';
import {
  deleteCard,
  getCards,
  getOrderCards,
  getPaymentConfig,
  patchDefaultCard,
  postChargeOrder,
  postSetupIntent,
} from './payment.controller';

/** Roles that pay for orders (customers) or take payment for them (staff). Field and warehouse roles have no access. */
const PAYER_ROLES: UserRole[] = [...STAFF_ROLES, 'Agent', 'Assistant', 'Team Lead'];

const router = Router();

router.use(authenticate);
router.use(authorizeRoles(...PAYER_ROLES));

router.get('/config', getPaymentConfig);
// Own cards; staff may pass ?userId= to read a customer's cards.
router.get('/cards', getCards);
// Adding, removing and choosing the default card are always on the caller's own account.
router.post('/cards/setup-intent', postSetupIntent);
router.patch('/cards/:paymentMethodId/default', patchDefaultCard);
router.delete('/cards/:paymentMethodId', deleteCard);
// Cards that can pay an order, and charging it (amount comes from the order on the server).
router.get('/orders/:id/cards', getOrderCards);
router.post('/orders/:id/charge', postChargeOrder);

export const paymentRoutes = router;
