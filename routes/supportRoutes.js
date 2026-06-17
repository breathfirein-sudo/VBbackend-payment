const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'replace-with-your-secret';

// --- Executive Authentication Middleware ---
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
    if (!executive) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Executive not found' });
    }
    if (executive.status !== 'Active') {
      return res.status(403).json({ success: false, error: 'Forbidden: Executive account is inactive' });
    }
    req.executive = executive;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};

// --- Customer Authentication Middleware (using User table) ---
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

// ==========================================
// 1. EXECUTIVE AUTH & ACCOUNT MANAGEMENT
// ==========================================

// POST /api/auth/support/login - Log in executive
router.post('/auth/support/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const exec = await prisma.supportExecutive.findFirst({
      where: { email: email.trim().toLowerCase() }
    });

    if (!exec) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (exec.status !== 'Active') {
      return res.status(403).json({ success: false, error: 'Account is inactive. Contact Administrator.' });
    }

    const match = await bcrypt.compare(password, exec.password || '');
    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { isExecutive: true, id: exec.id, email: exec.email, name: exec.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      executive: {
        id: exec.id,
        name: exec.name,
        email: exec.email,
        phone: exec.phone,
        role: exec.role,
        shift: exec.shift,
        languages: exec.languages,
        rating: exec.rating,
        experienceYrs: exec.experienceYrs
      }
    });
  } catch (error) {
    console.error('Support login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error during login' });
  }
});

