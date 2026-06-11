const Razorpay = require('razorpay');
require('dotenv').config();

console.log("Using Key ID:", process.env.RAZORPAY_KEY_ID);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function test() {
  try {
    const order = await razorpay.orders.create({
      amount: 10 * 100, // ₹10 in paise
      currency: 'INR',
      receipt: 'receipt_test_' + Date.now(),
    });
    console.log("Success! Order created:", order);
  } catch (err) {
    console.error("Error creating order:", err);
  }
}

test();
