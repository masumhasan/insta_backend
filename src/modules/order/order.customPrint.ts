import { ServiceItem } from '../catalog/service.model';
import { Material } from '../catalog/material.model';
import { listPrintOptions } from '../catalog/catalog.addons';
import { AppError } from '../../utils/apiError';
import { assertNoBase64 } from '../../utils/imageGuard';
import { customPrintPrice } from './order.postMath';

/**
 * Custom pieces on a New Sign Install post (Designer tab: template + typed lines; Custom tab: uploaded artwork).
 * They have no inventory row yet: the server checks the design, prices it from the Printing catalog and keeps it on
 * the slot (`custom: true`) and in `specifications.customItems`, where the design-approval step picks it up.
 */
export type CustomDesign = {
  source: 'designer' | 'custom';
  templateId: string;
  templateName: string;
  lines: string[];
  size: string;
  material: string;
  optionId: string;
  optionName: string;
  notes: string;
  imageUrl: string;
  publicId: string;
};

export type PrintCatalog = {
  sizes: { name: string; price: number; category: string }[];
  materials: { name: string; price: number }[];
  options: { id: string; name: string; price: number; appliesTo: string[] }[];
};

const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/[^\s]+$/i;
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export const isCustomSlot = (v: any) => v?.custom === true || v?.custom === 'true';

export async function loadPrintCatalog(): Promise<PrintCatalog> {
  const [sizes, materials, options] = await Promise.all([
    ServiceItem.find({ type: 'size' }).lean(),
    Material.find({}).lean(),
    listPrintOptions(''),
  ]);
  return {
    sizes: sizes.map((s: any) => ({ name: String(s.name || ''), price: Number(s.price) || 0, category: String(s.category || '') })),
    materials: materials.map((m: any) => ({ name: String(m.name || ''), price: Number(m.price) || 0 })),
    options,
  };
}

const cloudinaryUrl = (v: unknown, what: string) => {
  const url = text(v, 1000);
  assertNoBase64(url, what);
  if (!CLOUDINARY.test(url)) throw new AppError(`${what} must be an uploaded image.`, 400);
  return url;
};

/** Checks one custom slot (`rider` = a rider slot, else the main panel) and prices it on the server. */
export function resolveCustomSlot(v: any, rider: boolean, label: string, catalog: PrintCatalog, template?: any) {
  const d = v?.design || {};
  const source = d.source === 'designer' ? 'designer' : d.source === 'custom' ? 'custom' : '';
  if (!source) throw new AppError(`${label}: the custom design is incomplete.`, 400);
  const lines = (Array.isArray(d.lines) ? d.lines : []).slice(0, 2).map((l: unknown) => text(l, 60));
  if (source === 'designer' && !lines[0]) throw new AppError(`${label}: enter the text for the design.`, 400);
  if (source === 'designer' && d.templateId && !template) throw new AppError(`${label}: the design template is not available.`, 400);
  const image = cloudinaryUrl(v?.image || d.imageUrl, `${label} image`);
  const material = text(d.material, 80);
  if (material && !catalog.materials.some((m) => m.name.toLowerCase() === material.toLowerCase())) throw new AppError(`${label}: unknown material "${material}".`, 400);
  const optionId = text(d.optionId, 40);
  const option = optionId ? catalog.options.find((o) => o.id === optionId && o.appliesTo.includes(rider ? 'rider' : 'sign')) : undefined;
  if (optionId && !option) throw new AppError(`${label}: the selected print option is not available.`, 400);
  const size = text(template?.size || d.size, 40);

  const design: CustomDesign = {
    source,
    templateId: template ? String(template._id) : '',
    templateName: template ? String(template.product || '') : '',
    lines: source === 'designer' ? lines.filter(Boolean) : [],
    size,
    material,
    optionId: option?.id || '',
    optionName: option?.name || '',
    notes: text(d.notes, 500),
    imageUrl: image,
    publicId: text(d.publicId, 200),
  };
  const noun = rider ? 'rider' : 'panel';
  return {
    id: '',
    custom: true as const,
    name: source === 'designer' ? `Custom ${noun}: ${design.lines.join(' / ')}` : `Custom ${noun} (your artwork)`,
    size,
    image,
    owner: 'Custom print',
    price: customPrintPrice(catalog, { size, material, optionPrice: option?.price, rider }),
    design,
  };
}
