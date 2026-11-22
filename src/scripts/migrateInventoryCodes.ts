// One-off migration to short inventory codes (client request #16).
//
//   npx ts-node src/scripts/migrateInventoryCodes.ts --dry-run   (prints what would change, writes nothing)
//   npx ts-node src/scripts/migrateInventoryCodes.ts             (applies the changes to the database in backend/.env)
//
// For every inventory item:
//   - an item code that is missing or not short (PST-0042 style) gets a new one from the atomic counter;
//   - generated barcodes (BAR-123456, <itemId>-MAIN, the old item code) become legacy codes and the item code is printed;
//     any other stored barcode is treated as the sign company's own number and kept as `customBarcode`;
//   - units are renumbered <itemId>-NN keeping their number (PST-0042-001 -> PST-0042-01, SC-0001-U1 -> SC-0001-01);
//     the old unit code and old generated barcode stay scannable through `legacyCodes`.
// Safe to run again: items already in the new format are left alone.
import mongoose from 'mongoose';
import { config } from '../config/env';
import { Inventory } from '../modules/inventory/inventory.model';
import { Counter } from '../modules/inventory/counter.model';
import { SHORT_ITEM_ID_RE, formatItemCode, formatUnitCode, prefixFor, unitNumberOf } from '../modules/inventory/inventory.codes';

const DRY = process.argv.includes('--dry-run');
const lc = (v?: string) => String(v || '').toLowerCase();
const addLegacy = (list: string[], code: string | undefined, current: string) => {
  if (code && lc(code) !== lc(current) && !list.some((c) => lc(c) === lc(code))) list.push(code);
};

/** Counter values read once; in a dry run they are only advanced in memory. */
const seqs: Record<string, number> = {};
async function nextCode(itemType: string | undefined, taken: Set<string>) {
  const prefix = prefixFor(itemType);
  for (;;) {
    let seq: number;
    if (DRY) {
      if (seqs[prefix] === undefined) seqs[prefix] = ((await Counter.findById(`inventory:${prefix}`).lean()) as any)?.seq || 0;
      seq = ++seqs[prefix];
    } else {
      const doc: any = await Counter.findOneAndUpdate({ _id: `inventory:${prefix}` }, { $inc: { seq: 1 } }, { new: true, upsert: true }).lean();
      seq = doc.seq;
    }
    const code = formatItemCode(prefix, seq);
    if (!taken.has(lc(code))) return code;
  }
}

const looksGenerated = (code: string, ids: string[]) =>
  /^BAR-/i.test(code) || ids.some((id) => id && (lc(code) === lc(id) || lc(code).startsWith(lc(id) + '-')));

async function run() {
  await mongoose.connect(config.mongodbUri);
  console.log(`Inventory code migration${DRY ? ' (dry run: nothing is written)' : ''}`);
  const items: any[] = await Inventory.find({}).sort({ createdAt: 1 }).lean();
  const taken = new Set<string>();
  for (const it of items) {
    [it.itemId, ...(it.legacyCodes || [])].filter(Boolean).forEach((c: string) => taken.add(lc(c)));
  }

  let changed = 0;
  for (const it of items) {
    const oldId = String(it.itemId || '');
    const itemId = SHORT_ITEM_ID_RE.test(oldId) ? oldId : await nextCode(it.itemType, taken);
    taken.add(lc(itemId));
    const legacy: string[] = [...(it.legacyCodes || [])];
    addLegacy(legacy, oldId, itemId);

    let customBarcode = String(it.customBarcode || '');
    const stored = String(it.barcode || '');
    if (!customBarcode && stored && !looksGenerated(stored, [oldId, itemId])) customBarcode = stored;
    if (stored !== customBarcode) addLegacy(legacy, stored, itemId);
    const barcode = customBarcode || itemId;

    const used = new Set<number>();
    const units = (it.units || []).map((u: any) => ({ ...u }));
    let highest = units.reduce((m: number, u: any) => Math.max(m, unitNumberOf(u.unitId)), 0);
    const nextUnits = units.map((u: any) => {
      let n = unitNumberOf(u.unitId) || unitNumberOf(u.barcode);
      if (!n || used.has(n)) n = ++highest;
      used.add(n);
      const unitId = formatUnitCode(itemId, n);
      const uLegacy: string[] = [...(u.legacyCodes || [])];
      addLegacy(uLegacy, u.unitId, unitId);
      let uCustom = String(u.customBarcode || '');
      const uStored = String(u.barcode || '');
      if (!uCustom && uStored && !looksGenerated(uStored, [oldId, itemId, u.unitId])) uCustom = uStored;
      if (uStored !== uCustom) addLegacy(uLegacy, uStored, unitId);
      return { ...u, unitId, barcode: uCustom || unitId, customBarcode: uCustom, legacyCodes: uLegacy };
    });

    const unitsChanged = JSON.stringify(nextUnits) !== JSON.stringify(units);
    const itemChanged =
      itemId !== oldId || barcode !== stored || customBarcode !== String(it.customBarcode || '') ||
      JSON.stringify(legacy) !== JSON.stringify(it.legacyCodes || []);
    if (!itemChanged && !unitsChanged) continue;

    changed++;
    const unitNote = unitsChanged && nextUnits.length
      ? ` | units: ${units[0]?.barcode || units[0]?.unitId} -> ${nextUnits[0].barcode}${nextUnits.length > 1 ? ` … (${nextUnits.length})` : ''}`
      : '';
    console.log(`${it.product}: ${oldId || '(none)'} / ${stored || '(none)'} -> ${itemId} / ${barcode}${customBarcode ? ' (custom)' : ''}${unitNote}`);
    if (!DRY) {
      await Inventory.updateOne({ _id: it._id }, { $set: { itemId, barcode, customBarcode, legacyCodes: legacy, units: nextUnits } });
    }
  }
  console.log(`${changed} of ${items.length} item(s) ${DRY ? 'would change' : 'updated'}.`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
