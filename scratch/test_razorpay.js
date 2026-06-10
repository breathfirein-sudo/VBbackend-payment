require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const Razorpay = require('razorpay');

console.log('Using Key ID:', process.env.RAZORPAY_KEY_ID);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function testOrder() {
  try {
    const options = {
      amount: 100, // 1 rupee (100 paise)
      currency: 'INR',
      receipt: 'receipt_test_' + Date.now(),
    };
    const order = await razorpay.orders.create(options);
    console.log('Order created successfully:', order);
  } catch (error) {
    console.error('Order creation failed:', error);
  }
}

testOrder();
