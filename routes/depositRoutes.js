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
    cb(null, 'uploads/');
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
    const { amount, utrNumber } = req.body;
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
        status: 'Pending'
      }
    });

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

        await tx.transaction.create({
          data: {
            userId: deposit.userId,
            type: 'deposit',
            asset: 'wallet',
            amount: deposit.amount,
            details: `Manual Deposit Approved (UTR: ${deposit.utrNumber})`
          }
        });
      });
    } else if (action === 'reject') {
      await prisma.manualDeposit.update({
        where: { id: deposit.id },
        data: { status: 'Rejected', execId: req.executive.id }
      });
    }

    res.json({ success: true, message: `Deposit ${action}d successfully` });
  } catch (error) {
    console.error('Deposit action error:', error);
    res.status(500).json({ success: false, error: 'Failed to process deposit' });
  }
});

module.exports = router;
