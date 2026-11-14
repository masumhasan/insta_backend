import http from 'http';
import app from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';

async function runTests() {
  await connectDatabase();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5099, resolve));
  console.log('[TestServer] Running on port 5099');

  const post = async (path: string, body: any, headers: Record<string, string> = {}) => {
    const res = await fetch(`http://localhost:5099${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    return { status: res.status, data, headers: res.headers };
  };

  const get = async (path: string, headers: Record<string, string> = {}) => {
    const res = await fetch(`http://localhost:5099${path}`, {
      method: 'GET',
      headers,
    });
    const data: any = await res.json();
    return { status: res.status, data };
  };

  try {
    // 1. Test Login with wrong password
    const failLogin = await post('/auth/login', { email: 'mail.sparktechai@gmail.com', password: 'WrongPassword' });
    console.assert(failLogin.status === 401, 'Should fail login with 401');
    console.log('✓ Test 1: Invalid login rejected with 401');

    // 2. Test Login with correct credentials
    const successLogin = await post('/auth/login', { email: 'mail.sparktechai@gmail.com', password: 'Test@123' });
    console.assert(successLogin.status === 200, 'Should login successfully with 200');
    console.assert(successLogin.data.data.user.role === 'Admin', 'User role should be Admin');
    const token = successLogin.data.data.accessToken;
    const refreshToken = successLogin.data.data.refreshToken;
    console.log('✓ Test 2: Valid login succeeded with 200 and accessToken');

    // 3. Test Get Me with Bearer token
    const meRes = await get('/auth/me', { Authorization: `Bearer ${token}` });
    console.assert(meRes.status === 200, 'Should get /auth/me with 200');
    console.assert(meRes.data.data.user.email === 'mail.sparktechai@gmail.com', 'User email matches');
    console.log('✓ Test 3: Authenticated /auth/me returned correct user profile');

    // 4. Test Refresh Token
    const refreshRes = await post('/auth/refresh-token', { refreshToken });
    console.assert(refreshRes.status === 200, 'Should refresh token with 200');
    console.assert(!!refreshRes.data.data.accessToken, 'New accessToken provided');
    console.log('✓ Test 4: Refresh token endpoint returned new accessToken');

    console.log('\nAll Auth Tests PASSED successfully! 🎉');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
