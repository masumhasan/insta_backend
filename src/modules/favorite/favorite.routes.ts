import { Router, Request, Response } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { FavoriteService } from './favorite.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.success(res, 200, 'Favorites retrieved', await FavoriteService.list((req as any).user))
  )
);
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.success(res, 201, 'Favorite saved', await FavoriteService.create((req as any).user, req.body || {}))
  )
);
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.success(res, 200, 'Favorite updated', await FavoriteService.update((req as any).user, String(req.params.id), req.body || {}))
  )
);
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.success(res, 200, 'Favorite deleted', await FavoriteService.remove((req as any).user, String(req.params.id)))
  )
);

export const favoriteRoutes = router;
