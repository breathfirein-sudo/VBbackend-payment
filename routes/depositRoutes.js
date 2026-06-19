const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'replace-with-your-secret';

const requireUserAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.isExecutive) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access restricted to clients' });
    }
    const user = await prisma.user.findUnique({
      where: { email: decoded.email.toLowerCase() }
    });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};

const requireExecAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isExecutive) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access restricted to support staff' });
    }
    const executive = await prisma.supportExecutive.findUnique({
      where: { id: decoded.id }
    });
    if (!executive || executive.status !== 'Active') {
      return res.status(401).json({ success: false, error: 'Unauthorized: Executive not found or inactive' });
    }
    req.executive = executive;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const fs = require('fs');
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// User submits manual deposit
router.post('/submit', requireUserAuth, upload.single('screenshot'), async (req, res) => {
  try {
    const { amount, utrNumber, paymentMethod } = req.body;
    if (!amount || !utrNumber) {
      return res.status(400).json({ success: false, error: 'Amount and UTR number are required' });
    }

    const existing = await prisma.manualDeposit.findUnique({ where: { utrNumber } });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Deposit with this UTR already exists' });
    }

    let screenshotUrl = null;
    if (req.file) {
      screenshotUrl = `/uploads/${req.file.filename}`;
    }

    const deposit = await prisma.manualDeposit.create({
      data: {
        userId: req.user.id,
        amount: parseFloat(amount),
        utrNumber,
        screenshotUrl,
        status: 'Pending',
        paymentMethod: paymentMethod || 'UPI'
      }
    });

    // Automatically post the manual deposit to the user's support chat
    try {
      await prisma.supportMessage.create({
        data: {
          sender: 'user',
          userEmail: req.user.email.toLowerCase(),
          text: `Manual Deposit Submitted: ₹${amount} via ${paymentMethod || 'UPI'}. UTR: ${utrNumber}`,
          mediaUrl: screenshotUrl
        }
      });
    } catch (chatErr) {
      console.error('Failed to auto-create support message for deposit:', chatErr);
    }

    res.json({ success: true, deposit });
  } catch (error) {
    console.error('Manual deposit submit error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit deposit' });
  }
});

// Exec gets all pending manual deposits
router.get('/pending', requireExecAuth, async (req, res) => {
  try {
    const deposits = await prisma.manualDeposit.findMany({
      where: { status: 'Pending' },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ success: true, deposits });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch deposits' });
  }
});

// Exec gets all manual deposits (with filters, search, pagination, and KPI metrics)
router.get('/list', requireExecAuth, async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {};
    if (status && status !== 'All Status') {
      whereClause.status = status;
    }
    
    if (search) {
      const searchTrim = search.trim();
      whereClause.OR = [
        { utrNumber: { contains: searchTrim, mode: 'insensitive' } },
        { user: { email: { contains: searchTrim, mode: 'insensitive' } } },
        { user: { name: { contains: searchTrim, mode: 'insensitive' } } },
        { user: { phone: { contains: searchTrim, mode: 'insensitive' } } }
      ];
    }

    const deposits = await prisma.manualDeposit.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
        reviewedBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.manualDeposit.count({ where: whereClause });

    // Calculate metrics for ALL manual deposits in the system
    const allDeposits = await prisma.manualDeposit.findMany({
      select: {
        amount: true,
        status: true,
        paymentMethod: true
      }
    });

    let totalRequests = allDeposits.length;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let totalAmountApproved = 0;
    let totalAmountPending = 0;
    let totalAmountRejected = 0;

    // Payment method distribution
    const methodSummary = {
      'UPI': 0,
      'Bank Transfer': 0,
      'Net Banking': 0,
      'Wallet': 0,
      'Others': 0
    };

    allDeposits.forEach(d => {
      // Status counting
      if (d.status === 'Pending') {
        pendingCount++;
        totalAmountPending += d.amount;
      } else if (d.status === 'Approved') {
        approvedCount++;
        totalAmountApproved += d.amount;
      } else if (d.status === 'Rejected') {
        rejectedCount++;
        totalAmountRejected += d.amount;
      }

      // Method distribution
      const method = d.paymentMethod || 'UPI';
      if (methodSummary[method] !== undefined) {
        methodSummary[method] += d.amount;
      } else {
        methodSummary['Others'] += d.amount;
      }
    });

    // Recent activity (latest 5 deposits)
    const recentActivityRaw = await prisma.manualDeposit.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } }
      }
    });

    const recentActivity = recentActivityRaw.map(act => ({
      id: act.id,
      name: act.user?.name || act.user?.email || 'Customer',
      amount: act.amount,
      status: act.status,
      time: act.createdAt
    }));

    res.json({
      success: true,
      deposits,
      total,
      metrics: {
        totalRequests,
        pendingCount,
        approvedCount,
        rejectedCount,
        totalAmountApproved,
        totalAmountPending,
        totalAmountRejected,
        methodSummary,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Fetch all deposits error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch deposits' });
  }
});

