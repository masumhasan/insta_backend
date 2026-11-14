import { Router } from 'express';
import { uploadImage, uploadDesignFile } from '../../middlewares/upload.middleware';
import {
  uploadSingleImage,
  uploadMultipleImages,
  deleteUploadedImage,
} from './upload.controller';

const router = Router();

router.post('/image', uploadImage.any(), uploadSingleImage);
router.post('/images', uploadImage.any(), uploadMultipleImages);
router.post('/design', uploadDesignFile.any(), uploadSingleImage);
router.delete('/image', deleteUploadedImage);

export const uploadRoutes = router;

