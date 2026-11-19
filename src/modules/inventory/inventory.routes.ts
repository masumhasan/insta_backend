import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
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

router.get('/', authenticate, getInventory);
router.get('/returns', getReturns);
router.post('/returns', createReturn);
router.patch('/returns/:id', processQueueItem);
router.post('/import-csv', importInventoryCsv);
router.post('/', createInventoryItem);
router.get('/:id/qr', getInventoryQr);
router.get('/:id/qr-svg', getInventoryQrSvg);
router.get('/:id/label-pdf', getInventoryLabelPdf);
router.patch('/:id', updateInventoryItem);
router.delete('/:id', deleteInventoryItem);
router.patch('/:id/adjust', adjustStock);
router.post('/:id/units', authenticate, generateInventoryUnits);
router.patch('/:id/units/:unit', authenticate, updateInventoryUnit);

export const inventoryRoutes = router;
