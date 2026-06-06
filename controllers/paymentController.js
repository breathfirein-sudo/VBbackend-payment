const Razorpay = require('razorpay');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.createOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', type = 'deposit' } = req.body;
    const user = req.user;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    if (type === 'deposit' && (amount < 100 || amount > 10000)) {
      return res.status(400).json({ success: false, error: 'Deposit amount must be between ₹100 and ₹10,000' });
    }

    if (type === 'withdraw') {
      // Handle Withdrawal explicitly
      // For withdrawals, Razorpay requires RazorpayX (Payouts API).
      // Here we will just deduct from the wallet and simulate the withdrawal for demo purposes.
      if (user.wallet.balance < amount) {
        return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
      }

      await prisma.$transaction([
        prisma.wallet.update({
          where: { userId: user.id },
          data: { balance: { decrement: amount } },
        }),
        prisma.payment.create({
          data: {
            userId: user.id,
            orderId: `wd_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            amount: amount,
            currency: currency,
            status: 'successful', // Auto-success for demo
            paymentMethod: 'withdrawal',
          },
        }),
      ]);

      return res.status(200).json({ success: true, message: 'Withdrawal processed successfully', type: 'withdraw' });
    }

    // Handle Deposit (Razorpay Create Order)
    // Razorpay amount is in smallest currency unit (e.g., paise for INR)
    const options = {
      amount: amount * 100,
      currency,
      receipt: `receipt_${user.id}_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    // Save order in database
    await prisma.payment.create({
      data: {
        userId: user.id,
        orderId: order.id,
        amount: amount,
        currency: currency,
        status: 'created',
        paymentMethod: 'razorpay',
      },
    });

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      type: 'deposit',
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Create Order Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create payment order' });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const user = req.user;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      // Update payment status to failed
      await prisma.payment.update({
        where: { orderId: razorpay_order_id },
        data: { status: 'failed' },
      });
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    // Payment is successful
    const payment = await prisma.payment.findUnique({ where: { orderId: razorpay_order_id } });

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Order not found in database' });
    }

    if (payment.status === 'successful') {
      return res.status(200).json({ success: true, message: 'Payment already processed' });
    }

    // Transaction: Update payment status and add funds to wallet
    await prisma.$transaction([
      prisma.payment.update({
        where: { orderId: razorpay_order_id },
        data: {
          paymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          status: 'successful',
        },
      }),
      prisma.wallet.upsert({
        where: { userId: user.id },
        update: { balance: { increment: payment.amount } },
        create: { userId: user.id, balance: payment.amount },
      })
    ]);

    res.status(200).json({ success: true, message: 'Payment verified and funds added to wallet' });
  } catch (error) {
    console.error('Verify Payment Error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify payment' });
  }
};

exports.getPaymentHistory = async (req, res) => {
  try {
    const user = req.user;
    const payments = await prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: payments });
  } catch (error) {
    console.error('Fetch Payments Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment history' });
  }
};

exports.getPaymentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const payment = await prisma.payment.findFirst({
      where: { id, userId: user.id },
    });

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    console.error('Fetch Payment Details Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment details' });
  }
};
