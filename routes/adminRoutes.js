const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/delete-user', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required for deletion' });
  }

  try {
    const user = await prisma.user.findUnique({ 
      where: { email: email.toLowerCase() } 
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found in database' });
    }

    // Delete all related records in a transaction to prevent orphan records
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { userId: user.id } }),
      prisma.transaction.deleteMany({ where: { userId: user.id } }),
      prisma.position.deleteMany({ where: { userId: user.id } }),
      prisma.trade.deleteMany({ where: { userId: user.id } }),
      prisma.wallet.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } })
    ]);

    res.json({ success: true, message: 'User permanently deleted from database' });
  } catch (error) {
    console.error('Error deleting user from database:', error);
    res.status(500).json({ success: false, message: 'Database deletion failed', error: error.message });
  }
});

router.post('/kyc/update', async (req, res) => {
  const { userId, status } = req.body;
  try {
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { kycStatus: status }
    });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update KYC status', error: error.message });
  }
});

router.post('/kyc/delete', async (req, res) => {
  const { userId } = req.body;
  try {
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        kycDocument: null,
        kycDocName: null,
        kycDocType: null,
        kycUploadedAt: null,
        kycStatus: 'Pending'
      }
    });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete KYC document', error: error.message });
  }
});

router.post('/kyc/replace', async (req, res) => {
  const { userId, document, fileName, fileType } = req.body;
  try {
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        kycDocument: document,
        kycDocName: fileName,
        kycDocType: fileType,
        kycUploadedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        kycStatus: 'Submitted'
      }
    });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to replace KYC document', error: error.message });
  }
});

router.get('/users/sync', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          not: 'sandeepkumar.pikili@vrpigroup.co.in'
        }
      },
      include: {
        wallet: true,
        transactions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const clients = users.map(user => {
      const txs = user.transactions.map(t => ({
        id: 'TX-' + t.id,
        type: t.type?.toLowerCase() === 'deposit' ? 'deposit' : 
              t.type?.toLowerCase() === 'referral' ? 'referral' : 
              t.type?.toLowerCase() === 'refund' ? 'refund' : 'withdrawal',
        asset: t.asset || 'wallet',
        amount: t.amount,
        status: 'Completed',
        date: new Date(t.createdAt).toISOString().slice(0, 16).replace('T', ' ')
      }));

      return {
        id: 'CUST-' + user.id,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        phone: '',
        walletBalance: user.wallet?.balance || 0,
        holdings: { gold: 0, silver: 0, platinum: 0, iron: 0 },
        kycStatus: user.kycStatus || 'Pending',
        kycDocument: user.kycDocument ? {
          type: user.kycDocType,
          fileName: user.kycDocName,
          fileSize: 'Uploaded',
          uploadedAt: user.kycUploadedAt,
          fileData: user.kycDocument
        } : null,
        transactions: txs,
        referralCount: user.referralCount || 0
      };
    });

    res.json({ success: true, clients });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// GET /api/admin/withdrawals - Fetch all withdrawals
router.get('/withdrawals', async (req, res) => {
  try {
    const withdrawals = await prisma.payment.findMany({
      where: {
        paymentMethod: {
          contains: 'withdrawal'
        }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            wallet: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ success: true, withdrawals });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawals', error: error.message });
  }
});

// POST /api/admin/withdrawal/approve - Approve a pending withdrawal request
router.post('/withdrawal/approve', async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ success: false, message: 'Payment ID is required' });
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId }
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    if (payment.status !== 'processing') {
      return res.status(400).json({ success: false, message: `Withdrawal request already processed. Current status: ${payment.status}` });
    }

    // Update payment status to successful
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'successful' }
    });

    res.json({ success: true, payment: updatedPayment });
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({ success: false, message: 'Failed to approve withdrawal', error: error.message });
  }
});

// POST /api/admin/withdrawal/reject - Reject a pending withdrawal request (refunds user balance)
router.post('/withdrawal/reject', async (req, res) => {
  const { paymentId, rejectReason } = req.body;

  if (!paymentId) {
    return res.status(400).json({ success: false, message: 'Payment ID is required' });
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId }
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    if (payment.status !== 'processing') {
      return res.status(400).json({ success: false, message: `Withdrawal request already processed. Current status: ${payment.status}` });
    }

    // Run transaction to reject payout, refund wallet, and log refund ledger
    const [updatedPayment, updatedWallet, refundTx] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'failed' }
      }),
      prisma.wallet.update({
        where: { userId: payment.userId },
        data: { balance: { increment: payment.amount } }
      }),
      prisma.transaction.create({
        data: {
          userId: payment.userId,
          type: 'refund',
          asset: 'wallet',
          amount: payment.amount,
          details: `Withdrawal Rejected: Refunded ₹${payment.amount.toFixed(2)}${rejectReason ? ` (${rejectReason})` : ''}`
        }
      })
    ]);

    res.json({ success: true, payment: updatedPayment, refundTx });
  } catch (error) {
    console.error('Error rejecting withdrawal:', error);
    res.status(500).json({ success: false, message: 'Failed to reject withdrawal', error: error.message });
  }
});

// POST /api/admin/withdrawals/clear - Clear (delete) withdrawal requests from database
router.post('/withdrawals/clear', async (req, res) => {
  const { paymentIds } = req.body;

  if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
    return res.status(400).json({ success: false, message: 'paymentIds array is required' });
  }

  try {
    await prisma.payment.deleteMany({
      where: {
        id: {
          in: paymentIds
        }
      }
    });

    res.json({ success: true, message: `Successfully cleared ${paymentIds.length} withdrawal request(s)` });
  } catch (error) {
    console.error('Error clearing withdrawals:', error);
    res.status(500).json({ success: false, message: 'Failed to clear withdrawals', error: error.message });
  }
});

// GET /api/admin/platform-profit - Total fees + GST collected from all client trades
router.get('/platform-profit', async (req, res) => {
  try {
    // Sum fee and gst across all closed trades
    const result = await prisma.trade.aggregate({
      where: { status: 'closed' },
      _sum: { fee: true, gst: true }
    });

    const totalFees = result._sum.fee || 0;
    const totalGst = result._sum.gst || 0;
    const totalProfit = totalFees + totalGst;

    // Also get the count of closed trades (for context)
    const tradeCount = await prisma.trade.count({ where: { status: 'closed' } });

    res.json({ success: true, totalFees, totalGst, totalProfit, tradeCount });
  } catch (error) {
    console.error('Error fetching platform profit:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch platform profit', error: error.message });
  }
});

// Client-facing: Get withdrawal request status for a specific user
router.get('/my-withdrawals', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const withdrawals = await prisma.payment.findMany({
      where: {
        userId: user.id,
        paymentMethod: { in: ['upi_withdrawal', 'bank_withdrawal', 'upi_withdrawal_sim', 'bank_withdrawal_sim'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, withdrawals: withdrawals.map(w => ({
      id: w.id,
      orderId: w.orderId,
      amount: w.amount,
      method: w.paymentMethod,
      status: w.status, // 'processing' | 'successful' | 'failed'
      createdAt: w.createdAt
    }))});
  } catch (error) {
    console.error('Error fetching user withdrawals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

