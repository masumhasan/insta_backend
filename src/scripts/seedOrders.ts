import { connectDatabase, disconnectDatabase } from '../config/database';
import { Order } from '../modules/order/order.model';

async function seedOrders() {
  await connectDatabase();

  const count = await Order.countDocuments();
  if (count <= 2) {
    console.log('[Seed] Seeding sample production orders...');
    await Order.insertMany([
      {
        orderNumber: '#8003',
        type: 'Installation',
        address: '4512 McKinney Ave, Dallas, TX',
        agent: 'Sarah Agent',
        agentId: 'agent_1',
        orderDate: '02/10/2026',
        dueDate: 'Standard',
        price: '$150.00',
        status: 'Scheduled Up',
        installerName: 'Efaz Ahmed',
        installerEmail: 'efaz.installer@instapost.com',
        pullList: [
          { id: 'p1', product: '4x4 White Vinyl Post', quantity: 1, owner: 'Instapost', location: 'Aisle 2, Bin 10', checked: true },
          { id: 'p2', product: 'For Sale Rider', quantity: 1, owner: 'Sarah Agent', location: 'Aisle 1, Bin 4', checked: true },
        ],
      },
      {
        orderNumber: '#8004',
        type: 'Installation',
        address: '8820 Preston Rd, Plano, TX',
        agent: 'David Agent',
        agentId: 'agent_2',
        orderDate: '02/11/2026',
        dueDate: 'Rush',
        price: '$195.00',
        status: 'Installed',
        installerName: 'Efaz Ahmed',
        installerEmail: 'efaz.installer@instapost.com',
        photos: ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6'],
      },
      {
        orderNumber: '#8005',
        type: 'Removal',
        address: '102 Oak Lawn Ave, Dallas, TX',
        agent: 'Sarah Agent',
        agentId: 'agent_1',
        orderDate: '02/12/2026',
        dueDate: 'Standard',
        price: '$45.00',
        status: 'Pending Down',
      },
      {
        orderNumber: '#8006',
        type: 'Sign Printing',
        address: '3200 Commerce St, Dallas, TX',
        agent: 'David Agent',
        agentId: 'agent_2',
        orderDate: '02/12/2026',
        dueDate: 'Standard',
        price: '$85.00',
        status: 'In Production',
      },
      {
        orderNumber: '#8007',
        type: 'For Sale Directionals',
        address: '774 Hillcrest Rd, University Park, TX',
        agent: 'Sarah Agent',
        agentId: 'agent_1',
        orderDate: '02/13/2026',
        dueDate: 'Rush',
        price: '$65.00',
        status: 'Scheduled',
        installerName: 'Efaz Ahmed',
        installerEmail: 'efaz.installer@instapost.com',
      },
    ]);
  }

  console.log('[Seed] Orders seeded successfully!');
  await disconnectDatabase();
  process.exit(0);
}

seedOrders().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});

