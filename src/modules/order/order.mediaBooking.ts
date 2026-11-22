import { resolveMediaSelection } from '../catalog/catalog.media';
import { assertMediaSlotFree } from '../ops/ops.availability';
import { AppError } from '../../utils/apiError';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A Media Services order from the order form carries `specifications.media` (`packageId`, `serviceIds`,
 * `extraServiceIds`, `addOnIds`) and the chosen `appointmentDate` / `appointmentSlot`.
 * The selection is priced and timed from the catalog, and the time is checked again against live availability
 * so two orders cannot take the same appointment. Returns the server subtotal (used for non-staff orders).
 */
export async function prepareMediaOrder(payload: any, currentUser: any): Promise<number> {
  const specs = payload.specifications || {};
  const media = await resolveMediaSelection(specs.media, currentUser);
  const date = String(specs.appointmentDate || '').trim();
  if (!ISO_DATE.test(date)) throw new AppError('Choose an appointment date for the media shoot.', 400);
  const slot = await assertMediaSlotFree(date, String(specs.appointmentSlot || ''), media.durationMinutes);

  payload.appointmentTime = `${date} ${slot}`;
  payload.onsiteDuration = media.durationMinutes;
  payload.specifications = {
    ...specs,
    appointmentDate: date,
    appointmentSlot: slot,
    onsiteDuration: media.durationMinutes,
    media: {
      packageId: media.packageId,
      serviceIds: media.serviceIds,
      extraServiceIds: media.extraServiceIds,
      addOnIds: media.addOnIds,
      lines: media.lines,
      durationMinutes: media.durationMinutes,
    },
  };
  return media.subtotal;
}
