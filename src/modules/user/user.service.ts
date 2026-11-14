import { User, USER_ROLES } from '../auth/user.model';
import { AppError } from '../../utils/apiError';
import { extractImageFields, cleanupReplacedAsset } from '../../utils/imageGuard';
import { CloudinaryService } from '../../utils/cloudinary.service';
import { NotificationService } from '../notification/notification.service';

export interface IGetUsersQuery {
  role?: string;
  searchQuery?: string;
  status?: string;
  parentAgentId?: string;
  page?: string | number;
  limit?: string | number;
}

export class UserService {
  static async getUsers(query: IGetUsersQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.role && query.role !== 'all') {
      const roles = String(query.role).split(',').map((r) => r.trim()).filter(Boolean);
      filter.role = roles.length > 1 ? { $in: roles } : roles[0];
    }

    if (query.parentAgentId) {
      filter.parentAgentId = query.parentAgentId;
    }

    if (query.status === 'pending_approval' || query.status === 'pending') {
      filter.status = { $in: ['pending_approval', 'pending', 'Pending'] };
    } else if (query.status && query.status !== 'all') {
      filter.status = query.status;
    } else if (query.status !== 'all') {
      // Regular user tabs (Agents, Assistants, Installers, etc.) must NEVER show pending applicants
      filter.status = { $nin: ['pending_approval', 'pending', 'Pending', 'rejected'] };
    }

