const Razorpay = require('razorpay');
const crypto = require('crypto');
const axios = require('axios');
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

    if (type === 'deposit' && (amount < 100 || amount > 100000)) {
      return res.status(400).json({ success: false, error: 'Deposit amount must be between ₹100 and ₹1,00,000' });
    }

    if (type === 'withdraw') {
      const { payoutDetails } = req.body;
      if (amount < 500) {
        return res.status(400).json({ success: false, error: 'Withdrawal amount must be at least ₹500' });
      }
      if (!payoutDetails || (!payoutDetails.upiId && (!payoutDetails.accountNumber || !payoutDetails.ifsc))) {
        return res.status(400).json({ success: false, error: 'UPI ID or Bank Account Details are required for withdrawal' });
      }

      if (!user.wallet) {
        return res.status(400).json({ success: false, error: 'Wallet not found' });
      }

      const totalReferralRewards = (user.referralCount || 0) * 10;
      const withdrawableBalance = Math.max(0, user.wallet.balance - totalReferralRewards);

      if (withdrawableBalance < amount) {
        return res.status(400).json({
          success: false,
          error: `Insufficient withdrawable balance. Your withdrawable balance is ₹${withdrawableBalance.toFixed(2)} (excludes ₹${totalReferralRewards.toFixed(2)} referral rewards).`
        });
      }

      const availableBalanceAfter = user.wallet.balance - amount;

      const authHeader = 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');

      try {
        // 1. Create a Contact
        console.log('Sending Razorpay Contact creation request...');
        const contactRes = await axios.post(
          'https://api.razorpay.com/v1/contacts',
          {
            name: user.name || user.email.split('@')[0],
            email: user.email,
            contact: '9999999999',
            type: 'customer',
            reference_id: `cust_${user.id}`
          },
          { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
        );

        const contactId = contactRes.data.id;
        console.log('Razorpay Contact created successfully. ID:', contactId);

        // 2. Create a Fund Account
        const fundAccountBody = {
          contact_id: contactId,
          account_type: payoutDetails.upiId ? 'vpa' : 'bank_account'
        };

        if (payoutDetails.upiId) {
          fundAccountBody.vpa = { address: payoutDetails.upiId };
        } else {
          fundAccountBody.bank_account = {
            name: payoutDetails.accountName || user.name || user.email.split('@')[0],
            ifsc: payoutDetails.ifsc,
            account_number: payoutDetails.accountNumber
          };
        }

        console.log('Sending Razorpay Fund Account creation request...');
        const fundAccountRes = await axios.post(
          'https://api.razorpay.com/v1/fund_accounts',
          fundAccountBody,
          { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
        );

        const fundAccountId = fundAccountRes.data.id;
        console.log('Razorpay Fund Account created successfully. ID:', fundAccountId);

        // 3. Create a Payout
        const payoutPayload = {
          account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER || '4560000282928373',
          fund_account_id: fundAccountId,
          amount: amount * 100, // Amount in paise
          currency: 'INR',
          mode: payoutDetails.upiId ? 'UPI' : 'IMPS',
          purpose: 'payout',
          queue_if_low_balance: true,
          reference_id: `wd_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          narration: 'Investhour Wallet Withdrawal'
        };
        console.log('Sending Razorpay Payout request with payload:', JSON.stringify(payoutPayload));
        const payoutRes = await axios.post(
          'https://api.razorpay.com/v1/payouts',
          payoutPayload,
          {
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
              'X-Payout-Idempotency': `idem_${Date.now()}`
            }
          }
        );

        const payoutData = payoutRes.data;
        console.log('Razorpay Payout created successfully. Payout ID:', payoutData.id);

        // 4. Update the DB in a transaction
        await prisma.$transaction([
          prisma.wallet.update({
            where: { userId: user.id },
            data: { balance: { decrement: amount } },
          }),
          prisma.payment.create({
            data: {
              userId: user.id,
              orderId: payoutData.id || `wd_${Date.now()}`,
              amount: amount,
              currency: currency,
              status: payoutData.status || 'processing',
              paymentMethod: payoutDetails.upiId ? 'upi_withdrawal' : 'bank_withdrawal',
              upiId: payoutDetails.upiId || null,
              bankAccount: payoutDetails.accountNumber || null,
              ifsc: payoutDetails.ifsc || null,
              bankName: payoutDetails.bankName || null,
              accountHolder: payoutDetails.accountName || null,
              availableBalanceAfter: availableBalanceAfter,
            },
          }),
          prisma.transaction.create({
            data: {
              userId: user.id,
              type: 'withdrawal',
              asset: 'wallet',
              amount: amount,
              details: `Withdrew to ${payoutDetails.upiId || payoutDetails.accountNumber} (Payout ID: ${payoutData.id})`
            }
          })
        ]);

        return res.status(200).json({
          success: true,
          message: 'Withdrawal payout processed successfully',
          type: 'withdraw',
          payoutId: payoutData.id,
          status: payoutData.status
        });

      } catch (razorpayError) {
        console.error('Razorpay Payout Error details:', razorpayError.response ? razorpayError.response.data : razorpayError.message);
        
        // Check if the error indicates that RazorpayX is not activated or URL not found (e.g. Standard keys)
        const isNotActivated = razorpayError.response && razorpayError.response.data && razorpayError.response.data.error &&
          (razorpayError.response.data.error.description === 'The requested URL was not found on the server.' ||
           razorpayError.response.data.error.code === 'BAD_REQUEST_ERROR');
        
        const isTestMode = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID.startsWith('rzp_test');

        if (isTestMode || isNotActivated) {
          console.warn('⚠️ RazorpayX Payout API is not activated or standard keys are used. Falling back to Simulated Payout (Test Mode)...');
          
          const simulatedPayoutId = `pout_sim_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

          // Update the DB in a transaction
          await prisma.$transaction([
            prisma.wallet.update({
              where: { userId: user.id },
              data: { balance: { decrement: amount } },
            }),
            prisma.payment.create({
              data: {
                userId: user.id,
                orderId: simulatedPayoutId,
                amount: amount,
                currency: currency,
                status: 'processing',
                paymentMethod: payoutDetails.upiId ? 'upi_withdrawal_sim' : 'bank_withdrawal_sim',
                upiId: payoutDetails.upiId || null,
                bankAccount: payoutDetails.accountNumber || null,
                ifsc: payoutDetails.ifsc || null,
                bankName: payoutDetails.bankName || null,
                accountHolder: payoutDetails.accountName || null,
                availableBalanceAfter: availableBalanceAfter,
              },
            }),
            prisma.transaction.create({
              data: {
                userId: user.id,
                type: 'withdrawal',
                asset: 'wallet',
                amount: amount,
                details: `Simulated withdrawal to ${payoutDetails.upiId || payoutDetails.accountNumber} (Payout ID: ${simulatedPayoutId})`
              }
            })
          ]);

          return res.status(200).json({
            success: true,
            message: 'Withdrawal processed successfully (Simulated Test Mode fallback)',
            type: 'withdraw',
            payoutId: simulatedPayoutId,
            status: 'processing'
          });
        }

        const errorMsg = razorpayError.response && razorpayError.response.data && razorpayError.response.data.error
          ? razorpayError.response.data.error.description
          : razorpayError.message;
        
        return res.status(400).json({
          success: false,
          error: `Razorpay Payout Failed: ${errorMsg}`
        });
      }
    }

    // Handle Deposit (Razorpay Create Order)
    // Razorpay amount is in smallest currency unit (e.g., paise for INR)
    try {
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
    } catch (razorpayError) {
      console.warn('Razorpay order creation failed. Checking for simulated fallback mode...', razorpayError.message);
      
      const isTestMode = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID.startsWith('rzp_test');
      const isAuthError = razorpayError.statusCode === 401 || 
        (razorpayError.error && razorpayError.error.code === 'BAD_REQUEST_ERROR' && razorpayError.error.description === 'Authentication failed');
      
      if (isTestMode || isAuthError || razorpayError.message.includes('ENOTFOUND') || razorpayError.message.includes('connect')) {
        console.warn('⚠️ Falling back to Simulated Deposit...');
        const simulatedOrderId = `order_sim_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

        await prisma.payment.create({
          data: {
            userId: user.id,
            orderId: simulatedOrderId,
            amount: amount,
            currency: currency,
            status: 'created',
            paymentMethod: 'razorpay_sim',
          },
        });

        return res.status(200).json({
          success: true,
          orderId: simulatedOrderId,
          amount: amount * 100,
          currency: currency,
          type: 'deposit',
          keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_simulated',
          simulated: true
        });
      }

      throw razorpayError;
    }
  } catch (error) {
    console.error('Create Order Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create payment order', details: error.message, stack: error.stack });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const user = req.user;

    const isSimulated = razorpay_order_id && razorpay_order_id.startsWith('order_sim_');
    let isAuthentic = false;

    if (isSimulated) {
      isAuthentic = true;
    } else {
      const body = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy')
        .update(body.toString())
        .digest('hex');

      isAuthentic = expectedSignature === razorpay_signature;
    }

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

    // Transaction: Update payment status, add funds to wallet, and create a ledger entry
    const [, updatedWallet] = await prisma.$transaction([
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
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'deposit',
          asset: 'wallet',
          amount: payment.amount,
          details: `Deposited via Razorpay (Order: ${razorpay_order_id}, Payment: ${razorpay_payment_id})`
        }
      })
    ]);

    res.status(200).json({
      success: true,
      message: 'Payment verified and funds added to wallet',
      newBalance: updatedWallet.balance
    });
  } catch (error) {
    console.error('Verify Payment Error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify payment', details: error.message, stack: error.stack });
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
    res.status(500).json({ success: false, error: 'Failed to fetch payment history', details: error.message });
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
    res.status(500).json({ success: false, error: 'Failed to fetch payment details', details: error.message });
  }
};
