const axios = require('axios');

async function test() {
  try {
    // Attempt withdrawal using dummy data to see the 500 error
    const res = await axios.post('http://localhost:5000/api/payments/create-order', {
      amount: 500,
      currency: 'INR',
      type: 'withdraw',
      payoutDetails: {
        upiId: 'test@upi'
      }
    }, {
      headers: {
        Authorization: 'Bearer dummy-token-for-dev'
      }
    });
    console.log(res.data);
  } catch (err) {
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    } else {
      console.error(err.message);
    }
  }
}

test();
