import { User } from '../auth/user.model';
import { ServiceItem } from '../catalog/service.model';
import { AppError } from '../../utils/apiError';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Profile fields only staff may change on someone else's account (the caller has already passed
 * assertCanManage): the login email and the linked brokerage (a "brokerage" catalog item, Settings > Brokerage).
 */
export async function applyStaffProfileFields(user: any, payload: any) {
  if (String(payload.email ?? '').trim()) {
    const email = String(payload.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Enter a valid email address.', 400);
    if (email !== user.email) {
      if (await User.exists({ email, _id: { $ne: user._id } })) throw new AppError('A user with this email already exists.', 409);
      user.email = email;
    }
  }

  if (payload.brokerageId !== undefined) {
    const id = String(payload.brokerageId || '').trim();
    if (!id) {
      user.brokerageId = '';
      user.brokerage = '';
      return;
    }
    const item: any = OBJECT_ID.test(id) ? await ServiceItem.findOne({ _id: id, type: 'brokerage' }).select('name').lean() : null;
    if (!item) throw new AppError('Brokerage not found.', 400);
    user.brokerageId = id;
    user.brokerage = item.name;
  }
}
