import { Inventory } from './inventory.model';
import { AppError } from '../../utils/apiError';
import { extractImageFields, cleanupReplacedAsset } from '../../utils/imageGuard';
import { CloudinaryService } from '../../utils/cloudinary.service';
import { buildInventoryLabelPdf, buildInventoryQrSvg, generateQrDataUrl, generateQrPngBuffer } from './inventory.qr';

const META_FIELDS = [
  'serialNo', 'shelveNo', 'unitPrice', 'shipment', 'replacementCost',
  'enableReplacementBilling', 'hardwareCosts', 'color', 'material',
  'postHeight', 'mountType', 'lockboxType', 'comboCode', 'shackleCode',
  'riderHeading', 'grommetPlacement', 'additionalSpecs', 'notes',
  'allowCustomization', 'lastUpdated',
] as const;

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const resolveBarcode = (item: any, fallbackIndex = 0) =>
  String(item.barcode || `BAR-${String(item._id || fallbackIndex).slice(-6).toUpperCase()}`);

const formatInventoryItem = async (item: any, idx = 0) => {
  const barcode = resolveBarcode(item, idx);
  const qrCode = await generateQrDataUrl(barcode);
  const status = (item.available || 0) > 5 ? 'In Stock' : (item.available || 0) > 0 ? 'Low Stock' : 'Checked Out';

  const base: any = {
    id: idx + 1,
    _id: item._id.toString(),
    product: item.product,
    itemType: item.itemType || 'Sign post',
    size: item.size || 'Standard',
    owner: item.owner || 'Instapost LLC',
    office: item.office || '',
    barcode,
    qrCode,
    available: item.available ?? 0,
    installed: item.installed ?? 0,
    total: item.total ?? (item.available ?? 0) + (item.installed ?? 0),
    location: item.location || 'Warehouse-1',
    status,
    imageUrl: item.imageUrl || item.image || '',
    publicId: item.publicId || '',
    image: item.imageUrl || item.image || '',
    history: Array.isArray(item.history) ? item.history : [],
    lastUpdated: item.lastUpdated || (item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-GB') : ''),
  };

  for (const key of META_FIELDS) {
    if (item[key] !== undefined) base[key] = item[key];
  }
  return base;
};

const findInventoryByIdOrCode = async (id: string) => {
  const clean = decodeURIComponent(String(id || '').trim());
  const clauses: any[] = [{ barcode: clean }];
  if (OBJECT_ID_RE.test(clean)) clauses.unshift({ _id: clean });
  return Inventory.findOne({ $or: clauses }).lean();
};

export class InventoryService {
  static async getInventory(query: any = {}) {
    const filter: any = {};
    if (query.owner) filter.owner = { $regex: query.owner, $options: 'i' };
    if (query.search) {
      filter.$or = [
        { product: { $regex: query.search, $options: 'i' } },
        { size: { $regex: query.search, $options: 'i' } },
        { owner: { $regex: query.search, $options: 'i' } },
        { barcode: { $regex: query.search, $options: 'i' } },
      ];
    }

    const items = await Inventory.find(filter).sort({ createdAt: -1 }).lean();
    return Promise.all(items.map((item, idx) => formatInventoryItem(item, idx)));
  }

  static async createInventoryItem(payload: any) {
    const available = Number(payload.available) || 0;
    const installed = Number(payload.installed) || 0;
    const total = payload.total !== undefined ? Number(payload.total) : available + installed;
    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    const barcode = payload.barcode || `BAR-${Date.now().toString().slice(-6)}`;

    const extra: Record<string, any> = {};
    for (const key of META_FIELDS) {
      if (payload[key] !== undefined) extra[key] = payload[key];
    }

    const item = await Inventory.create({
      product: payload.product || payload.name,
      itemType: payload.itemType || 'Sign post',
      size: payload.size || 'Standard',
      owner: payload.owner || 'Instapost LLC',
      office: payload.office || '',
      barcode,
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
          status: 'In Stock',
          address: payload.location || 'Warehouse-1',
          agent: payload.owner || 'Instapost LLC',
          notes: `Initial inventory added (qty: ${total})`,
        },
      ],
    });

    return formatInventoryItem(item.toObject(), 0);
  }

  static async updateInventoryItem(id: string, payload: any) {
    const existing = await Inventory.findById(id);
    if (!existing) throw new AppError('Inventory item not found.', 404);

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    if (payload.product || payload.name) existing.product = payload.product || payload.name;
    if (payload.itemType) existing.itemType = payload.itemType;
    if (payload.size !== undefined) existing.size = payload.size || 'Standard';
    if (payload.owner) existing.owner = payload.owner;
    if (payload.office !== undefined) existing.office = payload.office;
    if (payload.barcode) existing.barcode = String(payload.barcode).trim();
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
    } else if (payload.location || payload.available !== undefined || payload.installed !== undefined || payload.barcode) {
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
    const docs = rows
      .filter((r) => r?.product || r?.name)
      .map((r, i) => {
        const avail = Number(r.available ?? r.qty ?? r.quantity ?? 10) || 0;
        const inst = Number(r.installed ?? 0) || 0;
        return {
          product: String(r.product || r.name).trim(),
          itemType: String(r.itemType || r.type || 'Sign post'),
          size: String(r.size || 'Standard'),
          owner: String(r.owner || r.agent || 'Instapost LLC'),
          office: String(r.office || ''),
          barcode: String(r.barcode || `BAR-IMP-${Date.now().toString().slice(-4)}${i}`),
          available: avail,
          installed: inst,
          total: avail + inst,
          location: String(r.location || 'Warehouse-1'),
        };
      });
    const inserted = await Inventory.insertMany(docs);
    return { importedCount: inserted.length };
  }

  private static async resolveItemLabelMeta(id: string, queryCode?: string) {
    const item = await findInventoryByIdOrCode(id);
    if (!item && !queryCode) throw new AppError('Inventory item not found.', 404);
    const barcode = String(queryCode || (item ? resolveBarcode(item) : id)).toUpperCase();
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
