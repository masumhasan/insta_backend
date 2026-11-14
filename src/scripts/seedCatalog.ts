import { connectDatabase, disconnectDatabase } from '../config/database';
import { Warehouse } from '../modules/catalog/warehouse.model';
import { Material } from '../modules/catalog/material.model';
import { Package } from '../modules/catalog/package.model';
import { Coupon } from '../modules/catalog/coupon.model';
import { ServiceItem } from '../modules/catalog/service.model';

async function seedCatalog() {
  await connectDatabase();

  // 1. Warehouses
  const warehouseCount = await Warehouse.countDocuments();
  if (warehouseCount === 0) {
    console.log('[Seed] Seeding Warehouses...');
    await Warehouse.insertMany([
      {
        name: 'Warehouse-1 (Dallas)',
        location: '1200 Industrial Blvd, Dallas, TX',
        assignedStaff: [
          { userId: 'staff_1', name: 'John Doe', designation: 'Warehouse Manager' },
          { userId: 'staff_2', name: 'Efaz Ahmed', designation: 'Installer' },
        ],
      },
      {
        name: 'Warehouse-2 (Austin)',
        location: '450 Tech Ridge Rd, Austin, TX',
        assignedStaff: [
          { userId: 'staff_3', name: 'Osman Goni', designation: 'Warehouse Manager' },
          { userId: 'staff_4', name: 'Mark Vance', designation: 'Installer' },
        ],
      },
    ]);
  }

  // 2. Materials
  const materialCount = await Material.countDocuments();
  if (materialCount === 0) {
    console.log('[Seed] Seeding Materials...');
    await Material.insertMany([
      { name: 'Aluminum Sheet', price: 120, category: 'Metal', vendorName: 'ABC Metals', unitCost: 12 },
      { name: 'Acrylic Board', price: 95, category: 'Plastic', vendorName: 'Plastico Ltd', unitCost: 9.5 },
      { name: 'PVC Foam Board', price: 75, category: 'Plastic', vendorName: 'Foam House', unitCost: 7.5 },
      { name: 'LED Strip', price: 45, category: 'Electrical', vendorName: 'Bright Lights Co', unitCost: 4.5 },
      { name: 'Steel Frame', price: 150, category: 'Metal', vendorName: 'SteelWorks Ltd', unitCost: 15 },
      { name: 'Vinyl Sticker Roll', price: 60, category: 'Printing', vendorName: 'PrintPro Supplies', unitCost: 6 },
    ]);
  }

  // 3. Packages
  const packageCount = await Package.countDocuments();
  if (packageCount === 0) {
    console.log('[Seed] Seeding Packages...');
    await Package.insertMany([
      {
        title: 'Starter Package',
        price: 29.99,
        image: '/package.png',
        description: 'Great starter package for new businesses and small agencies.',
        visibility: 'all',
        features: [
          { id: 'feat-1', name: 'Up to 5 users' },
          { id: 'feat-2', name: 'Basic analytics' },
          { id: 'feat-3', name: 'Email support' },
          { id: 'feat-4', name: '1 GB storage' },
        ],
      },
      {
        title: 'Professional Package',
        price: 79.99,
        image: '/package.png',
        description: 'Comprehensive sign management with dispatching and automated routing.',
        visibility: 'all',
        features: [
          { id: 'feat-5', name: 'Unlimited users' },
          { id: 'feat-6', name: 'Real-time GPS tracking' },
          { id: 'feat-7', name: 'Priority 24/7 support' },
          { id: 'feat-8', name: '10 GB storage' },
        ],
      },
    ]);
  }

  // 4. Coupons
  const couponCount = await Coupon.countDocuments();
  if (couponCount === 0) {
    console.log('[Seed] Seeding Coupons...');
    await Coupon.insertMany([
      { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, minOrderAmount: 50, status: 'active' },
      { code: 'SPRING20', discountType: 'fixed', discountValue: 20, minOrderAmount: 100, status: 'active' },
    ]);
  }

  // 5. Service items
  const serviceCount = await ServiceItem.countDocuments();
  if (serviceCount === 0) {
    console.log('[Seed] Seeding Service Items...');
    await ServiceItem.insertMany([
      { type: 'service', name: 'Standard Post Installation', price: 45, description: 'Standard wooden/PVC post installation' },
      { type: 'service', name: 'Sign Removal & Retrieval', price: 25, description: 'Post and rider removal back to warehouse' },
      { type: 'service', name: 'Rider Replacement', price: 15, description: 'Swap rider on existing post' },
      { type: 'installer_charge', name: 'Standard Area Base Charge', price: 30 },
      { type: 'trip_charge', name: 'Extended Radius Trip Charge', price: 15 },
    ]);
  }

  console.log('[Seed] Catalog seeded successfully!');
  await disconnectDatabase();
  process.exit(0);
}

seedCatalog().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});

