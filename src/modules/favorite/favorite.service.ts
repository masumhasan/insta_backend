import { Favorite } from './favorite.model';
import { AppError } from '../../utils/apiError';

const ownerOf = (user: any): string => String(user?.parentAgentId || user?._id || '');

const format = (f: any) => ({
  id: String(f._id),
  _id: String(f._id),
  name: f.name,
  propertyType: f.propertyType || '',
  isDefault: !!f.isDefault,
  layout: f.layout || {},
  createdAt: f.createdAt,
});

const cleanLayout = (layout: unknown) => {
  if (!layout || typeof layout !== 'object') throw new AppError('A layout is required.', 400);
  // Layouts are small JSON documents (item references + display data); reject anything oversized or with embedded images.
  const json = JSON.stringify(layout);
  if (json.length > 20000) throw new AppError('Layout is too large.', 400);
  if (/data:image\//i.test(json)) throw new AppError('Layouts cannot contain base64 images.', 400);
  return layout as Record<string, any>;
};

export class FavoriteService {
  static async list(user: any) {
    const items = await Favorite.find({ ownerId: ownerOf(user) }).sort({ isDefault: -1, createdAt: -1 }).lean();
    return items.map(format);
  }

  static async create(user: any, payload: any) {
    const name = String(payload.name || '').trim();
    if (!name) throw new AppError('Please name this favorite.', 400);
    const ownerId = ownerOf(user);
    if (payload.isDefault) await Favorite.updateMany({ ownerId }, { $set: { isDefault: false } });
    const doc = await Favorite.create({
      ownerId,
      createdBy: String(user?._id || ''),
      name,
      propertyType: String(payload.propertyType || '').trim(),
      isDefault: !!payload.isDefault,
      layout: cleanLayout(payload.layout),
    });
    return format(doc.toObject());
  }

  static async update(user: any, id: string, payload: any) {
    const doc = await Favorite.findOne({ _id: id, ownerId: ownerOf(user) });
    if (!doc) throw new AppError('Favorite not found.', 404);
    if (payload.name !== undefined) doc.name = String(payload.name).trim() || doc.name;
    if (payload.propertyType !== undefined) doc.propertyType = String(payload.propertyType).trim();
    if (payload.layout !== undefined) doc.layout = cleanLayout(payload.layout);
    if (payload.isDefault !== undefined) {
      if (payload.isDefault) await Favorite.updateMany({ ownerId: doc.ownerId }, { $set: { isDefault: false } });
      doc.isDefault = !!payload.isDefault;
    }
    await doc.save();
    return format(doc.toObject());
  }

  static async remove(user: any, id: string) {
    const res = await Favorite.deleteOne({ _id: id, ownerId: ownerOf(user) });
    if (!res.deletedCount) throw new AppError('Favorite not found.', 404);
    return { success: true };
  }
}
