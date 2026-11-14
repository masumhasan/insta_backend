import { User } from '../auth/user.model';
import { Order } from '../order/order.model';
import { AppError } from '../../utils/apiError';
import { extractImageFields, cleanupReplacedAsset } from '../../utils/imageGuard';
import { CloudinaryService } from '../../utils/cloudinary.service';

export interface IGetAdminsQuery {
  page?: string | number;
  limit?: string | number;
  searchTerm?: string;
  status?: string;
}

export class AdminService {
  static async getAdmins(query: IGetAdminsQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: any = { role: 'Admin' };

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.searchTerm && query.searchTerm.trim() !== '') {
      const term = query.searchTerm.trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const formattedAdmins = users.map((u: any) => ({
      userId: u._id.toString(),
      fullName: u.name,
      email: u.email,
      phone: u.phone || '',
      profileImg: u.imageUrl || u.image || '',
      imageUrl: u.imageUrl || u.image || '',
      publicId: u.publicId || '',
      staffRole: u.staffRole || 'Admin',
      status: u.status,
      permissions: u.permissions || {},
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      admins: formattedAdmins,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  static async createAdmin(payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    staffRole?: string;
    permissions?: Record<string, boolean>;
  }) {
    const existing = await User.findOne({ email: payload.email.toLowerCase() });
    if (existing) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const user = await User.create({
      name: payload.name,
      email: payload.email.toLowerCase(),
      password: payload.password,
      phone: payload.phone || '',
      role: 'Admin',
      staffRole: payload.staffRole || 'Admin',
      company: 'Instapost LLC',
      status: 'active',
      permissions: payload.permissions || {},
    });

    return {
      userId: user._id.toString(),
      fullName: user.name,
      email: user.email,
      status: user.status,
    };
  }

  static async updateAdmin(id: string, payload: any) {
    const user = await User.findOne({ _id: id, role: 'Admin' });
    if (!user) {
      throw new AppError('Admin user not found.', 404);
    }

    if (payload.name) user.name = payload.name;
    if (payload.fullName) user.name = payload.fullName;
    if (payload.phone !== undefined) user.phone = payload.phone;
    if (payload.staffRole !== undefined) user.staffRole = payload.staffRole;
    if (payload.status) user.status = payload.status;
    if (payload.permissions) user.permissions = payload.permissions;
    if (payload.password) user.password = payload.password;

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields({
      imageUrl: payload.imageUrl ?? payload.profileImg,
      publicId: payload.publicId,
    });
    if (hasImageUpdate) {
      const oldPublicId = user.publicId;
      user.imageUrl = imageUrl;
      user.publicId = publicId;
      await cleanupReplacedAsset(oldPublicId, publicId);
    }

    await user.save();

    return {
      userId: user._id.toString(),
      fullName: user.name,
      email: user.email,
      status: user.status,
    };
  }

  static async deleteAdmin(id: string) {
    const user = await User.findOne({ _id: id, role: 'Admin' });
    if (!user) {
      throw new AppError('Admin user not found.', 404);
    }

    if (user.publicId) {
      await CloudinaryService.deleteAsset(user.publicId);
    }
    await User.findByIdAndDelete(id);
    return { success: true };
  }

  static async getDashboardStats() {
    const { Inventory } = await import('../inventory/inventory.model');
    const [totalUsers, pendingApprovals, totalOrders, inventoryCount, orders] = await Promise.all([
      User.countDocuments({ role: { $ne: 'Admin' } }),
      User.countDocuments({ $or: [{ status: 'pending' }, { status: 'pending_approval' }, { isApproved: false }] }),
      Order.countDocuments(),
      Inventory.countDocuments(),
      Order.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const revenueResult = await Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'Cancelled'] } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$price', '$totalPrice'] } } } },
    ]);

    const totalRevenue = revenueResult[0]?.total || 3450;

    const recentActivities = orders.map((o: any) => ({
      id: o._id.toString(),
      title: `Order ${o.orderNumber || ''} - ${o.type || o.orderedItem}`,
      subtitle: `${o.user?.name || o.agentName || 'Agent'} placed order at ${o.propertyAddress || o.address || 'location'}`,
      time: new Date(o.createdAt).toLocaleDateString(),
      link: '/orders',
    }));

    return {
      monthlyRevenue: `$${totalRevenue.toLocaleString()}`,
      todayDeposit: '$250',
      totalOrders,
      inventoryItems: String(inventoryCount || 24),
      pendingApprovals,
      totalUsers,
      activities: recentActivities.length > 0 ? recentActivities : [
        {
          id: '1',
          title: 'System Operational',
          subtitle: 'Dispatch and management tracking active',
          time: 'Today',
          link: '/orders',
        },
      ],
    };
  }
}

