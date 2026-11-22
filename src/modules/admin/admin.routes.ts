import { Router } from 'express';
import { getAdmins, createAdmin, updateAdmin, deleteAdmin, getDashboardStats } from './admin.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles, STAFF_ROLES } from '../../middlewares/roleGuard.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';

const router = Router();

router.use(authenticate);

// Endpoints matching adminApi.ts. Business revenue and order counts are for staff only.
// ?granularity=daily|monthly|yearly picks the Revenue / Orders Trend buckets (default monthly).
router.get('/dashboard-stats', authorizeRoles(...STAFF_ROLES), getDashboardStats);

// Managing admins (and their per-section permissions) — Sign company / Admin only,
// and Admin staff additionally need the "Make Admin" permission.
const manageAdmins = [authorizeRoles('Admin', 'Sign company'), requirePermission('settings.make-admin', 'make-admin')];
router.get('/get-admins', ...manageAdmins, getAdmins);
router.post('/create-admin', ...manageAdmins, createAdmin);
router.patch('/update-admin/:id', ...manageAdmins, updateAdmin);
router.delete('/delete-admin/:id', ...manageAdmins, deleteAdmin);

export const adminRoutes = router;
