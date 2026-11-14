import { connectDatabase, disconnectDatabase } from '../config/database';
import { Warehouse } from '../modules/catalog/warehouse.model';
import { Material } from '../modules/catalog/material.model';
import { Package } from '../modules/catalog/package.model';
import { Coupon } from '../modules/catalog/coupon.model';
import { ServiceItem } from '../modules/catalog/service.model';
import { User } from '../modules/auth/user.model';
import { Inventory } from '../modules/inventory/inventory.model';
import { Order } from '../modules/order/order.model';
import bcrypt from 'bcryptjs';

async function seedSignCompany() {
  await connectDatabase();
  console.log('[Seed] Freezing & Migrating Sign Company Mock Data to Database...');

  // 1. Warehouses
  const warehousesData = [
    { name: 'Warehouse-1 (Dallas)', location: '1200 Industrial Blvd, Dallas, TX' },
    { name: 'Warehouse-2 (Austin)', location: '450 Tech Ridge Rd, Austin, TX' },
    { name: 'Warehouse-3 (Houston)', location: '890 Commerce Park, Houston, TX' },
  ];
  for (const w of warehousesData) {
    await Warehouse.findOneAndUpdate({ name: w.name }, w, { upsert: true });
  }

  // 2. Materials
  const materialsData = [
    { name: 'Aluminum Sheet', price: 120, category: 'Sign Post', vendorName: 'ABC Metals', unitCost: 12 },
    { name: 'Acrylic Board', price: 95, category: 'Main Panel', vendorName: 'Plastico Ltd', unitCost: 9.5 },
    { name: 'PVC Foam Board', price: 75, category: 'Rider Panel', vendorName: 'Foam House', unitCost: 7.5 },
    { name: 'LED Strip', price: 45, category: 'Sign Post', vendorName: 'Bright Lights Co', unitCost: 4.5 },
    { name: 'Steel Frame', price: 150, category: 'Main Panel', vendorName: 'SteelWorks Ltd', unitCost: 15 },
    { name: 'Vinyl Sticker Roll', price: 60, category: 'Printing', vendorName: 'PrintPro Supplies', unitCost: 6 },
    { name: 'Wood Post 4x4', price: 40, category: 'Sign Post', vendorName: 'Timberland Lumber', unitCost: 4 },
  ];
  for (const m of materialsData) {
    await Material.findOneAndUpdate({ name: m.name }, m, { upsert: true });
  }

  // 3. Coupons
  const couponsData = [
    { code: 'SAVE20', discountType: 'percentage', discountValue: 20, status: 'active', usageLimit: 100 },
    { code: 'FLAT50', discountType: 'fixed', discountValue: 50, status: 'active', usageLimit: 50 },
    { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, status: 'active', usageLimit: 1000 },
    { code: 'SUMMER30', discountType: 'percentage', discountValue: 30, status: 'expired', usageLimit: 200 },
    { code: 'VIPCLUB', discountType: 'percentage', discountValue: 15, status: 'active', usageLimit: 500 },
  ];
  for (const c of couponsData) {
    await Coupon.findOneAndUpdate({ code: c.code }, c, { upsert: true });
  }

  // 4. Packages
  const packagesData = [
    {
      title: 'Starter Package',
      price: 29.99,
      image: '/package.png',
      description: 'Ideal starter package for independent real estate agents.',
      visibility: 'all',
      features: [{ id: 'f1', name: 'Up to 5 active signposts' }, { id: 'f2', name: 'Basic GPS check-in' }],
    },
    {
      title: 'Professional Package',
      price: 79.99,
      image: '/package.png',
      description: 'Comprehensive sign management with dispatching and automated routing.',
      visibility: 'all',
      features: [{ id: 'f3', name: 'Up to 25 active signposts' }, { id: 'f4', name: 'Priority Dispatch' }],
    },
    {
      title: 'Enterprise Brokerage Package',
      price: 199.99,
      image: '/package.png',
      description: 'Full team dispatch, unlimited posts, and automated monthly consolidated invoicing.',
      visibility: 'all',
      features: [{ id: 'f5', name: 'Unlimited signposts' }, { id: 'f6', name: 'Dedicated Account Manager' }],
    },
  ];
  for (const p of packagesData) {
    await Package.findOneAndUpdate({ title: p.title }, p, { upsert: true });
  }

  // 5. Service Items (Services, Sign Types, Sizes, Delivery Methods, Options, Installer Charges, Trip Charges)
  const serviceItems = [
    { type: 'service', name: 'Standard Post Installation', price: 45, category: 'Installation', description: 'Wooden or PVC post installation with ground stake' },
    { type: 'service', name: 'Sign Removal & Retrieval', price: 25, category: 'Removal', description: 'Post and rider retrieval back to warehouse storage' },
    { type: 'service', name: 'Rider Replacement / Swap', price: 18, category: 'Service', description: 'Swap rider on existing in-ground post' },
    { type: 'service', name: 'Open House Directional Setup', price: 35, category: 'Directionals', description: 'Placement and recovery of open house signs' },
    { type: 'sign_type', name: 'Standard L-Shape', price: 30, category: 'Sign Type' },
    { type: 'sign_type', name: 'Heavy Duty Metal Post', price: 55, category: 'Sign Type' },
    { type: 'size', name: '24x36 inches', price: 20, category: 'Size' },
    { type: 'size', name: '18x24 inches', price: 15, category: 'Size' },
    { type: 'delivery_method', name: 'Technician Truck Delivery', price: 10, category: 'Delivery' },
    { type: 'delivery_method', name: 'Warehouse Will-Call Pickup', price: 0, category: 'Delivery' },
    { type: 'installer_charge', name: 'Standard Area Base Charge', price: 30, category: 'Installer Charge' },
    { type: 'installer_charge', name: 'Rush Same-Day Install Charge', price: 50, category: 'Installer Charge' },
    { type: 'trip_charge', name: 'Metro Area Zone 1 (0-15 miles)', price: 0, category: 'Trip Charge' },
    { type: 'trip_charge', name: 'Extended Zone 2 (15-30 miles)', price: 25, category: 'Trip Charge' },
    { type: 'variant', name: 'Gloss Finish Panel', price: 5, category: 'Variant' },
    { type: 'variant', name: 'Reflective Coating Panel', price: 12, category: 'Variant' },
    { type: 'variant', name: 'LED Driver', price: 55, category: 'Sign Post', options: { vendorName: 'PowerTech', purchaseDate: '2026-04-10', receivedDate: '2026-04-12', unitCost: 5.5 } },
    { type: 'variant', name: 'Backlit Flex', price: 85, category: 'Rider Panel', options: { vendorName: 'FlexPrint Ltd', purchaseDate: '2026-04-09', receivedDate: '2026-04-11', unitCost: 8.5 } },
    { type: 'variant', name: 'Wooden Panel', price: 110, category: 'Main Panel', options: { vendorName: 'Timber Mart', purchaseDate: '2026-04-08', receivedDate: '2026-04-10', unitCost: 11 } },
    { type: 'variant', name: 'Vinyl Sticker Roll', price: 60, category: 'Sign Post', options: { vendorName: 'PrintPro Supplies', purchaseDate: '2026-04-07', receivedDate: '2026-04-09', unitCost: 6 } },
    { type: 'variant', name: 'Glass Panel', price: 180, category: 'Rider Panel', options: { vendorName: 'ClearView Glass', purchaseDate: '2026-04-06', receivedDate: '2026-04-08', unitCost: 18 } },
    { type: 'variant', name: 'Steel Frame', price: 150, category: 'Main Panel', options: { vendorName: 'SteelWorks Ltd', purchaseDate: '2026-04-05', receivedDate: '2026-04-07', unitCost: 15 } },
    { type: 'variant', name: 'LED Strip', price: 45, category: 'Sign Post', options: { vendorName: 'Bright Lights Co', purchaseDate: '2026-04-04', receivedDate: '2026-04-06', unitCost: 4.5 } },
    { type: 'variant', name: 'PVC Foam Board', price: 75, category: 'Rider Panel', options: { vendorName: 'Foam House', purchaseDate: '2026-04-03', receivedDate: '2026-04-05', unitCost: 7.5 } },
    { type: 'variant', name: 'Acrylic Board', price: 95, category: 'Main Panel', options: { vendorName: 'Plastico Ltd', purchaseDate: '2026-04-02', receivedDate: '2026-04-04', unitCost: 9.5 } },
    { type: 'variant', name: 'Aluminum Sheet', price: 120, category: 'Sign Post', options: { vendorName: 'ABC Metals', purchaseDate: '2026-04-01', receivedDate: '2026-04-03', unitCost: 12 } },
  ];
  for (const item of serviceItems) {
    await ServiceItem.findOneAndUpdate({ type: item.type, name: item.name }, item, { upsert: true });
  }

  // 6. Users & Technicians
  const hashedPassword = await bcrypt.hash('Test@123', 10);
  const usersToSeed = [
    { name: "Todd's Company", email: 'todd@gmail.com', role: 'Agent', phone: '+1 214-555-0199', company: "Todd's Company", status: 'active', isApproved: true },
    { name: 'Coldwell Banker Agent', email: 'coldwell@gmail.com', role: 'Agent', phone: '+1 214-555-0198', company: 'Coldwell Banker', status: 'active', isApproved: true },
    { name: 'Alex Installer', email: 'alex.installer@instapost.com', role: 'Installer', phone: '+1 214-555-0103', company: 'Instapost Dispatch', status: 'active', isApproved: true },
    { name: 'Efaz Ahmed', email: 'efaz@instapost.com', role: 'Installer', phone: '+1 214-555-0104', company: 'Instapost Dispatch', status: 'active', isApproved: true },
    { name: 'Osman Goni', email: 'osman.goni@instapost.com', role: 'Warehouse manager', phone: '+1 214-555-0105', company: 'Warehouse Dallas', status: 'active', isApproved: true },
    { name: 'Emily Assistant', email: 'emily.asst@instapost.com', role: 'Assistant', phone: '+1 214-555-0106', company: "Todd's Company", status: 'active', isApproved: true },
    { name: 'Robert Lead', email: 'robert.lead@instapost.com', role: 'Team Lead', phone: '+1 214-555-0107', company: 'Coldwell Banker', status: 'active', isApproved: true },
    { name: 'Pending Agent Applicant', email: 'applicant@gmail.com', role: 'Agent', phone: '+1 214-555-0190', company: 'Metro Realty', status: 'pending', isApproved: false },
  ];
  for (const u of usersToSeed) {
    await User.findOneAndUpdate(
      { email: u.email.toLowerCase() },
      { ...u, password: hashedPassword, email: u.email.toLowerCase() },
      { upsert: true }
    );
  }

  // 7. Inventory
  const inventoryItems = [
    { product: 'L-Shape Post (White)', size: 'Standard 4x4', owner: "Todd's Company", available: 45, installed: 20, total: 65, location: 'Warehouse-1 (Aisle 1)' },
    { product: 'For Sale Panel (24x36)', size: '24x36', owner: 'Coldwell Banker', available: 28, installed: 15, total: 43, location: 'Warehouse-1 (Rack B)' },
    { product: 'Open House Rider', size: '6x24', owner: "Todd's Company", available: 50, installed: 10, total: 60, location: 'Warehouse-2 (Bin 4)' },
    { product: 'Premium Heavy Duty Post', size: 'Commercial 6x6', owner: 'Instapost LLC', available: 35, installed: 5, total: 40, location: 'Warehouse-1 (Aisle 3)' },
    { product: 'Directional Arrow Signs', size: '18x24', owner: 'Instapost LLC', available: 60, installed: 25, total: 85, location: 'Warehouse-2 (Aisle 2)' },
  ];
  for (const inv of inventoryItems) {
    await Inventory.findOneAndUpdate({ product: inv.product, owner: inv.owner }, inv, { upsert: true });
  }

  // 8. Orders (canonical Order schema fields)
  const ordersData = [
    {
      orderNumber: '#9001',
      type: 'Installation',
      address: '1044 Main St, Dallas, TX 75201',
      agent: "Todd's Company",
      orderDate: '11/10/2026',
      dueDate: '11/15/2026',
      price: '$55.00',
      totalAmount: 55,
      subtotal: 55,
      paymentStatus: 'Paid',
      status: 'Assigned Up',
      installerName: 'Alex Installer',
      installerEmail: 'alex.installer@instapost.com',
      specifications: {
        packageName: 'Standard White Post Installation',
        postType: 'Standard L-Shape',
        panel: 'For Sale Panel (24x36)',
        rider: 'Open House Rider',
      },
    },
    {
      orderNumber: '#9002',
      type: 'Removal',
      address: '402 Oak Ridge Ave, Austin, TX 78701',
      agent: 'Coldwell Banker Agent',
      orderDate: '11/10/2026',
      dueDate: '11/16/2026',
      price: '$35.00',
      totalAmount: 35,
      subtotal: 35,
      paymentStatus: 'Paid',
      status: 'Scheduled Down',
      installerName: 'Efaz Ahmed',
      installerEmail: 'efaz@instapost.com',
      specifications: {
        packageName: 'Sign Removal & Retrieval',
        postType: 'Standard L-Shape',
      },
    },
    {
      orderNumber: '#9003',
      type: 'Sign Change',
      address: '788 Elm Creek Rd, Dallas, TX 75204',
      agent: "Todd's Company",
      orderDate: '11/09/2026',
      dueDate: '11/10/2026',
      price: '$25.00',
      totalAmount: 25,
      subtotal: 25,
      paymentStatus: 'Paid',
      status: 'Completed',
      installerName: 'Alex Installer',
      installerEmail: 'alex.installer@instapost.com',
      specifications: {
        packageName: 'Rider Swap & Status Check',
        postType: 'Heavy Duty Metal Post',
        rider: 'Price Reduced Rider',
      },
    },
    {
      orderNumber: '#9004',
      type: 'Open House Services',
      address: '2300 Highland Park, Dallas, TX 75205',
      agent: 'Coldwell Banker Agent',
      orderDate: '11/11/2026',
      dueDate: '11/18/2026',
      price: '$45.00',
      totalAmount: 45,
      subtotal: 45,
      paymentStatus: 'Unpaid',
      status: 'Pending',
      specifications: {
        packageName: 'Open House Directionals Placement',
        postType: 'Directional Arrows',
      },
    },
  ];
  for (const ord of ordersData) {
    await Order.findOneAndUpdate({ orderNumber: ord.orderNumber }, { $set: ord }, { upsert: true });
  }

  console.log('[Seed] Sign Company Mock Data frozen & migrated successfully! 🚀');
  await disconnectDatabase();
}

seedSignCompany()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Seed Error]:', err);
    process.exit(1);
  });
