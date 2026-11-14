import { Warehouse } from './warehouse.model';
import { AppError } from '../../utils/apiError';

const formatWarehouse = (w: any) => ({
  id: w._id.toString(),
  name: w.name,
  location: w.location,
  assignedStaff: w.assignedStaff || [],
});

/**
 * Handles warehouse CRUD queries, filtering, and persistence.
 */
export class WarehouseService {
  static async getWarehouses(query: any = {}) {
    const rawSearch = typeof query.search === 'string'
      ? query.search
      : typeof query.searchTerm === 'string'
        ? query.searchTerm
        : '';
    const search = rawSearch.trim();
    const filter: Record<string, any> = {};
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: searchRegex }, { location: searchRegex }];
    }

    const hasPagination = query.page !== undefined || query.limit !== undefined;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    const dbQuery = Warehouse.find(filter).sort({ createdAt: -1 });
    if (hasPagination) {
      dbQuery.skip(skip).limit(limit);
    }

    const [total, warehouses] = await Promise.all([
      Warehouse.countDocuments(filter),
      dbQuery.lean(),
    ]);

    return {
      warehouses: warehouses.map(formatWarehouse),
      meta: {
        page: hasPagination ? page : 1,
        limit: hasPagination ? limit : total || 10,
        total,
        totalPages: hasPagination ? Math.ceil(total / limit) || 1 : 1,
      },
    };
  }

  static async createWarehouse(payload: { name: string; location: string; assignedStaff?: any[] }) {
    const warehouse = await Warehouse.create(payload);
    return formatWarehouse(warehouse);
  }

  static async updateWarehouse(id: string, payload: any = {}) {
    const updateData: Record<string, any> = {};
    if (payload.name !== undefined) {
      const name = String(payload.name).trim();
      if (!name) throw new AppError('Warehouse name is required.', 400);
      updateData.name = name;
    }
    if (payload.location !== undefined) {
      const location = String(payload.location).trim();
      if (!location) throw new AppError('Warehouse location is required.', 400);
      updateData.location = location;
    }
    if (Array.isArray(payload.assignedStaff)) {
      updateData.assignedStaff = payload.assignedStaff;
    }

    const warehouse = await Warehouse.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!warehouse) throw new AppError('Warehouse not found.', 404);
    return formatWarehouse(warehouse);
  }

  static async deleteWarehouse(id: string) {
    await Warehouse.findByIdAndDelete(id);
    return true;
  }
}

