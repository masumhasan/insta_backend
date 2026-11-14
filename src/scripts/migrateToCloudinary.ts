import fs from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { configureCloudinary } from '../config/cloudinary';
import { User } from '../modules/auth/user.model';
import { Package } from '../modules/catalog/package.model';
import { ServiceItem } from '../modules/catalog/service.model';
import { Inventory } from '../modules/inventory/inventory.model';
import { Order } from '../modules/order/order.model';
import { isOurCloudinaryUrl } from '../utils/cloudinary.service';
import {
  collectStaticAssets,
  EXTERNAL_FRONTEND_URLS,
  uploadSourceIdempotent,
  MigratedEntry,
} from './migrateAssetsHelper';

const SCRATCH_DIR =
  'C:/Users/masum/.gemini/antigravity/brain/007948f7-88f2-41fe-bb10-f1b426d255f7/scratch';

async function backupMongoSnapshot() {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  const [users, packages, services, inventories, orders] = await Promise.all([
    User.find({}).lean(),
    Package.find({}).lean(),
    ServiceItem.find({}).lean(),
    Inventory.find({}).lean(),
    Order.find({}).lean(),
  ]);
  const backupPath = path.join(SCRATCH_DIR, 'cloudinary-migration-backup.json');
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ timestamp: new Date().toISOString(), users, packages, services, inventories, orders }, null, 2)
  );
  console.log(`[Migration] Backup written to ${backupPath}`);
}

