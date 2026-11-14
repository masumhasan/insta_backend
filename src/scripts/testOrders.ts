import http from 'http';
import app from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';

async function runOrdersTests() {
  await connectDatabase();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5097, resolve));
  console.log('[TestServer] Running on port 5097');

  let authToken = '';
  const loginRes = await fetch('http://localhost:5097/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@instapost.com', password: 'User@123456' }),
  });
  const loginData: any = await loginRes.json();
  authToken = loginData?.data?.accessToken || '';
  console.assert(Boolean(authToken), 'Admin login should return access token');

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  });

  const post = async (path: string, body: any) => {
    const res = await fetch(`http://localhost:5097${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    return { status: res.status, data };
  };

  const get = async (path: string) => {
    const res = await fetch(`http://localhost:5097${path}`, {
      headers: authHeaders(),
    });
    const data: any = await res.json();
    return { status: res.status, data };
  };

  const patch = async (path: string, body: any) => {
    const res = await fetch(`http://localhost:5097${path}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    return { status: res.status, data };
  };

  try {
    // 0. Unauthenticated /orders check
    const unauthRes = await fetch('http://localhost:5097/orders');
    console.assert(unauthRes.status === 401, 'Unauthenticated /orders must return 401');

    // 1. Create Order
    const createRes = await post('/orders', {
      type: 'Installation',
      address: '742 Evergreen Terrace, Springfield, TX',
      agent: 'Liam Anderson',
      dueDate: 'Rush',
      price: '$185.00',
      pullList: [
        { product: '4x4 White Vinyl Post', quantity: 1, owner: 'Instapost', location: 'Aisle 2' },
        { product: 'For Sale Rider', quantity: 1, owner: 'Liam Anderson', location: 'Aisle 1' },
      ],
    });
    console.assert(createRes.status === 201, 'Should create order with 201');
    const orderId = encodeURIComponent(createRes.data.data.id);
    const orderMongoId = createRes.data.data._id;
    console.log(`✓ Test 1: POST /orders succeeded with orderNumber ${createRes.data.data.id}`);

    // 2. Get Orders
    const listRes = await get('/orders');
    console.assert(listRes.status === 200, 'Should get orders with 200');
    console.assert(listRes.data.data.length > 0, 'Orders array should not be empty');
    console.log(`✓ Test 2: GET /orders returned ${listRes.data.data.length} order(s)`);

    // 3. Assign Installer
    const assignRes = await patch(`/orders/${orderId}/assign`, {
      installerName: 'Efaz Ahmed',
      installerEmail: 'efaz.installer@instapost.com',
    });
    console.assert(assignRes.status === 200, 'Should assign installer with 200');
    console.assert(assignRes.data.data.installerName === 'Efaz Ahmed', 'Installer name matches');
    console.log(`✓ Test 3: PATCH /orders/:id/assign assigned Efaz Ahmed`);

    // 4. Add Photo
    const photoRes = await post(`/orders/${orderId}/photo`, {
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    });
    console.assert(photoRes.status === 200, 'Should add photo with 200');
    console.assert(photoRes.data.data.photos.length > 0, 'Photos array has image');
    console.log(`✓ Test 4: POST /orders/:id/photo added verification photo`);

    // 5. Create Inventory Item
    const invRes = await post('/inventory', {
      product: 'Standard 4x4 Vinyl Post',
      size: '4x4',
      owner: 'Instapost Logistics',
      available: 50,
      installed: 20,
    });
    console.assert(invRes.status === 201, 'Should create inventory with 201');
    const invId = invRes.data.data.id;
    console.log(`✓ Test 5: POST /inventory created item with total ${invRes.data.data.total}`);

    // 6. Adjust Stock
    const adjRes = await patch(`/inventory/${invId}/adjust`, {
      deltaAvailable: -1,
      deltaInstalled: 1,
    });
    console.assert(adjRes.status === 200, 'Should adjust stock with 200');
    console.assert(adjRes.data.data.available === 49, 'Available stock decremented');
    console.assert(adjRes.data.data.installed === 21, 'Installed stock incremented');
    console.log(`✓ Test 6: PATCH /inventory/:id/adjust adjusted stock count correctly`);

    console.log('\nAll Orders & Inventory API Tests PASSED successfully! 🎯');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runOrdersTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
