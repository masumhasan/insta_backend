import { Inventory } from './inventory.model';
import { User } from '../auth/user.model';
import { AppError } from '../../utils/apiError';
import { extractImageFields, cleanupReplacedAsset } from '../../utils/imageGuard';
import { CloudinaryService } from '../../utils/cloudinary.service';
import { applyPostFields, postTypeClause, postTypesOf } from './inventory.postTypes';
import { cleanRiderMount } from './inventory.riderMount';
import { buildInventoryLabelPdf, buildInventoryQrSvg, generateQrDataUrl, generateQrPngBuffer } from './inventory.qr';
import {
  UNIT_STATUSES, assertCodesFree, buildUnits, cleanCustomBarcode, codeLookupFilter, generateItemId, unitNumberOf,
} from './inventory.codes';
import { defaultStatusOf, displayStatusOf, stockLevelOf } from './inventory.stock';

export { UNIT_STATUSES };

const META_FIELDS = [
  'serialNo', 'shelveNo', 'unitPrice', 'rentalPrice', 'removalPrice', 'installPrice', 'shipment', 'replacementCost',
  'enableReplacementBilling', 'hardwareCosts', 'color', 'material',
  'postHeight', 'mountType', 'lockboxType', 'comboCode', 'shackleCode',
  'riderHeading', 'grommetPlacement', 'additionalSpecs', 'notes',
  'allowCustomization', 'lastUpdated', 'status', 'assignedAgent', 'assignedAgentId',
] as const;

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/** The code printed on the item label: the custom barcode, else the short item code, else a legacy barcode. */
const resolveBarcode = (item: any, fallbackIndex = 0) =>
  String(item.customBarcode || item.itemId || item.barcode || `BAR-${String(item._id || fallbackIndex).slice(-6).toUpperCase()}`);

/** Older codes that still scan: stored legacy codes plus a pre-migration barcode that is no longer printed. */
const legacyCodesOf = (item: any, current: string) =>
  Array.from(new Set([...(item.legacyCodes || []), item.barcode].filter((c) => c && c !== current)));

const formatUnit = (u: any) => {
  const barcode = u.customBarcode || u.barcode || u.unitId;
  return { ...u, barcode, customBarcode: u.customBarcode || '', legacyCodes: legacyCodesOf(u, barcode).filter((c) => c !== u.unitId) };
};

/** The sign company's own barcode numbers for new units: cleaned and refused when already on any item or unit. */
const cleanOwnBarcodes = async (raw: unknown[]): Promise<string[]> => {
  const codes = raw.map(cleanCustomBarcode).filter(Boolean);
  if (codes.length > 500) throw new AppError('Add at most 500 barcodes at a time.', 400);
  await assertCodesFree(codes);
  return codes;
};

/** Existing items created before short IDs existed get one on first read. */
const OFFICE_ROLES = ['Team Lead', 'Office Manager'];
const SIGN_COMPANY_NAME = /^(instapost|sign\s*company)/i;
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const backfillItemIds = async () => {
  const missing = await Inventory.find({
    $or: [{ itemId: { $exists: false } }, { itemId: "" }, { ownerType: { $exists: false } }, { ownerLinkChecked: { $ne: true } }],
  })
    .sort({ createdAt: 1 })
    .limit(500);
  for (const doc of missing) {
    if (!doc.itemId) doc.itemId = await generateItemId(doc.itemType);
    if (!doc.ownerId) {
      // Legacy items: link the stored owner to a real profile (by id, else by exact name) so visibility can be scoped.
      let owner: any = null;
      if (doc.assignedAgentId) {
        owner = await User.findById(String(doc.assignedAgentId)).select("name role").lean();
      } else if (doc.owner && !SIGN_COMPANY_NAME.test(doc.owner)) {
        owner = await User.findOne({
          name: new RegExp("^" + escapeRe(String(doc.owner).trim()) + "$", "i"),
          role: { $in: ["Agent", "Team Lead", "Office Manager"] },
          status: "active",
        })
          .select("name role")
          .lean();
      }
      if (owner) {
        doc.ownerId = String(owner._id);
        doc.ownerType = OFFICE_ROLES.includes(owner.role) ? "Office" : "Agent";
        doc.owner = owner.name;
        doc.assignedAgent = owner.name;
      }
    }
    doc.ownerLinkChecked = true;
    await doc.save();
  }
};

