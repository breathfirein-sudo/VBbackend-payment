const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTest() {
  const email = 'anjalisandeep.pikili@gmail.com';
  
  try {
    // 1. Ensure the user has enough wallet balance
    await prisma.wallet.update({
      where: { userId: 23 }, // Anjali Sandeep Pikili
      data: { balance: 1000 }
    });
    console.log('Set user balance to 1000');

    // 2. Fetch auth token for this user
    // We can simulate an auth token by signing JWT manually (using JWT_SECRET)
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: 23, email: email }, 'supersecretkey');

    // 3. Make withdrawal request
    console.log('Sending withdrawal request...');
    const res = await axios.post('http://localhost:5000/api/payments/create-order', {
      amount: 500,
      currency: 'INR',
      type: 'withdraw',
      payoutDetails: {
        upiId: 'test@upi'
      }
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Withdrawal response:', res.data);
  } catch (err) {
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    } else {
      console.error('Error:', err.message);
    }
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runTest();