    if (query.searchQuery && query.searchQuery.trim() !== '') {
      const term = query.searchQuery.trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { company: { $regex: term, $options: 'i' } },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const formattedUsers = users.map((u: any) => ({
      id: u._id.toString(),
      _id: u._id.toString(),
      name: u.name,
      fullName: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone || '',
      address: u.address || u.crm?.address || '',
      joinDate: u.joinDate || new Date(u.createdAt).toLocaleDateString(),
      imageUrl: u.imageUrl || u.image || '',
      publicId: u.publicId || '',
      image: u.imageUrl || u.image || '',
      company: u.company || 'Instapost',
      office: u.office || '',
      brokerage: u.brokerage || '',
      staffRole: u.staffRole || '',
      parentAgentId: u.parentAgentId || '',
      paymentMethodPreference: u.paymentMethodPreference || '',
      teamLeadApplication: u.teamLeadApplication || { status: 'none' },
      crm: u.crm || {},
      status: u.status,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      users: formattedUsers,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  static async createUser(payload: {
    name?: string;
    fullName?: string;
    email: string;
    password?: string;
    role?: any;
    phone?: string;
    address?: string;
    company?: string;
    office?: string;
    brokerage?: string;
    staffRole?: string;
    parentAgentId?: string;
    paymentMethodPreference?: 'credit_card' | 'invoice_later' | '';
  }) {
    const resolvedName = String(payload.name || payload.fullName || '').trim();
    if (!resolvedName) {
      throw new AppError('Path `name` is required.', 400);
    }
    const resolvedEmail = String(payload.email || '').trim().toLowerCase();
    if (!resolvedEmail) {
      throw new AppError('Path `email` is required.', 400);
    }

    const existing = await User.findOne({ email: resolvedEmail });
    if (existing) {
      throw new AppError('A user with this email already exists.', 409);
    }

    const rawRole = String(payload.role || 'Agent').trim().toLowerCase();
    const canonicalRole = USER_ROLES.find((r) => r.toLowerCase() === rawRole) || 'Agent';

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    const tempPassword = payload.password || 'Insta@123456';
    const user = await User.create({
      name: resolvedName,
      email: resolvedEmail,
      password: tempPassword,
      role: canonicalRole,
      phone: payload.phone || '',
      address: payload.address || '',
      company: payload.company || 'Instapost',
      office: payload.office || '',
      brokerage: payload.brokerage || '',
      staffRole: payload.staffRole || '',
      parentAgentId: payload.parentAgentId || '',
      paymentMethodPreference: payload.paymentMethodPreference || '',
      imageUrl: hasImageUpdate ? imageUrl : '',
      publicId: hasImageUpdate ? publicId : '',
      status: 'active',
    });

    return {
      id: user._id.toString(),
      name: user.name,
      fullName: user.name,
      email: user.email,
      role: user.role,
      address: user.address || '',
      company: user.company,
      imageUrl: user.imageUrl || '',
      publicId: user.publicId || '',
    };
  }

  static async updateUser(id: string, payload: any) {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found.', 404);

    if (payload.name || payload.fullName) user.name = String(payload.name || payload.fullName).trim();
    if (payload.phone !== undefined) user.phone = payload.phone;
    if (payload.address !== undefined) user.address = payload.address;
    if (payload.role) user.role = payload.role;
    if (payload.company) user.company = payload.company;
    if (payload.status) user.status = payload.status;
    if (payload.office !== undefined) user.office = payload.office;
    if (payload.brokerage !== undefined) user.brokerage = payload.brokerage;
    if (payload.staffRole !== undefined) user.staffRole = payload.staffRole;
    if (payload.parentAgentId !== undefined) user.parentAgentId = payload.parentAgentId;
    if (payload.paymentMethodPreference !== undefined) {
      user.paymentMethodPreference = payload.paymentMethodPreference;
    }
    if (payload.crm && typeof payload.crm === 'object') {
      user.crm = { ...(user.crm || {}), ...payload.crm };
    }
    if (payload.teamLeadApplication && typeof payload.teamLeadApplication === 'object') {
      user.teamLeadApplication = { ...(user.teamLeadApplication || {}), ...payload.teamLeadApplication };
    }

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    if (hasImageUpdate) {
      const oldPublicId = user.publicId;
      user.imageUrl = imageUrl;
      user.publicId = publicId;
      await cleanupReplacedAsset(oldPublicId, publicId);
    }

    await user.save();

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      imageUrl: user.imageUrl || '',
      publicId: user.publicId || '',
    };
  }

  static async deleteUser(id: string) {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found.', 404);
    if (user.publicId) {
      await CloudinaryService.deleteAsset(user.publicId);
    }
    await User.findByIdAndDelete(id);
    return { success: true };
  }

  static async approveUser(
    id: string,
    payload: { approved: boolean; paymentMethodPreference?: 'credit_card' | 'invoice_later'; reason?: string }
  ) {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found.', 404);

    user.status = payload.approved ? 'active' : 'rejected';
    if (payload.approved && payload.paymentMethodPreference) {
      user.paymentMethodPreference = payload.paymentMethodPreference;
    }
    await user.save();

    await NotificationService.createNotification({
      recipientUserId: user._id.toString(),
      recipientEmail: user.email,
      recipientRole: user.role,
      title: payload.approved ? 'Account Approved' : 'Registration Rejected',
      message: payload.approved
        ? `Your registration has been approved${payload.paymentMethodPreference ? ` (${payload.paymentMethodPreference.replace('_', ' ')})` : ''}.`
        : payload.reason || 'Your registration request was declined.',
      type: 'approval',
      referenceId: user._id.toString(),
    });

    return {
      id: user._id.toString(),
      status: user.status,
      paymentMethodPreference: user.paymentMethodPreference || '',
    };
  }

  static async requestTeamLead(id: string, payload: any) {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found.', 404);

    user.teamLeadApplication = {
      status: 'pending',
      companyOffice: payload.companyOffice || '',
      title: payload.title || '',
      streetAddress: payload.streetAddress || '',
      city: payload.city || '',
      state: payload.state || '',
      zipCode: payload.zipCode || '',
      submittedAt: new Date().toISOString(),
    };
    await user.save();

    await NotificationService.createNotification({
      recipientRole: 'Sign company',
      title: 'Team Lead Application',
      message: `${user.name} applied to become a Team Leader (${payload.companyOffice || user.company || 'Office'}).`,
      type: 'team_lead',
      referenceId: user._id.toString(),
      createdBy: user.name,
    });

    return user.teamLeadApplication;
  }

  static async addCrmNote(id: string, payload: { text: string; author?: string }) {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found.', 404);
    const text = String(payload.text || '').trim();
    if (!text) throw new AppError('Note text is required.', 400);

    const existingCrm = user.crm || {};
    const notes = Array.isArray(existingCrm.notes) ? [...existingCrm.notes] : [];
    const entry = {
      id: `note-${Date.now()}`,
      text,
      author: payload.author || 'Sign Company',
      createdAt: new Date().toISOString(),
    };
    notes.unshift(entry);
    user.crm = { ...existingCrm, notes };
    await user.save();

    await NotificationService.notifyMentions(text, entry.author, user._id.toString());
    return entry;
  }
}