// ---- Ownership ------------------------------------------------------------------------------------
const OWNER_TYPES = ['Agent', 'Office', 'Sign company'] as const;

/** Resolves and validates the Inventory Owner so items are linked to a real profile. */
const resolveOwner = async (payload: any, fallback?: { ownerType?: string; ownerId?: string; owner?: string }) => {
  const rawType = payload.ownerType ?? payload.assignToType ?? fallback?.ownerType;
  const ownerType = OWNER_TYPES.find((t) => t.toLowerCase() === String(rawType || '').toLowerCase()) || 'Sign company';
  if (ownerType === 'Sign company') {
    return { ownerType, ownerId: '', ownerName: String(payload.ownerName || payload.assignedAgent || payload.owner || fallback?.owner || 'Instapost LLC').trim() };
  }
  const ownerId = String(payload.ownerId ?? payload.assignedAgentId ?? fallback?.ownerId ?? '').trim();
  if (!/^[0-9a-fA-F]{24}$/.test(ownerId)) throw new AppError(`Select the ${ownerType.toLowerCase()} that owns this item.`, 400);
  const user = await User.findById(ownerId).select('name role status').lean();
  if (!user) throw new AppError('The selected owner no longer exists.', 404);
  const roleOk = ownerType === 'Agent' ? user.role === 'Agent' : OFFICE_ROLES.includes(user.role);
  if (!roleOk) throw new AppError(`The selected owner is not an ${ownerType.toLowerCase()}.`, 400);
  return { ownerType, ownerId, ownerName: user.name };
};

/** Agents/Offices (and their assistants) only see inventory assigned to their own profile. */
const OWNER_SCOPED_ROLES = ['Agent', 'Assistant', 'Team Lead', 'Office Manager'];
export const ownerScopeFilter = (user: any, ownedOnly: boolean) => {
  if (!user || !OWNER_SCOPED_ROLES.includes(user.role)) return null;
  const ids = [String(user._id), user.parentAgentId ? String(user.parentAgentId) : ''].filter(Boolean);
  const own: any = { ownerId: { $in: ids } };
  // Order forms also offer the sign company's own rental stock. Items merely *named* after another agent/office
  // (legacy text owners not linked to a profile) are not rentals and stay hidden until staff assign a real owner.
  const rental = { ownerType: 'Sign company', owner: { $regex: SIGN_COMPANY_NAME.source, $options: 'i' } };
  return ownedOnly ? own : { $or: [own, rental] };
};