async function runMigration() {
  const cloudinary = configureCloudinary();
  await cloudinary.api.ping();
  console.log('[Migration] Cloudinary credentials verified.');

  await connectDatabase();
  await backupMongoSnapshot();

  const report: MigratedEntry[] = [];
  let dbRecordsUpdated = 0;

  // 1. Migrate MongoDB Packages
  const packages = await Package.find({}).lean();
  for (const pkg of packages) {
    const raw = (pkg as any).imageUrl || (pkg as any).image || '';
    if (raw && !isOurCloudinaryUrl(raw)) {
      const up = await uploadSourceIdempotent(raw, 'packages', `pkg_${pkg._id}`);
      await Package.collection.updateOne({ _id: pkg._id }, { $set: { imageUrl: up.imageUrl, publicId: up.publicId }, $unset: { image: 1 } });
      dbRecordsUpdated++;
      report.push({ source: raw, imageUrl: up.imageUrl, publicId: up.publicId, status: up.status });
    } else if ((pkg as any).image !== undefined) {
      await Package.collection.updateOne({ _id: pkg._id }, { $unset: { image: 1 } });
    }
  }

  // 2. Migrate MongoDB Users
  const users = await User.find({}).lean();
  for (const user of users) {
    const raw = (user as any).imageUrl || (user as any).image || '';
    if (raw && !isOurCloudinaryUrl(raw)) {
      const up = await uploadSourceIdempotent(raw, 'users', `user_${user._id}`);
      await User.collection.updateOne({ _id: user._id }, { $set: { imageUrl: up.imageUrl, publicId: up.publicId }, $unset: { image: 1 } });
      dbRecordsUpdated++;
      report.push({ source: raw, imageUrl: up.imageUrl, publicId: up.publicId, status: up.status });
    } else if ((user as any).image !== undefined) {
      await User.collection.updateOne({ _id: user._id }, { $unset: { image: 1 } });
    }
  }

  // 3. Migrate MongoDB ServiceItems
  const services = await ServiceItem.find({}).lean();
  for (const svc of services) {
    const raw = (svc as any).imageUrl || (svc as any).options?.imageUrl || (svc as any).options?.image || '';
    if (raw && !isOurCloudinaryUrl(raw)) {
      const up = await uploadSourceIdempotent(raw, 'services', `svc_${svc._id}`);
      await ServiceItem.collection.updateOne(
        { _id: svc._id },
        { $set: { imageUrl: up.imageUrl, publicId: up.publicId }, $unset: { 'options.image': 1, 'options.imageUrl': 1, image: 1 } }
      );
      dbRecordsUpdated++;
      report.push({ source: raw, imageUrl: up.imageUrl, publicId: up.publicId, status: up.status });
    } else if ((svc as any).image !== undefined || (svc as any).options?.image !== undefined) {
      await ServiceItem.collection.updateOne({ _id: svc._id }, { $unset: { 'options.image': 1, 'options.imageUrl': 1, image: 1 } });
    }
  }

  // 4. Migrate MongoDB Inventories
  const inventories = await Inventory.find({}).lean();
  for (const inv of inventories) {
    const raw = (inv as any).imageUrl || (inv as any).image || '';
    if (raw && !isOurCloudinaryUrl(raw)) {
      const up = await uploadSourceIdempotent(raw, 'inventory', `inv_${inv._id}`);
      await Inventory.collection.updateOne({ _id: inv._id }, { $set: { imageUrl: up.imageUrl, publicId: up.publicId }, $unset: { image: 1 } });
      dbRecordsUpdated++;
      report.push({ source: raw, imageUrl: up.imageUrl, publicId: up.publicId, status: up.status });
    } else if ((inv as any).image !== undefined) {
      await Inventory.collection.updateOne({ _id: inv._id }, { $unset: { image: 1 } });
    }
  }

  // 5. Migrate MongoDB Orders photos
  const orders = await Order.find({}).lean();
  for (const order of orders) {
    const rawPhotos = (order.photos as any[]) || [];
    let changed = false;
    const nextPhotos: { imageUrl: string; publicId: string }[] = [];
    for (let idx = 0; idx < rawPhotos.length; idx++) {
      const item = rawPhotos[idx];
      const rawUrl = typeof item === 'string' ? item : item?.imageUrl || '';
      if (!rawUrl) continue;
      if (isOurCloudinaryUrl(rawUrl) && typeof item !== 'string') {
        nextPhotos.push(item);
        continue;
      }
      const up = await uploadSourceIdempotent(rawUrl, 'orders', `order_${order._id}_${idx}`);
      nextPhotos.push({ imageUrl: up.imageUrl, publicId: up.publicId });
      report.push({ source: rawUrl, imageUrl: up.imageUrl, publicId: up.publicId, status: up.status });
      changed = true;
    }
    if (changed) {
      await Order.collection.updateOne({ _id: order._id }, { $set: { photos: nextPhotos } });
      dbRecordsUpdated++;
    }
  }

  // 6. Migrate all Static Frontend Assets & External Frontend URLs
  const manifestPath = path.join(SCRATCH_DIR, 'cloudinary-asset-manifest.json');
  const existingAssetMap: Record<string, { imageUrl: string; publicId: string }> =
    fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).assetMap || {}
      : {};
  const assetMap: Record<string, { imageUrl: string; publicId: string }> = {};
  for (const asset of collectStaticAssets()) {
    try {
      const prev = existingAssetMap[asset.key];
      if (prev && isOurCloudinaryUrl(prev.imageUrl)) {
        assetMap[asset.key] = prev;
        report.push({ source: asset.key, imageUrl: prev.imageUrl, publicId: prev.publicId, status: 'reused' });
        continue;
      }
      const slug = asset.key.replace(/^[@\/]+/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const up = await uploadSourceIdempotent(asset.key, 'assets', slug);
      assetMap[asset.key] = { imageUrl: up.imageUrl, publicId: up.publicId };
      report.push({ source: asset.key, imageUrl: up.imageUrl, publicId: up.publicId, status: up.status });
    } catch (err: any) {
      report.push({ source: asset.key, imageUrl: '', publicId: '', status: 'failed', error: err.message });
    }
  }

  for (const extUrl of EXTERNAL_FRONTEND_URLS) {
    try {
      const prev = existingAssetMap[extUrl];
      if (prev && isOurCloudinaryUrl(prev.imageUrl)) {
        assetMap[extUrl] = prev;
        report.push({ source: extUrl, imageUrl: prev.imageUrl, publicId: prev.publicId, status: 'reused' });
        continue;
      }
      const up = await uploadSourceIdempotent(extUrl, 'assets');
      assetMap[extUrl] = { imageUrl: up.imageUrl, publicId: up.publicId };
      report.push({ source: extUrl, imageUrl: up.imageUrl, publicId: up.publicId, status: up.status });
    } catch (err: any) {
      report.push({ source: extUrl, imageUrl: '', publicId: '', status: 'failed', error: err.message });
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify({ dbRecordsUpdated, assetMap, report }, null, 2));
  console.log(`[Migration] Done. DB Records Updated: ${dbRecordsUpdated}, Assets Processed: ${report.length}`);

  await disconnectDatabase();
  process.exit(0);
}

runMigration().catch(async (err: any) => {
  const msg = err?.error?.message || err?.message || 'Unknown migration error';
  const code = err?.error?.http_code || err?.http_code || 500;
  console.error(`[Migration Error] HTTP ${code}: ${msg}`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
