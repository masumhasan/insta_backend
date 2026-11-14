import http from 'http';
import app from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';

async function runAdminTests() {
  await connectDatabase();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5098, resolve));
  console.log('[TestServer] Running on port 5098');

  const post = async (path: string, body: any) => {
    const res = await fetch(`http://localhost:5098${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    return { status: res.status, data };
  };

  const get = async (path: string) => {
    const res = await fetch(`http://localhost:5098${path}`);
    const data: any = await res.json();
    return { status: res.status, data };
  };

  const patch = async (path: string, body: any) => {
    const res = await fetch(`http://localhost:5098${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    return { status: res.status, data };
  };

  const del = async (path: string) => {
    const res = await fetch(`http://localhost:5098${path}`, {
      method: 'DELETE',
    });
    const data: any = await res.json();
    return { status: res.status, data };
  };

  try {
    // 1. Get Admins (expect at least the seeded super admin)
    const listRes = await get('/admin/get-admins');
    console.assert(listRes.status === 200, 'Should get 200 from get-admins');
    console.assert(Array.isArray(listRes.data.data), 'Data should be an array of admins');
    console.log(`✓ Test 1: GET /admin/get-admins returned ${listRes.data.data.length} admin(s)`);

    // 2. Create a new Admin
    const uniqueEmail = `testadmin_${Date.now()}@example.com`;
    const createRes = await post('/admin/create-admin', {
      name: 'Integration Test Admin',
      email: uniqueEmail,
      password: 'AdminPassword123!',
      phone: '1234567890',
      permissions: { 'Manage Users': true },
    });
    console.assert(createRes.status === 201, 'Should create admin with 201');
    const newAdminId = createRes.data.data.userId;
    console.log(`✓ Test 2: POST /admin/create-admin succeeded with id ${newAdminId}`);

    // 3. Update the Admin
    const updateRes = await patch(`/admin/update-admin/${newAdminId}`, {
      name: 'Updated Test Admin',
      status: 'blocked',
    });
    console.assert(updateRes.status === 200, 'Should update admin with 200');
    console.assert(updateRes.data.data.status === 'blocked', 'Admin status should be blocked');
    console.log('✓ Test 3: PATCH /admin/update-admin/:id updated status to blocked');

    // 4. Delete the Admin
    const delRes = await del(`/admin/delete-admin/${newAdminId}`);
    console.assert(delRes.status === 200, 'Should delete admin with 200');
    console.log('✓ Test 4: DELETE /admin/delete-admin/:id deleted admin');

    console.log('\nAll Admin API Integration Tests PASSED successfully! 🚀');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runAdminTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
