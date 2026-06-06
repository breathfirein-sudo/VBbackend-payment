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
      where: { id: userId },
      data: { kycStatus: status }
    });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update KYC status', error: error.message });
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
        type: t.type?.toLowerCase() === 'deposit' ? 'deposit' : 'withdrawal',
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

module.exports = router;
