import { AppError } from '../../utils/apiError';
import { isStaff } from '../../middlewares/roleGuard.middleware';

type Actor = { _id?: any; id?: string; role?: string } | undefined;

const actorId = (actor: Actor) => String(actor?._id ?? actor?.id ?? '');
const norm = (role?: string) => String(role || '').trim().toLowerCase();

/** Roles each non-staff role may manage (create / edit / delete) in the portals. */
const MANAGEABLE_BY: Record<string, string[]> = {
  'Team Lead': ['Agent', 'Assistant'],
  'Warehouse manager': ['Assistant'],
  Agent: ['Assistant'],
};

/** Roles that may list users at all (Agents only ever see their own assistants). */
const CAN_LIST = ['Team Lead', 'Warehouse manager', 'Agent'];

export function assertCanList(actor: Actor, query: { parentAgentId?: string; role?: string }) {
  if (!actor) throw new AppError('Authentication required.', 401);
  if (isStaff(actor)) return;
  const actorRoleNorm = norm(actor.role);
  const canListNorm = CAN_LIST.map(norm);
  if (!canListNorm.includes(actorRoleNorm)) throw new AppError('You do not have access to the user directory.', 403);
  // An agent can only see the assistants that belong to them.
  if (actorRoleNorm === 'agent') {
    query.parentAgentId = actorId(actor);
    query.role = 'Assistant';
  }
}

/** Throws unless the actor may create/edit/delete a user of `targetRole` (owned by `targetParentId`). */
export function assertCanManage(actor: Actor, targetRole: string, targetParentId?: string, action = 'manage') {
  if (!actor) throw new AppError('Authentication required.', 401);
  if (isStaff(actor)) {
    // Only an Admin may create or change Admin accounts.
    if (norm(targetRole) === 'admin' && norm(actor.role) !== 'admin') throw new AppError('Only an Admin can manage Admin accounts.', 403);
    return;
  }
  const actorRoleKey = Object.keys(MANAGEABLE_BY).find((k) => norm(k) === norm(actor.role));
  const allowed = (actorRoleKey ? MANAGEABLE_BY[actorRoleKey] : []).map(norm);
  if (!allowed.includes(norm(targetRole))) throw new AppError(`Your role cannot ${action} ${targetRole} accounts.`, 403);
  if (norm(actor.role) === 'agent' && String(targetParentId || '') !== actorId(actor)) {
    throw new AppError('You can only manage your own assistants.', 403);
  }
}

export const isSelf = (actor: Actor, id: string) => actorId(actor) === String(id);
