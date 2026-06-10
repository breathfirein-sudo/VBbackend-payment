const axios = require('axios');

const BACKEND_URL = 'http://localhost:5000';
const testEmail = `testuser_${Date.now()}@example.com`;
const testPassword = 'Password123!';
const testName = 'Test User';

async function runTests() {
  console.log("Starting authentication endpoint tests...\n");

  // 1. Test registration
  console.log(`1. Testing registration with email: ${testEmail}...`);
  try {
    const regRes = await axios.post(`${BACKEND_URL}/api/auth/register`, {
      email: testEmail,
      password: testPassword,
      name: testName
    });

    console.log("✅ Registration response status:", regRes.status);
    console.log("✅ Registration response body:", JSON.stringify(regRes.data, null, 2));

    if (!regRes.data.success || !regRes.data.token) {
      throw new Error("Registration failed or token missing.");
    }

    const token = regRes.data.token;

    // 2. Test login
    console.log("\n2. Testing login with the same credentials...");
    const loginRes = await axios.post(`${BACKEND_URL}/api/auth/login`, {
      email: testEmail,
      password: testPassword
    });

    console.log("✅ Login response status:", loginRes.status);
    console.log("✅ Login response body:", JSON.stringify(loginRes.data, null, 2));

    if (!loginRes.data.success || !loginRes.data.token) {
      throw new Error("Login failed or token missing.");
    }

    // 3. Test request with the received JWT token to verify requireAuth middleware
    console.log("\n3. Testing authenticated API request using the JWT token...");
    // Let's try fetching contest admin participants or any trade route that uses requireAuth
    // Wait, let's see which routes use requireAuth.
    // In server.js, app.use('/api', tradeRoutes) - let's check tradeRoutes.js if it uses requireAuth.
    // Yes! Let's hit /api/trades
    const authRes = await axios.get(`${BACKEND_URL}/api/trades`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log("✅ Authenticated request response status:", authRes.status);
    console.log(`✅ Authenticated request retrieved trades count: ${authRes.data.length}`);

  } catch (error) {
    console.error("❌ Test failed:", error.response ? error.response.data : error.message);
  }
}

runTests();