// Exec approves/rejects a deposit
router.post('/:id/action', requireExecAuth, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'approve' or 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Invalid action' });
  }

  try {
    const deposit = await prisma.manualDeposit.findUnique({ where: { id: parseInt(id) } });
    if (!deposit) {
      return res.status(404).json({ success: false, error: 'Deposit not found' });
    }
    if (deposit.status !== 'Pending') {
      return res.status(400).json({ success: false, error: `Deposit is already ${deposit.status}` });
    }

    if (action === 'approve') {
      await prisma.$transaction(async (tx) => {
        await tx.manualDeposit.update({
          where: { id: deposit.id },
          data: { status: 'Approved', execId: req.executive.id }
        });

        const user = await tx.user.findUnique({ where: { id: deposit.userId } });

        if (deposit.amount === 10) {
          // Treat as vault unlock fee
          if (user) {
            await tx.user.update({
              where: { id: deposit.userId },
              data: { isUnlocked: true }
            });
          }
          await tx.transaction.create({
            data: {
              userId: deposit.userId,
              type: 'unlock_fee',
              asset: 'wallet',
              amount: deposit.amount,
              details: `Account unlocked via manual fee payment (UTR: ${deposit.utrNumber})`
            }
          });
        } else {
          // Regular deposit
          const wallet = await tx.wallet.findUnique({ where: { userId: deposit.userId } });
          if (wallet) {
            await tx.wallet.update({
              where: { userId: deposit.userId },
              data: { balance: { increment: deposit.amount } }
            });
          } else {
            await tx.wallet.create({
              data: { userId: deposit.userId, balance: deposit.amount }
            });
          }

          if (user && !user.isUnlocked) {
            await tx.user.update({
              where: { id: deposit.userId },
              data: { isUnlocked: true }
            });
          }

          await tx.transaction.create({
            data: {
              userId: deposit.userId,
              type: 'deposit',
              asset: 'wallet',
              amount: deposit.amount,
              details: `Manual Deposit Approved (UTR: ${deposit.utrNumber})`
            }
          });
        }

        // Post confirmation message to support chat
        if (user) {
          await tx.supportMessage.create({
            data: {
              sender: 'executive',
              userEmail: user.email.toLowerCase(),
              execId: req.executive.id,
              text: `✅ Deposit of ₹${deposit.amount} Approved! ${deposit.amount === 10 ? 'Account unlocked successfully.' : 'Wallet balance updated.'}`
            }
          });
        }
      });
    } else if (action === 'reject') {
      await prisma.$transaction(async (tx) => {
        await tx.manualDeposit.update({
          where: { id: deposit.id },
          data: { status: 'Rejected', execId: req.executive.id }
        });
        const user = await tx.user.findUnique({ where: { id: deposit.userId } });
        if (user) {
          await tx.supportMessage.create({
            data: {
              sender: 'executive',
              userEmail: user.email.toLowerCase(),
              execId: req.executive.id,
              text: `❌ Deposit of ₹${deposit.amount} Rejected. Please contact support or submit a valid receipt.`
            }
          });
        }
      });
    }

    res.json({ success: true, message: `Deposit ${action}d successfully` });
  } catch (error) {
    console.error('Deposit action error:', error);
    res.status(500).json({ success: false, error: 'Failed to process deposit' });
  }
});

module.exports = router;
