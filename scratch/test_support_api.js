const axios = require('axios');

async function test() {
  try {
    console.log("Attempting login as support staff...");
    const loginRes = await axios.post('http://localhost:5000/api/auth/support/login', {
      email: 'kshivaprasad33987@gmail.com',
      password: '1e2b665b'
    });

    if (!loginRes.data.success) {
      console.error("Login failed:", loginRes.data);
      return;
    }

    const token = loginRes.data.token;
    console.log("Login successful! Token retrieved.");

    const headers = { 'Authorization': `Bearer ${token}` };

    console.log("\n--- Testing GET /api/support/profile ---");
    const profileRes = await axios.get('http://localhost:5000/api/support/profile', { headers });
    console.log(JSON.stringify(profileRes.data, null, 2));

    console.log("\n--- Testing GET /api/support/chats ---");
    const chatsRes = await axios.get('http://localhost:5000/api/support/chats', { headers });
    console.log(JSON.stringify(chatsRes.data, null, 2));

    console.log("\n--- Testing GET /api/support/call-requests ---");
    const callsRes = await axios.get('http://localhost:5000/api/support/call-requests', { headers });
    console.log(JSON.stringify(callsRes.data, null, 2));

    console.log("\n--- Testing GET /api/deposits/pending ---");
    const pendingDepRes = await axios.get('http://localhost:5000/api/deposits/pending', { headers });
    console.log(JSON.stringify(pendingDepRes.data, null, 2));

    console.log("\n--- Testing GET /api/support/performance-report ---");
    const perfRes = await axios.get('http://localhost:5000/api/support/performance-report', { headers });
    console.log(JSON.stringify(perfRes.data, null, 2));

  } catch (err) {
    console.error("API Error:", err.response ? err.response.data : err.message);
  }
}

test();
