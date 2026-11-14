import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CloudinaryService, isBase64DataUri, isOurCloudinaryUrl } from '../utils/cloudinary.service';

export interface MigratedEntry {
  source: string;
  imageUrl: string;
  publicId: string;
  status: 'uploaded' | 'reused' | 'failed';
  error?: string;
}

const ROOT_DIR = path.resolve(__dirname, '../../../');
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const PORTAL_PUBLIC_DIRS = [
  'admin/public',
  'installer/public',
  'sign_company/public',
  'warehouse/public',
];

export const EXTERNAL_FRONTEND_URLS = [
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80',
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=900&q=80',
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&q=80',
  'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=400&q=80',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=400&q=80',
  'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=400&q=80',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=500&h=300&fit=crop',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=400&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=200',
  'https://images.unsplash.com/photo-1562654501-a0ccc0fc3fb1?auto=format&fit=crop&q=80&w=200',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=300&h=200&fit=crop',
  'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&q=80&w=600',
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-MbVMEtXjF0eT9SZPSa06NY4HQ0qn10.png',
];

export function resolveLocalFile(localWebPath: string): string | null {
  const rel = localWebPath.replace(/^\/+/, '');
  for (const dir of PORTAL_PUBLIC_DIRS) {
    const candidate = path.join(ROOT_DIR, dir, rel);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export function collectStaticAssets(): { key: string; filePath: string; hash: string }[] {
  const results: { key: string; filePath: string; hash: string }[] = [];
  const walk = (dir: string, baseDir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, baseDir, prefix);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!IMAGE_EXTS.has(ext)) continue;
        const rel = path.relative(baseDir, full).replace(/\\/g, '/');
        const key = `${prefix}${rel}`;
        const hash = crypto.createHash('md5').update(fs.readFileSync(full)).digest('hex');
        results.push({ key, filePath: full, hash });
      }
    }
  };

  for (const dir of PORTAL_PUBLIC_DIRS) {
    const abs = path.join(ROOT_DIR, dir);
    walk(abs, abs, '/');
  }
  const landingAssets = path.join(ROOT_DIR, 'landing/src/assets');
  walk(landingAssets, landingAssets, '@/assets/');
  return results;
}

const hashUploadCache = new Map<string, { imageUrl: string; publicId: string }>();

export async function uploadSourceIdempotent(
  source: string,
  folder: string,
  deterministicId?: string
): Promise<{ imageUrl: string; publicId: string; status: 'uploaded' | 'reused' }> {
  if (isOurCloudinaryUrl(source)) {
    return { imageUrl: source, publicId: deterministicId || '', status: 'reused' };
  }

  let uploadArg = source;
  let contentKey = source;

  if (source.startsWith('/') || source.startsWith('@/assets/')) {
    const resolved = source.startsWith('@/assets/')
      ? path.join(ROOT_DIR, 'landing/src/assets', source.replace('@/assets/', ''))
      : resolveLocalFile(source);
    if (!resolved) {
      throw new Error(`Local asset not found on disk: ${source}`);
    }
    const buf = fs.readFileSync(resolved);
    contentKey = crypto.createHash('md5').update(buf).digest('hex');
    uploadArg = resolved;
  } else if (isBase64DataUri(source)) {
    contentKey = crypto.createHash('md5').update(source).digest('hex');
  }

  const cached = hashUploadCache.get(contentKey);
  if (cached) {
    return { ...cached, status: 'reused' };
  }

  const safeId =
    deterministicId ||
    `mig_${crypto.createHash('md5').update(contentKey).digest('hex').slice(0, 14)}`;

  const res = await CloudinaryService.uploadFromSource(uploadArg, folder, {
    public_id: safeId,
    overwrite: false,
    unique_filename: false,
  });

  const value = { imageUrl: res.imageUrl, publicId: res.publicId };
  hashUploadCache.set(contentKey, value);
  return { ...value, status: 'uploaded' };
}

