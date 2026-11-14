import { Router } from 'express';
import { getAdmins, createAdmin, updateAdmin, deleteAdmin, getDashboardStats } from './admin.controller';

const router = Router();

// Endpoints matching adminApi.ts
router.get('/dashboard-stats', getDashboardStats);
router.get('/get-admins', getAdmins);
router.post('/create-admin', createAdmin);
router.patch('/update-admin/:id', updateAdmin);
router.delete('/delete-admin/:id', deleteAdmin);

export const adminRoutes = router;

