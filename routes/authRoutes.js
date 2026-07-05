const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/validate', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ valid: false });
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        wallet: true,
        transactions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (user) {
      const totalReferralRewards = (user.referralCount || 0) * 10;
      const withdrawableBalance = Math.max(0, (user.wallet?.balance || 0) - totalReferralRewards);

      // Find last successful or processing bank withdrawal
      const lastWithdrawal = await prisma.payment.findFirst({
        where: {
          userId: user.id,
          paymentMethod: { in: ['bank_withdrawal', 'bank_withdrawal_sim'] },
          status: { in: ['processing', 'successful'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Find if there is any pending manual deposit for this user
      const pendingDeposit = await prisma.manualDeposit.findFirst({
        where: {
          userId: user.id,
          status: 'Pending'
        }
      });

      res.json({
        valid: true,
        referralCount: user.referralCount,
        isUnlocked: user.isUnlocked || user.referralCount >= 1,
        hasPendingUnlockDeposit: !!pendingDeposit,
        hasPendingDeposit: !!pendingDeposit,
        hasPendingWithdrawal: lastWithdrawal ? lastWithdrawal.status === 'processing' : false,
        walletBalance: user.wallet?.balance || 0,
        withdrawableBalance: withdrawableBalance,
        kycStatus: user.kycStatus || 'Pending',
        transactions: user.transactions || [],
        lockedBankDetails: lastWithdrawal ? {
          accountHolder: lastWithdrawal.accountHolder,
          bankName: lastWithdrawal.bankName,
          bankAccount: lastWithdrawal.bankAccount,
          ifsc: lastWithdrawal.ifsc
        } : null
      });
    } else {
      res.json({ valid: false });
    }
  } catch (error) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

router.post('/kyc/upload', async (req, res) => {
  try {
    const { email, kycDocument, kycDocName, kycDocType, kycUploadedAt } = req.body;
    if (!email || !kycDocument) {
      return res.status(400).json({ success: false, error: 'Email and document data are required' });
    }
    
    await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: {
        kycStatus: 'Submitted',
        kycDocument,
        kycDocName,
        kycDocType,
        kycUploadedAt
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/kyc/delete', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: {
        kycStatus: 'Pending',
        kycDocument: null,
        kycDocName: null,
        kycDocType: null,
        kycUploadedAt: null
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/delete-account', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Delete all related records in a transaction to prevent orphan records
    await prisma.$transaction([
      prisma.$executeRawUnsafe('DELETE FROM trades WHERE user_email = $1', user.email),
      prisma.$executeRawUnsafe('DELETE FROM contest_trades WHERE user_email = $1', user.email),
      prisma.$executeRawUnsafe('DELETE FROM contest_participants WHERE email = $1', user.email),
      prisma.payment.deleteMany({ where: { userId: user.id } }),
      prisma.transaction.deleteMany({ where: { userId: user.id } }),
      prisma.position.deleteMany({ where: { userId: user.id } }),
      prisma.trade.deleteMany({ where: { userId: user.id } }),
      prisma.wallet.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } })
    ]);

    res.json({ success: true, message: 'Account permanently deleted' });
  } catch (error) {
    console.error('Error in /delete-account route:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
