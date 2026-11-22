import { Inventory } from './inventory.model';
import { extractMentions, notifyMentions } from '../notification/mentions';

/**
 * @mentions in an inventory item's notes. Call before the update with the request body; after the update,
 * `notify` stores who is mentioned and notifies only people who were not already mentioned in the saved notes.
 */
export async function prepareNoteMentions(id: string, body: any) {
  const { notesMentions: rawIds, ...rest } = body || {};
  if (rest.notes === undefined) return { body: rest, notify: async () => {} };

  const before: any = await Inventory.findById(id).select('notesMentions').lean();
  const mentioned = await extractMentions(rest.notes, rawIds);
  const already = new Set<string>((before?.notesMentions || []).map(String));

  return {
    body: rest,
    notify: async (actor: any, item: any) => {
      await Inventory.updateOne({ _id: id }, { $set: { notesMentions: mentioned.map((m) => m.id) } });
      const fresh = mentioned.filter((m) => !already.has(m.id));
      if (!fresh.length) return;
      const label = item?.product || item?.name || 'an inventory item';
      await notifyMentions({
        text: String(rest.notes),
        resolved: fresh,
        author: { id: actor?._id ? String(actor._id) : undefined, name: actor?.name },
        context: `inventory item ${label}`,
        link: '/inventory',
        referenceId: item?.itemId || id,
      });
    },
  };
}
