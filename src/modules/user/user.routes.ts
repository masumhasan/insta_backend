import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles, STAFF_ROLES } from '../../middlewares/roleGuard.middleware';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  approveUser,
  requestTeamLead,
  addCrmNote,
} from './user.controller';

const router = Router();

// Every user route needs a signed-in user. Fine-grained rules (who may manage whom) live in user.policy.ts.
router.use(authenticate);

router.get('/', getUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.patch('/:id/approve', authorizeRoles(...STAFF_ROLES), approveUser);
router.post('/:id/team-lead-request', requestTeamLead);
router.post('/:id/crm-notes', authorizeRoles(...STAFF_ROLES), addCrmNote);
router.delete('/:id', deleteUser);

export const userRoutes = router;