const formatInventoryItem = async (item: any, idx = 0) => {
  const barcode = resolveBarcode(item, idx);
  const qrCode = await generateQrDataUrl(barcode);
  const status = item.status && String(item.status).trim() !== ''
    ? String(item.status).trim()
    : defaultStatusOf(item.available);

  const base: any = {
    id: idx + 1,
    _id: item._id.toString(),
    product: item.product,
    itemType: item.itemType || 'Sign post',
    size: item.size || 'Standard',
    owner: item.assignedAgent || item.owner || 'Instapost LLC',
    assignedAgent: item.assignedAgent || item.owner || 'Instapost LLC',
    assignedAgentId: item.assignedAgentId ? String(item.assignedAgentId) : null,
    itemId: item.itemId || '',
    ownerType: item.ownerType || 'Sign company',
    ownerId: item.ownerId || (item.assignedAgentId ? String(item.assignedAgentId) : ''),
    ownerName: item.assignedAgent || item.owner || 'Instapost LLC',
    postType: postTypesOf(item)[0] || '',
    compatiblePostTypes: postTypesOf(item),
    ply: item.ply || '',
    units: Array.isArray(item.units) ? item.units.map(formatUnit) : [],
    office: item.office || '',
    barcode,
    customBarcode: item.customBarcode || '',
    legacyCodes: legacyCodesOf(item, barcode).filter((c) => c !== item.itemId),
    qrCode,
    available: item.available ?? 0,
    installed: item.installed ?? 0,
    total: item.total ?? (item.available ?? 0) + (item.installed ?? 0),
    location: item.location || 'Warehouse-1',
    status,
    stockLevel: stockLevelOf(item.available),
    displayStatus: displayStatusOf(item.status, item.available),
    imageUrl: item.imageUrl || item.image || '',
    publicId: item.publicId || '',
    image: item.imageUrl || item.image || '',
    history: Array.isArray(item.history) ? item.history : [],
    // Personnel @mentioned in `notes` (inventory.notes.ts); the edit form sends them back with the notes.
    notesMentions: Array.isArray(item.notesMentions) ? item.notesMentions.map(String) : [],
    lastUpdated: item.lastUpdated || (item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-GB') : ''),
  };

  for (const key of META_FIELDS) {
    if (item[key] !== undefined) base[key] = item[key];
  }
  return base;
};

/** Finds an item by Mongo id or by any of its current, custom or legacy codes (item or unit). */
const idOrCodeFilter = (id: string) => {
  const clean = decodeURIComponent(String(id || '').trim());
  return OBJECT_ID_RE.test(clean) ? { _id: clean } : codeLookupFilter(clean);
};

const findInventoryByIdOrCode = async (id: string) => Inventory.findOne(idOrCodeFilter(id)).lean();

const findInventoryDoc = async (id: string) => Inventory.findOne(idOrCodeFilter(id));

export class InventoryService {
  static async getInventory(query: any = {}, user?: any) {
    await backfillItemIds();
    const and: any[] = [];
    if (query.owner) and.push({ owner: { $regex: query.owner, $options: 'i' } });
    if (query.ownerType) and.push({ ownerType: String(query.ownerType) });
    if (query.ownerId) and.push({ ownerId: String(query.ownerId) });
    if (query.itemType) and.push({ itemType: new RegExp("^" + escapeRe(String(query.itemType).trim()) + "$", "i") });
    // Main panels / riders list the post types they fit (case-insensitive). Items with no post type saved yet
    // (older records) stay visible until staff set one.
    if (query.postType) {
      const types = String(query.postType).split("|").map((t) => t.trim()).filter(Boolean);
      if (types.length) and.push(postTypeClause(types));
    }
    if (query.search) {
      and.push({
        $or: [
          { product: { $regex: query.search, $options: 'i' } },
          { size: { $regex: query.search, $options: 'i' } },
          { owner: { $regex: query.search, $options: 'i' } },
          { barcode: { $regex: query.search, $options: 'i' } },
          { itemId: { $regex: query.search, $options: 'i' } },
          { 'units.barcode': { $regex: query.search, $options: 'i' } },
          { 'units.unitId': { $regex: query.search, $options: 'i' } },
          { legacyCodes: { $regex: query.search, $options: 'i' } },
        ],
      });
    }
    const scope = ownerScopeFilter(user, String(query.ownedOnly) === 'true');
    if (scope) and.push(scope);

    const filter = and.length ? { $and: and } : {};
    const items = await Inventory.find(filter).sort({ createdAt: -1 }).lean();
    return Promise.all(items.map((item, idx) => formatInventoryItem(item, idx)));
  }

  /** One item by id or by any code, within the caller's inventory visibility (used by the label print page). */
  static async getInventoryItem(id: string, user?: any) {
    const scope = ownerScopeFilter(user, false);
    const filter = scope ? { $and: [idOrCodeFilter(id), scope] } : idOrCodeFilter(id);
    const item = await Inventory.findOne(filter).lean();
    if (!item) throw new AppError('Inventory item not found.', 404);
    return formatInventoryItem(item, 0);
  }

  static async createInventoryItem(rawPayload: any) {
    const payload = cleanRiderMount(rawPayload || {}, rawPayload?.itemType || 'Sign post');
    const available = Number(payload.available) || 0;
    const installed = Number(payload.installed) || 0;
    const total = payload.total !== undefined ? Number(payload.total) : available + installed;
    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    const customBarcode = cleanCustomBarcode(payload.customBarcode);
    if (customBarcode) await assertCodesFree([customBarcode]);
    const status = payload.status || defaultStatusOf(available);
    const itemType = payload.itemType || 'Sign post';
    const postFields: any = {};
    applyPostFields(postFields, payload, itemType, true);
    const owner = await resolveOwner(payload);
    const assignedAgent = owner.ownerName;
    const assignedAgentId = owner.ownerId || null;
    const itemId = await generateItemId(itemType);

    const extra: Record<string, any> = {};
    for (const key of META_FIELDS) {
      if (payload[key] !== undefined) extra[key] = payload[key];
    }

    const item = await Inventory.create({
      product: payload.product || payload.name,
      itemType,
      itemId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      postType: postFields.postType || '',
      compatiblePostTypes: postFields.compatiblePostTypes || [],
      ply: postFields.ply || '',
      units: buildUnits(itemId, available + installed),
      size: payload.size || 'Standard',
      owner: assignedAgent,
      assignedAgent,
      assignedAgentId,
      status,
      office: payload.office || '',
      barcode: customBarcode || itemId,
      customBarcode,
      available,
      installed,
      total,
      location: payload.location || 'Warehouse-1',
      imageUrl: hasImageUpdate ? imageUrl : '',
      publicId: hasImageUpdate ? publicId : '',
      lastUpdated: new Date().toLocaleDateString('en-GB'),
      ...extra,
      history: [
        {
          id: `hist-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          status,
          address: payload.location || 'Warehouse-1',
          agent: assignedAgent,
          notes: `Initial inventory added (qty: ${total})`,
        },
      ],
    });

    return formatInventoryItem(item.toObject(), 0);
  }

  static async updateInventoryItem(id: string, rawPayload: any) {
    const existing = await Inventory.findById(id);
    if (!existing) throw new AppError('Inventory item not found.', 404);
    const payload = cleanRiderMount(rawPayload || {}, rawPayload?.itemType || existing.itemType, existing.mountType);

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    if (payload.product || payload.name) existing.product = payload.product || payload.name;
    if (payload.itemType) existing.itemType = payload.itemType;
    if (payload.size !== undefined) existing.size = payload.size || 'Standard';
    if (payload.status !== undefined) existing.status = String(payload.status).trim();
    if (payload.ownerType !== undefined || payload.ownerId !== undefined) {
      const owner = await resolveOwner(payload, {
        ownerType: existing.ownerType,
        ownerId: existing.ownerId,
        owner: existing.owner,
      });
      existing.ownerType = owner.ownerType as any;
      existing.ownerId = owner.ownerId;
      existing.assignedAgent = owner.ownerName;
      existing.owner = owner.ownerName || 'Instapost LLC';
      existing.assignedAgentId = (owner.ownerId || undefined);
    } else if (payload.assignedAgent !== undefined) {
      existing.assignedAgent = String(payload.assignedAgent).trim();
      existing.owner = String(payload.assignedAgent).trim() || 'Instapost LLC';
    } else if (payload.owner !== undefined) {
      existing.owner = String(payload.owner).trim();
      existing.assignedAgent = String(payload.owner).trim();
    }
    if (payload.assignedAgentId !== undefined && payload.ownerId === undefined) {
      existing.assignedAgentId = payload.assignedAgentId || null;
    }
    applyPostFields(existing, payload, existing.itemType || '', false);
    if (payload.office !== undefined) existing.office = payload.office;
    // `barcode` in the body is the displayed code and is ignored; only `customBarcode` relabels the item ('' clears it).
    const relabelled = payload.customBarcode !== undefined && cleanCustomBarcode(payload.customBarcode) !== (existing.customBarcode || '');
    if (relabelled) {
      const next = cleanCustomBarcode(payload.customBarcode);
      if (next) await assertCodesFree([next], { itemId: String(existing._id), slot: 'item' });
      if (!existing.itemId) existing.itemId = await generateItemId(existing.itemType);
      const old = existing.barcode;
      if (old && old !== existing.itemId && old !== next && !(existing.legacyCodes || []).includes(old) && !existing.customBarcode) {
        existing.legacyCodes = [...(existing.legacyCodes || []), old];
      }
      existing.customBarcode = next;
      existing.barcode = next || existing.itemId;
    }
    if (payload.location) existing.location = payload.location;
    if (payload.available !== undefined) existing.available = Number(payload.available) || 0;
    if (payload.installed !== undefined) existing.installed = Number(payload.installed) || 0;
    if (payload.total !== undefined && payload.available === undefined) {
      existing.available = Math.max(0, Number(payload.total) - (existing.installed || 0));
    }
    existing.total = existing.available + existing.installed;
    existing.lastUpdated = new Date().toLocaleDateString('en-GB');

    for (const key of META_FIELDS) {
      if (key === 'lastUpdated') continue;
      if (payload[key] !== undefined) (existing as any)[key] = payload[key];
    }

    if (payload.historyEntry) {
      existing.history = [payload.historyEntry, ...(existing.history || [])];
    } else if (payload.status && payload.status !== existing.status) {
      existing.history = [
        {
          id: `hist-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          status: payload.status,
          address: existing.location || 'Warehouse-1',
          agent: existing.assignedAgent || existing.owner,
          notes: `Status changed to ${payload.status}`,
        },
        ...(existing.history || []),
      ];
    } else if (payload.location || payload.available !== undefined || payload.installed !== undefined || relabelled) {
      existing.history = [
        {
          id: `hist-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          status: existing.installed > 0 && existing.available === 0 ? 'In Field' : 'In Stock',
          address: existing.location || 'Warehouse-1',
          agent: existing.owner,
          notes: `Updated item details (${existing.available} avail / ${existing.installed} installed)`,
        },
        ...(existing.history || []),
      ];
    }

    if (hasImageUpdate) {
      const oldPublicId = existing.publicId;
      existing.imageUrl = imageUrl;
      existing.publicId = publicId;
      await cleanupReplacedAsset(oldPublicId, publicId);
    }

    await existing.save();
    return formatInventoryItem(existing.toObject(), 0);
  }

  /**
   * Generate individual unit barcodes for an item (adds stock when `addStock` is true).
   * `barcodes` lets the sign company use its own labels: one unit per barcode instead of generated numbers.
   */
  static async generateUnits(id: string, count: number, addStock = false, barcodes?: unknown) {
    const own = Array.isArray(barcodes) ? await cleanOwnBarcodes(barcodes) : [];
    const n = own.length || Math.floor(Number(count));
    if (!Number.isFinite(n) || n < 1 || n > 500) throw new AppError('Enter a unit count between 1 and 500.', 400);
    const item = await Inventory.findById(id);
    if (!item) throw new AppError('Inventory item not found.', 404);
    if (!item.itemId) item.itemId = await generateItemId(item.itemType);

    const existing = Array.isArray(item.units) ? item.units : [];
    // Continue numbering after the highest existing suffix so unit IDs (and generated barcodes) are never reused.
    const highest = existing.reduce((m, u) => Math.max(m, unitNumberOf(u.unitId)), 0);
    const units = buildUnits(item.itemId, n, highest).map((u, i) => (own[i] ? { ...u, barcode: own[i], customBarcode: own[i] } : u));
    item.units = [...existing, ...units] as any;
    if (addStock) {
      item.available = (item.available || 0) + n;
      item.total = item.available + (item.installed || 0);
    }
    await item.save();
    return formatInventoryItem(item.toObject(), 0);
  }

  /** Record the condition of one specific unit (installed / missing / damaged / needs repair …). */
  static async updateUnit(
    id: string,
    unitBarcode: string,
    payload: { status?: string; notes?: string; barcode?: string; customBarcode?: string }
  ) {
    const item = await findInventoryDoc(id);
    if (!item) throw new AppError('Inventory item not found.', 404);
    const want = String(unitBarcode || '').trim().toLowerCase();
    const unit: any = (item.units || []).find((u) =>
      [u.barcode, u.unitId, u.customBarcode, ...(u.legacyCodes || [])].some((c) => c && String(c).toLowerCase() === want)
    );
    if (!unit) throw new AppError('Unit not found on this item.', 404);

    // `customBarcode` ('' clears it) or the older `barcode` field relabels the unit with the sign company's own number.
    const rawCustom = payload.customBarcode !== undefined ? payload.customBarcode : payload.barcode;
    if (rawCustom !== undefined) {
      const next = cleanCustomBarcode(rawCustom);
      if (next !== (unit.customBarcode || '') && !(next && next === unit.unitId && !unit.customBarcode)) {
        if (next) await assertCodesFree([next], { itemId: String(item._id), slot: `unit:${unit.unitId || unit.barcode}` });
        const old = unit.barcode;
        if (old && old !== unit.unitId && !unit.customBarcode && !(unit.legacyCodes || []).includes(old)) {
          unit.legacyCodes = [...(unit.legacyCodes || []), old];
        }
        unit.customBarcode = next === unit.unitId ? '' : next;
        unit.barcode = unit.customBarcode || unit.unitId || old;
      }
    }

    if (payload.status !== undefined) {
      if (!(UNIT_STATUSES as readonly string[]).includes(payload.status)) {
        throw new AppError(`Status must be one of: ${UNIT_STATUSES.join(', ')}.`, 400);
      }
      unit.status = payload.status;
    }
    if (payload.notes !== undefined) unit.notes = String(payload.notes).slice(0, 500);
    unit.updatedAt = new Date().toISOString();

    item.history = [
      {
        id: `hist-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        status: unit.status,
        address: item.location || 'Warehouse-1',
        agent: item.owner,
        notes: `Unit ${unit.barcode}: ${unit.status}${unit.notes ? ` — ${unit.notes}` : ''}`,
      },
      ...(item.history || []),
    ];
    item.markModified('units');
    await item.save();
    return formatInventoryItem(item.toObject(), 0);
  }

  static async deleteInventoryItem(id: string) {
    const existing = await Inventory.findById(id);
    if (!existing) throw new AppError('Inventory item not found.', 404);
    if (existing.publicId) await CloudinaryService.deleteAsset(existing.publicId);
    await Inventory.findByIdAndDelete(id);
    return { success: true };
  }

  static async adjustStock(id: string, deltaAvailable: number, deltaInstalled: number = 0) {
    const item = await Inventory.findById(id);
    if (!item) throw new AppError('Inventory item not found.', 404);

    item.available = Math.max(0, item.available + deltaAvailable);
    item.installed = Math.max(0, item.installed + deltaInstalled);
    item.total = item.available + item.installed;
    item.lastUpdated = new Date().toLocaleDateString('en-GB');
    item.history = [
      {
        id: `hist-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        status: deltaInstalled > 0 ? 'Dispatched' : 'In Stock',
        address: item.location || 'Warehouse-1',
        agent: item.owner,
        notes: `Stock adjusted (avail ${deltaAvailable >= 0 ? '+' : ''}${deltaAvailable}, installed ${deltaInstalled >= 0 ? '+' : ''}${deltaInstalled})`,
      },
      ...(item.history || []),
    ];

    await item.save();
    return { id: item._id.toString(), available: item.available, installed: item.installed, total: item.total };
  }

  static async importCsv(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) throw new AppError('No inventory rows provided.', 400);
    const valid = rows.filter((r) => r?.product || r?.name);
    // A `barcode` column is the sign company's own number for that item; otherwise the short item code is printed.
    const customs = valid.map((r) => cleanCustomBarcode(r.barcode));
    await assertCodesFree(customs.filter(Boolean));
    const docs = [];
    for (const [i, r] of valid.entries()) {
      const avail = Number(r.available ?? r.qty ?? r.quantity ?? 10) || 0;
      const inst = Number(r.installed ?? 0) || 0;
      const itemType = String(r.itemType || r.type || 'Sign post');
      const itemId = await generateItemId(itemType);
      docs.push({
        product: String(r.product || r.name).trim(),
        itemType,
        itemId,
        size: String(r.size || 'Standard'),
        owner: String(r.owner || r.agent || 'Instapost LLC'),
        office: String(r.office || ''),
        barcode: customs[i] || itemId,
        customBarcode: customs[i],
        available: avail,
        installed: inst,
        total: avail + inst,
        location: String(r.location || 'Warehouse-1'),
      });
    }
    const inserted = await Inventory.insertMany(docs);
    return { importedCount: inserted.length };
  }

  private static async resolveItemLabelMeta(id: string, queryCode?: string) {
    const item = await findInventoryByIdOrCode(id);
    if (!item && !queryCode) throw new AppError('Inventory item not found.', 404);
    const barcode = String(queryCode || (item ? resolveBarcode(item) : id)).trim();
    return {
      name: item?.product || 'Inventory Asset',
      type: item?.itemType || item?.size || 'Sign post',
      barcode,
      serialNo: item?.serialNo || '',
      location: item?.location || 'Warehouse-1',
      owner: item?.owner || 'Instapost LLC',
      qty: item?.total ?? item?.available ?? 0,
    };
  }

  static async getQrPng(id: string, queryCode?: string) {
    const meta = await this.resolveItemLabelMeta(id, queryCode);
    const buffer = await generateQrPngBuffer(meta.barcode);
    return { filename: `${meta.barcode}-qr.png`, buffer };
  }

  static async getQrSvg(id: string, queryCode?: string) {
    const meta = await this.resolveItemLabelMeta(id, queryCode);
    const svg = await buildInventoryQrSvg(meta);
    return { filename: `${meta.barcode}-qr-barcode.svg`, svg };
  }

  static async getLabelPdf(id: string, queryCode?: string) {
    const meta = await this.resolveItemLabelMeta(id, queryCode);
    const buffer = buildInventoryLabelPdf(meta);
    return { filename: `${meta.barcode}-qr-barcode.pdf`, buffer };
  }
}
