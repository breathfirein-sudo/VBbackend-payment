const axios = require('axios');

async function main() {
  try {
    const res = await axios.post('http://localhost:5000/api/auth/support/login', {
      email: 'kshivaprasad33987@gmail.com',
      password: '1e2b665b'
    });
    console.log("RESPONSE_STATUS:", res.status);
    console.log("RESPONSE_DATA:", res.data);
  } catch (error) {
    if (error.response) {
      console.log("ERROR_STATUS:", error.response.status);
      console.log("ERROR_DATA:", error.response.data);
    } else {
      console.error("REQUEST_ERROR:", error.message);
    }
  }
}

main();
