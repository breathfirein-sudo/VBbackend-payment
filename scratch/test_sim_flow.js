require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const paymentController = require('../controllers/paymentController');

async function runTest() {
  try {
    // 1. Get a test user from DB
    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('No users found in database to run tests against.');
      return;
    }
    console.log('Using test user:', user.email);

    // Mock Express Request & Response for createOrder
    let responseData = null;
    const reqCreate = {
      body: { amount: 10, currency: 'INR', type: 'deposit' },
      user: user
    };
    const resCreate = {
      status: function(code) {
        console.log('resCreate status code:', code);
        return this;
      },
      json: function(data) {
        responseData = data;
        return this;
      }
    };

    console.log('\n--- Testing createOrder (Simulated Fallback) ---');
    await paymentController.createOrder(reqCreate, resCreate);
    console.log('createOrder Response:', responseData);

    if (responseData && responseData.success && responseData.simulated) {
      console.log('✅ createOrder fallback successful!');
      
      // Mock Express Request & Response for verifyPayment
      let verifyData = null;
      const reqVerify = {
        body: {
          razorpay_order_id: responseData.orderId,
          razorpay_payment_id: 'pay_sim_test_123',
          razorpay_signature: 'simulated_signature'
        },
        user: user
      };
      const resVerify = {
        status: function(code) {
          console.log('resVerify status code:', code);
          return this;
        },
        json: function(data) {
          verifyData = data;
          return this;
        }
      };

      console.log('\n--- Testing verifyPayment (Simulated Bypass) ---');
      await paymentController.verifyPayment(reqVerify, resVerify);
      console.log('verifyPayment Response:', verifyData);

      if (verifyData && verifyData.success) {
        console.log('✅ verifyPayment bypass successful!');
      } else {
        console.error('❌ verifyPayment failed!');
      }
    } else {
      console.error('❌ createOrder simulated fallback failed!');
    }

  } catch (err) {
    console.error('Error during test execution:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
