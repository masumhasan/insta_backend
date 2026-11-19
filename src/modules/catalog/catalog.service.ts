import { WarehouseService } from './warehouse.service';
import { Material } from './material.model';
import { Package } from './package.model';
import { Coupon } from './coupon.model';
import { ServiceItem } from './service.model';
import { AppError } from '../../utils/apiError';
import { extractImageFields, cleanupReplacedAsset } from '../../utils/imageGuard';
import { CloudinaryService } from '../../utils/cloudinary.service';

export class CatalogService {
  // Warehouses
  static getWarehouses = (query: any = {}) => WarehouseService.getWarehouses(query);
  static createWarehouse = (payload: { name: string; location: string; assignedStaff?: any[] }) =>
    WarehouseService.createWarehouse(payload);
  static updateWarehouse = (id: string, payload: any = {}) => WarehouseService.updateWarehouse(id, payload);
  static deleteWarehouse = (id: string) => WarehouseService.deleteWarehouse(id);

  // Materials
  static async getMaterials(query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    const category = typeof query.category === 'string' ? query.category.trim() : '';
    if (category && category.toLowerCase() !== 'all') {
      const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.category = new RegExp(`^${escapedCategory}$`, 'i');
    }

    const rawSearch = typeof query.search === 'string'
      ? query.search
      : typeof query.searchTerm === 'string'
        ? query.searchTerm
        : '';
    const search = rawSearch.trim();
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { name: searchRegex },
        { category: searchRegex },
        { vendorName: searchRegex },
      ];
    }

    const [total, materials] = await Promise.all([
      Material.countDocuments(filter),
      Material.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const formatted = materials.map((m: any) => ({
      id: m._id.toString(),
      name: m.name,
      price: m.price,
      category: m.category,
      vendorName: m.vendorName || '',
      purchaseDate: m.purchaseDate || '',
      receivedDate: m.receivedDate || '',
      unitCost: m.unitCost || 0,
    }));

    return { materials: formatted, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  static async createMaterial(payload: any) {
    const m = await Material.create(payload);
    return { id: m._id.toString(), name: m.name, price: m.price, category: m.category };
  }

  static async updateMaterial(id: string, payload: any) {
    const m = await Material.findByIdAndUpdate(id, payload, { new: true });
    if (!m) throw new AppError('Material not found.', 404);
    return { id: m._id.toString(), name: m.name, price: m.price, category: m.category };
  }

  static async deleteMaterial(id: string) {
    await Material.findByIdAndDelete(id);
    return true;
  }

  // Packages
  static async getPackages() {
    const packages = await Package.find().sort({ createdAt: -1 }).lean();
    return packages.map((p: any) => ({
      id: p._id.toString(),
      title: p.title,
      price: p.price,
      imageUrl: p.imageUrl || p.image || '',
      publicId: p.publicId || '',
      image: p.imageUrl || p.image || '',
      description: p.description || '',
      visibility: p.visibility,
      agents: p.agents || [],
      offices: p.offices || [],
      features: p.features || [],
    }));
  }

  static async createPackage(payload: any) {
    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    const data = { ...payload };
    delete data.image;
    if (hasImageUpdate) {
      data.imageUrl = imageUrl;
      data.publicId = publicId;
    }
    const p = await Package.create(data);
    return {
      id: p._id.toString(),
      title: p.title,
      price: p.price,
      imageUrl: p.imageUrl || '',
      publicId: p.publicId || '',
    };
  }

  static async updatePackage(id: string, payload: any) {
    const existing = await Package.findById(id);
    if (!existing) throw new AppError('Package not found.', 404);

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    const data = { ...payload };
    delete data.image;
    if (hasImageUpdate) {
      data.imageUrl = imageUrl;
      data.publicId = publicId;
      await cleanupReplacedAsset(existing.publicId, publicId);
    }

    const p = await Package.findByIdAndUpdate(id, data, { new: true });
    return {
      id: p!._id.toString(),
      title: p!.title,
      price: p!.price,
      imageUrl: p!.imageUrl || '',
      publicId: p!.publicId || '',
    };
  }

  static async deletePackage(id: string) {
    const existing = await Package.findById(id);
    if (existing?.publicId) {
      await CloudinaryService.deleteAsset(existing.publicId);
    }
    await Package.findByIdAndDelete(id);
    return true;
  }

  // Coupons
  static async getCoupons() {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    const now = new Date();
    return coupons.map((c: any) => {
      const rawDate = c.validUntil || (c as any).endDate;
      let expiryDate = '12/31/2026';
      let rawExpiry = '';
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const year = d.getFullYear();
          expiryDate = `${month}/${day}/${year}`;
          rawExpiry = `${year}-${month}-${day}`;
        }
      }

      // Determine active status: if expired by date and currently active, return expired
      let status = c.status || 'active';
      if (rawDate && new Date(rawDate) < now && status === 'active') {
        status = 'expired';
      }

      return {
        id: c._id.toString(),
        _id: c._id.toString(),
        code: c.code,
        discount: c.discountValue || 10,
        discountType: c.discountType || 'percentage',
        discountValue: c.discountValue || 10,
        expiryDate,
        rawExpiry,
        validUntil: rawDate ? new Date(rawDate).toISOString() : undefined,
        usageLimit: c.usageLimit || 100,
        usageCount: c.usageCount || 0,
        status,
        description: c.description || 'Promotional Discount Coupon',
      };
    });
  }

  static async createCoupon(payload: any) {
    const existing = await Coupon.findOne({ code: payload.code.toUpperCase() });
    if (existing) throw new AppError('Coupon code already exists.', 409);

    const validUntil = payload.validUntil
      ? new Date(payload.validUntil)
      : payload.expiryDate
      ? new Date(payload.expiryDate)
      : payload.endDate
      ? new Date(payload.endDate)
      : undefined;

    const discountValue = Number(payload.discountValue ?? payload.discount ?? 0);

    const c = await Coupon.create({
      code: payload.code.toUpperCase(),
      discountType: payload.discountType || 'percentage',
      discountValue,
      minOrderAmount: Number(payload.minOrderAmount || 0),
      validUntil,
      status: payload.status || 'active',
      usageLimit: Number(payload.usageLimit || 100),
      usageCount: Number(payload.usageCount || 0),
      description: payload.description || 'Promotional Discount Coupon',
    });
    return {
      id: c._id.toString(),
      code: c.code,
      discountValue: c.discountValue,
      status: c.status,
      validUntil: c.validUntil,
    };
  }

  static async updateCoupon(id: string, payload: any) {
    const updateData: any = {};
    if (payload.code) updateData.code = payload.code.toUpperCase();
    if (payload.discountType) updateData.discountType = payload.discountType;
    if (payload.discountValue !== undefined || payload.discount !== undefined) {
      updateData.discountValue = Number(payload.discountValue ?? payload.discount);
    }
    if (payload.minOrderAmount !== undefined) {
      updateData.minOrderAmount = Number(payload.minOrderAmount);
    }
    if (payload.validUntil !== undefined || payload.expiryDate !== undefined || payload.endDate !== undefined) {
      const dateStr = payload.validUntil ?? payload.expiryDate ?? payload.endDate;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          updateData.validUntil = d;
        }
      } else {
        updateData.validUntil = null;
      }
    }
    if (payload.status) {
      updateData.status = payload.status;
    }
    if (payload.usageLimit !== undefined) {
      updateData.usageLimit = Number(payload.usageLimit);
    }
    if (payload.description) {
      updateData.description = payload.description;
    }

    const c = await Coupon.findByIdAndUpdate(id, updateData, { new: true });
    if (!c) throw new AppError('Coupon not found.', 404);
    return {
      id: c._id.toString(),
      code: c.code,
      discountValue: c.discountValue,
      status: c.status,
      validUntil: c.validUntil,
    };
  }

  static async deleteCoupon(id: string) {
    await Coupon.findByIdAndDelete(id);
    return true;
  }

  // Service Items (Services, Sign Types, Sizes, Delivery Methods, Installer Charges, Trip Charges)
  static async getServiceItems(type: string) {
    const items = await ServiceItem.find({ type }).sort({ createdAt: -1 }).lean();
    return items.map((i: any) => ({
      id: i._id.toString(),
      name: i.name,
      category: i.category || '',
      price: i.price,
      description: i.description || '',
      vendorName: i.options?.vendorName || '',
      purchaseDate: i.options?.purchaseDate || '',
      receivedDate: i.options?.receivedDate || '',
      unitCost: i.options?.unitCost ?? 0,
      imageUrl: i.imageUrl || i.options?.imageUrl || i.options?.image || '',
      publicId: i.publicId || i.options?.publicId || '',
      image: i.imageUrl || i.options?.imageUrl || i.options?.image || '',
      options: i.options || {},
    }));
  }

  /**
   * Announcements that are live for a portal: active, inside their start/end window, and targeted at
   * "all" portals or the requested one. Newest first.
   */
  static async getActiveAnnouncements(portal: string) {
    const now = new Date();
    const items = await ServiceItem.find({ type: "announcement" }).sort({ createdAt: -1 }).lean();
    return items
      .filter((i: any) => {
        const o = i.options || {};
        if (o.active === false) return false;
        if (o.startsAt && new Date(o.startsAt) > now) return false;
        if (o.endsAt && new Date(new Date(o.endsAt).getTime() + 24 * 3600 * 1000) <= now) return false;
        const audience: string[] = Array.isArray(o.audience) && o.audience.length ? o.audience : ["all"];
        return audience.includes("all") || audience.includes(portal);
      })
      .slice(0, 5)
      .map((i: any) => ({
        id: i._id.toString(),
        title: i.name,
        message: i.description || "",
        imageUrl: i.imageUrl || i.options?.imageUrl || "",
        createdAt: i.createdAt,
      }));
  }

  static async createServiceItem(payload: any) {
    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    const data = { ...payload };
    if (data.options && typeof data.options === 'object') {
      data.options = { ...data.options };
      delete data.options.image;
      delete data.options.imageUrl;
      delete data.options.publicId;
    }
    delete data.image;
    if (hasImageUpdate) {
      data.imageUrl = imageUrl;
      data.publicId = publicId || payload?.options?.publicId || '';
    }
    const item = await ServiceItem.create(data);
    return {
      id: item._id.toString(),
      name: item.name,
      price: item.price,
      type: item.type,
      imageUrl: item.imageUrl || '',
      publicId: item.publicId || '',
    };
  }

  static async updateServiceItem(id: string, payload: any) {
    const existing = await ServiceItem.findById(id);
    if (!existing) throw new AppError('Item not found.', 404);

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    const data = { ...payload };
    if (data.options && typeof data.options === 'object') {
      data.options = { ...data.options };
      delete data.options.image;
      delete data.options.imageUrl;
      delete data.options.publicId;
    }
    delete data.image;
    if (hasImageUpdate) {
      const nextPublicId = publicId || payload?.options?.publicId || '';
      data.imageUrl = imageUrl;
      data.publicId = nextPublicId;
      await cleanupReplacedAsset(existing.publicId, nextPublicId);
    }

    const item = await ServiceItem.findByIdAndUpdate(id, data, { new: true });
    return {
      id: item!._id.toString(),
      name: item!.name,
      price: item!.price,
      type: item!.type,
      imageUrl: item!.imageUrl || '',
      publicId: item!.publicId || '',
    };
  }

  static async deleteServiceItem(id: string) {
    const existing = await ServiceItem.findById(id);
    if (existing?.publicId) {
      await CloudinaryService.deleteAsset(existing.publicId);
    }
    await ServiceItem.findByIdAndDelete(id);
    return true;
  }
}

