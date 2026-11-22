import { isValidObjectId } from 'mongoose';
import { Review } from './review.model';
import { User } from '../auth/user.model';
import { AppError } from '../../utils/apiError';
import { extractImageFields, cleanupReplacedAsset } from '../../utils/imageGuard';

// Only public-safe fields of the tagged user ever leave the server (no email/phone).
const TAGGED_FIELDS = 'name role imageUrl company brokerage';

const format = (r: any) => {
  const u = r.taggedUser && typeof r.taggedUser === 'object' && r.taggedUser.name ? r.taggedUser : null;
  return {
    id: r._id.toString(),
    reviewerName: r.reviewerName,
    reviewerTitle: r.reviewerTitle || '',
    imageUrl: r.imageUrl || '',
    publicId: r.publicId || '',
    rating: r.rating,
    text: r.text,
    displayOrder: r.displayOrder ?? 0,
    published: !!r.published,
    taggedUser: u
      ? { id: u._id.toString(), name: u.name, role: u.role, imageUrl: u.imageUrl || '', company: u.brokerage || u.company || '' }
      : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Validates and whitelists review fields. `partial` allows PATCH bodies that omit required fields. */
async function clean(payload: any, partial: boolean) {
  const out: Record<string, any> = {};

  if (!partial || payload.reviewerName !== undefined) {
    out.reviewerName = str(payload.reviewerName);
    if (!out.reviewerName) throw new AppError('Reviewer name is required', 400);
  }
  if (!partial || payload.text !== undefined) {
    out.text = str(payload.text);
    if (!out.text) throw new AppError('Review text is required', 400);
  }
  if (!partial || payload.rating !== undefined) {
    const rating = Number(payload.rating ?? 5);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError('Rating must be a whole number from 1 to 5', 400);
    }
    out.rating = rating;
  }
  if (payload.reviewerTitle !== undefined) out.reviewerTitle = str(payload.reviewerTitle);
  if (payload.displayOrder !== undefined) out.displayOrder = Number(payload.displayOrder) || 0;
  if (payload.published !== undefined) out.published = payload.published === true || payload.published === 'true';

  const img = extractImageFields(payload);
  if (img.hasImageUpdate) {
    out.imageUrl = img.imageUrl;
    out.publicId = img.imageUrl ? img.publicId : '';
  }

  if (payload.taggedUserId !== undefined) {
    const id = payload.taggedUserId;
    if (!id) out.taggedUser = null;
    else {
      if (!isValidObjectId(id) || !(await User.exists({ _id: id }))) throw new AppError('Tagged user not found', 400);
      out.taggedUser = id;
    }
  }
  return out;
}

export class ReviewService {
  /** Public: published reviews only, for the landing page. */
  static async listPublished() {
    const items = await Review.find({ published: true })
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(50)
      .populate('taggedUser', TAGGED_FIELDS)
      .lean();
    return items.map(format);
  }

  static async listAll(query: { search?: string; published?: string } = {}) {
    const filter: any = {};
    if (query.published === 'true' || query.published === 'false') filter.published = query.published === 'true';
    const term = str(query.search);
    if (term) {
      const rx = { $regex: escapeRegex(term), $options: 'i' };
      filter.$or = [{ reviewerName: rx }, { text: rx }];
    }
    const items = await Review.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .populate('taggedUser', TAGGED_FIELDS)
      .lean();
    return items.map(format);
  }

  static async create(payload: any, createdBy = '') {
    const data = await clean(payload || {}, false);
    const doc = await Review.create({ ...data, createdBy });
    await doc.populate('taggedUser', TAGGED_FIELDS);
    return format(doc.toObject());
  }

  static async update(id: string, payload: any) {
    if (!isValidObjectId(id)) throw new AppError('Review not found', 404);
    const existing = await Review.findById(id);
    if (!existing) throw new AppError('Review not found', 404);
    const data = await clean(payload || {}, true);
    const previousPublicId = existing.publicId;
    existing.set(data);
    await existing.save();
    if (data.publicId !== undefined) await cleanupReplacedAsset(previousPublicId, data.publicId);
    await existing.populate('taggedUser', TAGGED_FIELDS);
    return format(existing.toObject());
  }

  static async remove(id: string) {
    if (!isValidObjectId(id)) throw new AppError('Review not found', 404);
    const doc = await Review.findByIdAndDelete(id);
    if (!doc) throw new AppError('Review not found', 404);
    await cleanupReplacedAsset(doc.publicId, null);
  }
}
