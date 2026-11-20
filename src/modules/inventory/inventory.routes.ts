import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles, STAFF_ROLES } from '../../middlewares/roleGuard.middleware';
import {
  getInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  adjustStock,
  importInventoryCsv,
  getReturns,
  createReturn,
  processQueueItem,
  getInventoryQr,
  getInventoryQrSvg,
  getInventoryLabelPdf,
  generateInventoryUnits,
  updateInventoryUnit,
} from './inventory.controller';

const router = Router();

// Every inventory route needs a signed-in user; stock changes are limited to staff and the warehouse team.
const stockWriters = authorizeRoles(...STAFF_ROLES, 'Warehouse manager');
const fieldTeam = authorizeRoles(...STAFF_ROLES, 'Warehouse manager', 'Installer', 'Photographer');

router.use(authenticate);
router.get('/', getInventory);
router.get('/returns', getReturns);
router.post('/returns', fieldTeam, createReturn);
router.patch('/returns/:id', stockWriters, processQueueItem);
router.post('/import-csv', stockWriters, importInventoryCsv);
router.post('/', stockWriters, createInventoryItem);
router.get('/:id/qr', getInventoryQr);
router.get('/:id/qr-svg', getInventoryQrSvg);
router.get('/:id/label-pdf', getInventoryLabelPdf);
router.patch('/:id', stockWriters, updateInventoryItem);
router.delete('/:id', stockWriters, deleteInventoryItem);
router.patch('/:id/adjust', stockWriters, adjustStock);
router.post('/:id/units', stockWriters, generateInventoryUnits);
router.patch('/:id/units/:unit', fieldTeam, updateInventoryUnit);

export const inventoryRoutes = router;
