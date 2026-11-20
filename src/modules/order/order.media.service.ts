import { Order } from './order.model';
import { Warehouse } from '../catalog/warehouse.model';
import { User } from '../auth/user.model';
import { optimizeRouteWaypoints, attachRoadGeometry } from './route.helper';
import { geocodeAddress, mapWithConcurrency } from '../geo/geocode.service';
import { AppError } from '../../utils/apiError';
import { assertNoBase64 } from '../../utils/imageGuard';
import { CloudinaryService } from '../../utils/cloudinary.service';

export function normalizePhotos(photos: any[] = []) {
  return photos
    .map((p) =>
      typeof p === 'string'
        ? { imageUrl: p, publicId: '' }
        : { imageUrl: p?.imageUrl || '', publicId: p?.publicId || '' }
    )
    .filter((p) => Boolean(p.imageUrl));
}

export class OrderMediaService {
  static async addPhoto(
    id: string,
    input: { fileBuffer?: Buffer; imageUrl?: string; photoUrl?: string; publicId?: string }
  ) {
    const order = await Order.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNumber: id }],
    });
    if (!order) throw new AppError('Order not found.', 404);

    let imageUrl = input.imageUrl || input.photoUrl || '';
    let publicId = input.publicId || '';

    if (input.fileBuffer) {
      const uploaded = await CloudinaryService.uploadBuffer(input.fileBuffer, 'orders');
      imageUrl = uploaded.imageUrl;
      publicId = uploaded.publicId;
    } else {
      assertNoBase64(imageUrl, 'photoUrl');
      if (!imageUrl || imageUrl.startsWith('blob:')) {
        throw new AppError('Valid Cloudinary imageUrl or image file is required.', 400);
      }
    }

    if (!order.photos) order.photos = [];
    order.photos.push({ imageUrl, publicId });
    await order.save();

    return { id: order.orderNumber, _id: order._id.toString(), photos: normalizePhotos(order.photos) };
  }

  static async removePhoto(id: string, target: { publicId?: string; imageUrl?: string }) {
    const order = await Order.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNumber: id }],
    });
    if (!order) throw new AppError('Order not found.', 404);

    const existingPhotos = normalizePhotos(order.photos);
    const removed = existingPhotos.find(
      (p) => (target.publicId && p.publicId === target.publicId) || (target.imageUrl && p.imageUrl === target.imageUrl)
    );

    if (removed?.publicId) {
      await CloudinaryService.deleteAsset(removed.publicId);
    }

    order.photos = existingPhotos.filter(
      (p) => !((target.publicId && p.publicId === target.publicId) || (target.imageUrl && p.imageUrl === target.imageUrl))
    ) as any;

    await order.save();
    return { id: order.orderNumber, photos: normalizePhotos(order.photos) };
  }

  static async getRoutePlan(query: { installer?: string; mode?: string; warehouseId?: string }, currentUser?: any) {
    const mode = query.mode || 'optimize';
    const installer = (query.installer || 'all').trim();

    const [installers, warehouses] = await Promise.all([
      User.find({ role: /installer|photographer/i, status: { $ne: 'inactive' } })
        .select('name email company status role')
        .sort({ name: 1 })
        .lean(),
      Warehouse.find().sort({ createdAt: 1 }).lean(),
    ]);

    const orderFilter: any = { status: { $nin: ['Completed', 'Cancelled'] } };
    if (currentUser?.role === 'Installer' || currentUser?.role === 'Photographer') {
      orderFilter.$or = [
        { installerEmail: currentUser.email?.toLowerCase() },
        { installerId: currentUser._id?.toString() },
      ];
    } else if (installer && installer !== 'all') {
      orderFilter.$or = [
        { installerEmail: installer.toLowerCase() },
        { installerName: { $regex: installer, $options: 'i' } },
      ];
    }

    const orders = await Order.find(orderFilter).sort({ createdAt: 1 }).lean();
    const orderedWarehouses = query.warehouseId
      ? [
          ...warehouses.filter((w: any) => w._id.toString() === query.warehouseId),
          ...warehouses.filter((w: any) => w._id.toString() !== query.warehouseId),
        ]
      : warehouses;

    // Pin every stop at its real location: geocode addresses that have no saved coordinates (once, then stored).
    const needsGeo = orders.filter((o: any) => {
      const sp = o.specifications || {};
      const hasCoords = typeof sp.lat === 'number' && typeof sp.lng === 'number';
      // geoFor === address means "already looked up" (even when nothing was found), so bad addresses are not retried on every load.
      return o.address && sp.geoFor !== o.address && !(hasCoords && !sp.geoFor);
    });
    await mapWithConcurrency(needsGeo.slice(0, 10), 3, async (o: any) => {
      let g;
      try {
        g = await geocodeAddress(o.address);
      } catch {
        return; // provider down: leave unmarked so the next load retries
      }
      const { lat: _lat, lng: _lng, geoPrecision: _gp, ...rest } = o.specifications || {};
      if (g) {
        o.specifications = { ...rest, lat: g.lat, lng: g.lng, geoPrecision: g.precision, geoFor: o.address };
        await Order.updateOne({ _id: o._id }, { $set: { 'specifications.lat': g.lat, 'specifications.lng': g.lng, 'specifications.geoPrecision': g.precision, 'specifications.geoFor': o.address } });
      } else {
        // Genuine miss: mark it and drop any stale pin so the route falls back to the area estimate.
        o.specifications = { ...rest, geoFor: o.address };
        await Order.updateOne({ _id: o._id }, { $set: { 'specifications.geoFor': o.address }, $unset: { 'specifications.lat': '', 'specifications.lng': '', 'specifications.geoPrecision': '' } });
      }
    });
    await mapWithConcurrency(
      warehouses.filter((w: any) => w.location && w.geoFor !== w.location).slice(0, 5),
      2,
      async (w: any) => {
        let g;
        try {
          g = await geocodeAddress(w.location);
        } catch {
          return;
        }
        w.lat = g?.lat;
        w.lng = g?.lng;
        w.geoFor = w.location;
        await Warehouse.updateOne(
          { _id: w._id },
          g ? { $set: { lat: g.lat, lng: g.lng, geoFor: w.location } } : { $set: { geoFor: w.location }, $unset: { lat: '', lng: '' } }
        );
      }
    );

    const basePlan = optimizeRouteWaypoints({
      warehouses: orderedWarehouses,
      orders,
      mode,
    });
    const optimized = await attachRoadGeometry(basePlan);

    return {
      installers: installers.map((i: any) => ({
        id: i._id.toString(),
        name: i.name,
        email: i.email,
      })),
      warehouses: warehouses.map((w: any) => ({
        id: w._id.toString(),
        name: w.name,
        location: w.location,
      })),
      ...optimized,
    };
  }
}

