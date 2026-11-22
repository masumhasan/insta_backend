import { User, USER_ROLES } from '../auth/user.model';
import { AppError } from '../../utils/apiError';
import { extractImageFields, cleanupReplacedAsset } from '../../utils/imageGuard';
import { CloudinaryService } from '../../utils/cloudinary.service';
import { NotificationService } from '../notification/notification.service';
import { randomBytes } from 'crypto';
import { assertCanList, assertCanManage, isSelf } from './user.policy';
import { isStaff } from '../../middlewares/roleGuard.middleware';

export interface IGetUsersQuery {
  role?: string;
  searchQuery?: string;
  status?: string;
  parentAgentId?: string;
  page?: string | number;
  limit?: string | number;
}

export class UserService {
  static async getUsers(rawQuery: IGetUsersQuery, actor?: any) {
    const query = { ...rawQuery };
    assertCanList(actor, query);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.role && query.role !== 'all') {
      const roles = String(query.role).split(',').map((r) => r.trim()).filter(Boolean);
      filter.role = {
        $in: roles.map((r) => new RegExp(`^${r}$`, 'i')),
      };
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

    const searchTerm = String(query.searchQuery ?? '').trim();
    if (searchTerm) {
      // Escaped so typed "(" or "+" match literally; the "Order for Agent or Office" picker searches here.
      const rx = { $regex: searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      filter.$or = ['name', 'email', 'phone', 'company', 'office', 'brokerage', 'crm.brokerage'].map((f) => ({ [f]: rx }));
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
      brokerage: u.brokerage || u.crm?.brokerage || '',
      howDidYouHear: u.howDidYouHear || '',
      staffRole: u.staffRole || '',
      parentAgentId: u.parentAgentId || '',
      paymentMethodPreference: u.paymentMethodPreference || '',
      teamLeadApplication: u.teamLeadApplication || { status: 'none' },
      crm: u.crm || {},
      lastContactDate: u.lastContactDate || u.crm?.lastContactDate || '',
      nextContactDate: u.nextContactDate || u.crm?.nextContactDate || '',
      contactNote: u.contactNote || u.crm?.contactNote || (u.activityNotes?.[0]?.text) || (u.crm?.notes?.[0]?.text) || '',
      activityNotes: (u.activityNotes && u.activityNotes.length > 0)
        ? u.activityNotes
        : (u.crm?.notes && u.crm.notes.length > 0)
          ? u.crm.notes.map((n: any) => ({
              id: n.id || String(n._id || Date.now()),
              text: n.text || n.note || '',
              date: n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently'),
              author: n.author || 'Current User',
              initials: n.initials || 'CU',
            }))
          : [],
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
  }, actor?: any) {
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
    // Agents can only create their own assistants; everything else follows the policy table.
    const parentAgentId = actor?.role === 'Agent' ? String(actor._id) : payload.parentAgentId || '';
    assertCanManage(actor, canonicalRole, parentAgentId, 'create');

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    if (payload.password && payload.password.length < 8) throw new AppError('Password must be at least 8 characters long.', 400);
    const generated = payload.password ? '' : randomBytes(9).toString('base64url');
    const tempPassword = payload.password || generated;
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
      parentAgentId,
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
      // Shown once so the creator can hand it over (email delivery is deferred).
      ...(generated ? { temporaryPassword: generated } : {}),
    };
  }

  static async updateUser(id: string, rawPayload: any, actor?: any) {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found.', 404);
    const payload = { ...rawPayload };
    const self = isSelf(actor, id);
    if (!self || isStaff(actor)) assertCanManage(actor, user.role, user.parentAgentId, 'edit');
    if (!isStaff(actor)) {
      // Managers and the user themselves cannot change identity, ownership or CRM/approval fields.
      for (const k of ['role', 'parentAgentId', 'company', 'staffRole', 'teamLeadApplication', 'crm', 'paymentMethodPreference']) delete payload[k];
      if (self || !['active', 'blocked'].includes(payload.status)) delete payload.status;
    }
    if (payload.role) {
      const nextRole = USER_ROLES.find((r) => r === payload.role);
      if (!nextRole) throw new AppError('Unknown role.', 400);
      assertCanManage(actor, nextRole, user.parentAgentId, 'assign');
    }

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
    if (payload.lastContactDate !== undefined) {
      user.lastContactDate = payload.lastContactDate;
      if (!user.crm) user.crm = {};
      user.crm.lastContactDate = payload.lastContactDate;
    }
    if (payload.nextContactDate !== undefined) {
      user.nextContactDate = payload.nextContactDate;
      if (!user.crm) user.crm = {};
      user.crm.nextContactDate = payload.nextContactDate;
    }
    if (payload.contactNote !== undefined) {
      user.contactNote = payload.contactNote;
      if (!user.crm) user.crm = {};
      user.crm.contactNote = payload.contactNote;
    }
    if (payload.activityNotes !== undefined) {
      user.activityNotes = payload.activityNotes;
      if (!user.crm) user.crm = {};
      user.crm.activityNotes = payload.activityNotes;
    }
    if (payload.notes !== undefined) {
      user.activityNotes = payload.notes;
      if (!user.crm) user.crm = {};
      user.crm.activityNotes = payload.notes;
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
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      brokerage: user.brokerage || '',
      lastContactDate: user.lastContactDate || '',
      nextContactDate: user.nextContactDate || '',
      contactNote: user.contactNote || '',
      activityNotes: user.activityNotes || [],
      status: user.status,
      imageUrl: user.imageUrl || '',
      publicId: user.publicId || '',
    };
  }

  static async deleteUser(id: string, actor?: any) {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found.', 404);
    if (isSelf(actor, id)) throw new AppError('You cannot delete your own account.', 400);
    assertCanManage(actor, user.role, user.parentAgentId, 'delete');
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

  static async addCrmNote(id: string, payload: { text: string; author?: string; initials?: string }, actor?: any) {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found.', 404);
    const text = String(payload.text || '').trim();
    if (!text) throw new AppError('Note text is required.', 400);

    const now = new Date();
    const formattedDate = `${now.toLocaleString('default', { month: 'short' })} ${now.getDate()}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const author = actor?.name || payload.author || 'Current User';
    const initials = payload.initials || author.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'CU';

    const entry = {
      id: `note-${Date.now()}`,
      text,
      author,
      initials,
      date: formattedDate,
      createdAt: now.toISOString(),
    };

    if (!user.activityNotes) user.activityNotes = [];
    user.activityNotes.unshift(entry as any);

    const existingCrm = user.crm || {};
    const notes = Array.isArray(existingCrm.notes) ? [...existingCrm.notes] : [];
    notes.unshift(entry);
    user.crm = { ...existingCrm, notes };
    user.contactNote = text;

    const todayDateStr = now.toLocaleDateString('en-US');
    if (!user.lastContactDate) {
      user.lastContactDate = todayDateStr;
      user.crm.lastContactDate = todayDateStr;
    }

    await user.save();

    await NotificationService.notifyMentions(text, entry.author, user._id.toString());
    return entry;
  }
}