// GET /api/support/profile - Fetch executive details, rating and attendance logs
router.get('/support/profile', requireExecAuth, async (req, res) => {
  try {
    const exec = await prisma.supportExecutive.findUnique({
      where: { id: req.executive.id }
    });
    res.json({
      success: true,
      executive: {
        id: exec.id,
        name: exec.name,
        email: exec.email,
        phone: exec.phone,
        role: exec.role,
        shift: exec.shift,
        languages: exec.languages,
        rating: exec.rating,
        experienceYrs: exec.experienceYrs,
        attendance: JSON.parse(exec.attendance || '[]')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

// POST /api/support/profile/change-password - Change support executive password
router.post('/support/profile/change-password', requireExecAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Current password and new password are required' });
  }

  try {
    const exec = await prisma.supportExecutive.findUnique({ where: { id: req.executive.id } });
    const match = await bcrypt.compare(currentPassword, exec.password || '');
    if (!match) {
      return res.status(400).json({ success: false, error: 'Invalid current password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.supportExecutive.update({
      where: { id: exec.id },
      data: { password: hashedPassword }
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});


// ==========================================
// 2. ATTENDANCE CLOCK-IN / OUT SYSTEM
// ==========================================

// POST /api/support/attendance/clock-in - Clock in
router.post('/support/attendance/clock-in', requireExecAuth, async (req, res) => {
  try {
    const exec = await prisma.supportExecutive.findUnique({ where: { id: req.executive.id } });
    let logs = JSON.parse(exec.attendance || '[]');

    const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const alreadyClockedIn = logs.find(log => log.date === todayStr);

    if (alreadyClockedIn) {
      return res.status(400).json({ success: false, error: 'You have already clocked in for today.' });
    }

    const newLog = {
      date: todayStr,
      clockIn: new Date().toISOString(),
      clockOut: null,
      status: 'On Time'
    };
    logs.push(newLog);

    await prisma.supportExecutive.update({
      where: { id: exec.id },
      data: { attendance: JSON.stringify(logs) }
    });

    res.json({ success: true, log: newLog, attendance: logs });
  } catch (error) {
    console.error('Clock-in error:', error);
    res.status(500).json({ success: false, error: 'Failed to clock in' });
  }
});

// POST /api/support/attendance/clock-out - Clock out
router.post('/support/attendance/clock-out', requireExecAuth, async (req, res) => {
  try {
    const exec = await prisma.supportExecutive.findUnique({ where: { id: req.executive.id } });
    let logs = JSON.parse(exec.attendance || '[]');

    const todayStr = new Date().toISOString().slice(0, 10);
    const logIndex = logs.findIndex(log => log.date === todayStr);

    if (logIndex === -1) {
      return res.status(400).json({ success: false, error: 'No clock-in record found for today.' });
    }

    if (logs[logIndex].clockOut) {
      return res.status(400).json({ success: false, error: 'You have already clocked out for today.' });
    }

    logs[logIndex].clockOut = new Date().toISOString();

    await prisma.supportExecutive.update({
      where: { id: exec.id },
      data: { attendance: JSON.stringify(logs) }
    });

    res.json({ success: true, log: logs[logIndex], attendance: logs });
  } catch (error) {
    console.error('Clock-out error:', error);
    res.status(500).json({ success: false, error: 'Failed to clock out' });
  }
});


// ==========================================
// 3. CHAT COMMUNICATIONS (EXECUTIVE & USER)
// ==========================================

// GET /api/support/chats - Executive fetches all conversation threads grouped by user
router.get('/support/chats', requireExecAuth, async (req, res) => {
  try {
    // We group messages by userEmail. In Prisma, we will fetch all messages and group in JS.
    const allMsgs = await prisma.supportMessage.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const threadsMap = {};
    for (let msg of allMsgs) {
      if (!threadsMap[msg.userEmail]) {
        threadsMap[msg.userEmail] = {
          userEmail: msg.userEmail,
          lastText: msg.text,
          lastTime: msg.createdAt,
          messageCount: 0
        };
      }
      threadsMap[msg.userEmail].messageCount++;
    }

    const threads = Object.values(threadsMap).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
    res.json({ success: true, threads });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch chat threads' });
  }
});

// GET /api/support/chats/:userEmail - Executive fetches message history with a client
router.get('/support/chats/:userEmail', requireExecAuth, async (req, res) => {
  const { userEmail } = req.params;
  try {
    const messages = await prisma.supportMessage.findMany({
      where: { userEmail: userEmail.trim().toLowerCase() },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch conversation' });
  }
});

// POST /api/support/chats/send - Executive replies to a client
router.post('/support/chats/send', requireExecAuth, async (req, res) => {
  const { userEmail, text } = req.body;
  if (!userEmail || !text) {
    return res.status(400).json({ success: false, error: 'Recipient email and text are required' });
  }

  try {
    const message = await prisma.supportMessage.create({
      data: {
        sender: 'executive',
        userEmail: userEmail.trim().toLowerCase(),
        execId: req.executive.id,
        text
      }
    });

    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to dispatch reply' });
  }
});

// GET /api/user/chats - Customer fetches their own message history
router.get('/user/chats', requireUserAuth, async (req, res) => {
  try {
    const messages = await prisma.supportMessage.findMany({
      where: { userEmail: req.user.email.toLowerCase() },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load support history' });
  }
});

// POST /api/user/chats/send - Customer submits message to support queue
router.post('/user/chats/send', requireUserAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, error: 'Message content required' });
  }

  try {
    const message = await prisma.supportMessage.create({
      data: {
        sender: 'user',
        userEmail: req.user.email.toLowerCase(),
        text
      }
    });
    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to send support message' });
  }
});


// ==========================================
// 4. CALL REQUEST MANAGEMENT
// ==========================================

// GET /api/support/call-requests - Executive fetches open call requests
router.get('/support/call-requests', requireExecAuth, async (req, res) => {
  try {
    const requests = await prisma.callRequest.findMany({
      where: {
        status: { in: ['Pending', 'Connected'] }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch call requests' });
  }
});

// POST /api/support/call-requests/:id/status - Executive accepts/ends a call
router.post('/support/call-requests/:id/status', requireExecAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'Connected' or 'Closed'
  if (!status) {
    return res.status(400).json({ success: false, error: 'Status is required' });
  }

  try {
    const updated = await prisma.callRequest.update({
      where: { id: parseInt(id) },
      data: { status }
    });
    res.json({ success: true, request: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update call status' });
  }
});

// POST /api/user/call-request - Customer requests a callback
router.post('/user/call-request', requireUserAuth, async (req, res) => {
  try {
    // Register callback request
    const phone = req.user.phone || '';
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Please set up a phone number in your profile to request a call.' });
    }

    // Check if there is already an active/pending callback for this email
    const existing = await prisma.callRequest.findFirst({
      where: {
        userEmail: req.user.email.toLowerCase(),
        status: { in: ['Pending', 'Connected'] }
      }
    });

    if (existing) {
      return res.json({ success: true, message: 'You have already requested a callback. Support will reach out shortly.', request: existing });
    }

    const request = await prisma.callRequest.create({
      data: {
        userEmail: req.user.email.toLowerCase(),
        userName: req.user.name || req.user.email.split('@')[0],
        phone,
        status: 'Pending'
      }
    });

    res.json({ success: true, message: 'Callback requested successfully!', request });
  } catch (error) {
    console.error('Call request error:', error);
    res.status(500).json({ success: false, error: 'Failed to register callback request' });
  }
});

module.exports = router;
