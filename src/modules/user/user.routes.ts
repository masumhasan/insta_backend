import { Router } from 'express';
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

router.get('/', getUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.patch('/:id/approve', approveUser);
router.post('/:id/team-lead-request', requestTeamLead);
router.post('/:id/crm-notes', addCrmNote);
router.delete('/:id', deleteUser);

export const userRoutes = router;

