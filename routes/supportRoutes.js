const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'replace-with-your-secret';
const { dispatchSupportRequest, resolveRequest, acceptRequest } = require('../services/supportDispatcher');

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
        experienceYrs: exec.experienceYrs,
        settings: exec.settings ? JSON.parse(exec.settings) : {}
      }
    });
  } catch (error) {
    console.error('Support login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error during login' });
  }
});

// GET /api/support/performance-report - Fetch real-time support executive performance report
router.get('/support/performance-report', requireExecAuth, async (req, res) => {
  try {
    const execId = req.executive.id;
    const exec = await prisma.supportExecutive.findUnique({
      where: { id: execId }
    });
    
    if (!exec) {
      return res.status(404).json({ success: false, error: 'Support executive not found' });
    }
    
    const logs = JSON.parse(exec.attendance || '[]');
    
    // 1. KPI Cards Calculations (System-wide calls, executive-specific chats/deposits/attendance)
    const callsResponded = await prisma.callRequest.count({
      where: { status: { in: ['Connected', 'Closed'] } }
    });

    const chatsClosed = await prisma.supportMessage.count({
      where: { execId: execId }
    });

    const depositsClosed = await prisma.manualDeposit.count({
      where: { execId: execId, status: { in: ['Approved', 'Rejected'] } }
    });

    const attendedDays = logs.length;

    // Response time based on rating
    const avgRespSecs = Math.round(180 - (exec.rating || 5.0) * 20);
    const avgRespMins = Math.floor(avgRespSecs / 60);
    const avgRespSecsRem = avgRespSecs % 60;
    const avgResponseTimeStr = `${avgRespMins < 10 ? '0' : ''}${avgRespMins}m ${avgRespSecsRem < 10 ? '0' : ''}${avgRespSecsRem}s`;

    // 2. 7-Day Performance Trend
    const trend = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date();
      targetDate.setDate(today.getDate() - i);
      const dayStr = targetDate.toISOString().slice(0, 10);
      
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      const dayCalls = await prisma.callRequest.count({
        where: {
          createdAt: { gte: startOfDay, lte: endOfDay }
        }
      });
      
      const dayChats = await prisma.supportMessage.count({
        where: {
          execId: execId,
          createdAt: { gte: startOfDay, lte: endOfDay }
        }
      });
      
      const dayDeposits = await prisma.manualDeposit.count({
        where: {
          execId: execId,
          updatedAt: { gte: startOfDay, lte: endOfDay },
          status: { in: ['Approved', 'Rejected'] }
        }
      });
      
      const dayAttended = logs.some(log => log.date === dayStr) ? 1 : 0;
      
      const label = targetDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      
      trend.push({
        date: label,
        calls: dayCalls,
        chats: dayChats,
        deposits: dayDeposits,
        attended: dayAttended
      });
    }

    // 3. Activity Distribution
    const totalActivities = callsResponded + chatsClosed + depositsClosed + attendedDays;
    const activityDistribution = {
      calls: totalActivities > 0 ? Math.round((callsResponded / totalActivities) * 100) : 25,
      chats: totalActivities > 0 ? Math.round((chatsClosed / totalActivities) * 100) : 25,
      deposits: totalActivities > 0 ? Math.round((depositsClosed / totalActivities) * 100) : 25,
      attendance: totalActivities > 0 ? Math.round((attendedDays / totalActivities) * 100) : 25
    };

    res.json({
      success: true,
      kpis: {
        callsResponded,
        chatsClosed,
        depositsClosed,
        attendedDays,
        avgResponseTime: avgResponseTimeStr,
        avgRespSecs
      },
      trend,
      activityDistribution
    });
  } catch (error) {
    console.error('Error generating performance report:', error);
    res.status(500).json({ success: false, error: 'Internal server error calculating metrics' });
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
        settings: exec.settings ? JSON.parse(exec.settings) : {},
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
    
    // Parse current settings and clear isTempPassword
    const currentSettings = exec.settings ? JSON.parse(exec.settings) : {};
    delete currentSettings.isTempPassword;

    await prisma.supportExecutive.update({
      where: { id: exec.id },
      data: { 
        password: hashedPassword,
        settings: JSON.stringify(currentSettings)
      }
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

// POST /api/support/profile/update - Update support executive details
router.post('/support/profile/update', requireExecAuth, async (req, res) => {
  const { name, phone, languages, settings } = req.body;
  try {
    const updated = await prisma.supportExecutive.update({
      where: { id: req.executive.id },
      data: {
        name: name || undefined,
        phone: phone || undefined,
        languages: languages || undefined,
        settings: settings ? (typeof settings === 'string' ? settings : JSON.stringify(settings)) : undefined
      }
    });

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      executive: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        shift: updated.shift,
        languages: updated.languages,
        rating: updated.rating,
        experienceYrs: updated.experienceYrs,
        settings: updated.settings ? JSON.parse(updated.settings) : {}
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    cb(null, true); // Allow any files
  }
});

// POST /api/support/upload - Upload chat attachments
router.post('/support/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload file: ' + error.message });
  }
});

// ==========================================
// 3. CHAT COMMUNICATIONS (EXECUTIVE & USER)
// ==========================================

const assignExecutive = async (roleType) => {
  const activeExecs = await prisma.supportExecutive.findMany({
    where: { 
      status: 'Active', 
      role: { in: [roleType, 'Both'] }
    }
  });
  if (activeExecs.length === 0) return null;
  return activeExecs[Math.floor(Math.random() * activeExecs.length)].id;
};

// GET /api/support/chats - Executive fetches all conversation threads grouped by user
router.get('/support/chats', requireExecAuth, async (req, res) => {
  try {
    const assignedSessions = await prisma.supportSession.findMany({
      where: { execId: req.executive.id }
    });
    const assignedEmails = assignedSessions.map(s => s.userEmail);

    const allMsgs = await prisma.supportMessage.findMany({
      where: { userEmail: { in: assignedEmails } },
      orderBy: { createdAt: 'desc' }
    });

    const threadsMap = {};
    for (let msg of allMsgs) {
      if (!threadsMap[msg.userEmail]) {
        const session = assignedSessions.find(s => s.userEmail === msg.userEmail);
        threadsMap[msg.userEmail] = {
          userEmail: msg.userEmail,
          lastText: msg.text,
          lastTime: msg.createdAt,
          messageCount: 0,
          sessionStatus: session ? session.status : 'Pending'
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

// POST /api/support/chats/accept - Executive accepts a chat
router.post('/support/chats/accept', requireExecAuth, async (req, res) => {
  const { userEmail } = req.body;
  try {
    const session = await prisma.supportSession.update({
      where: { userEmail: userEmail.trim().toLowerCase() },
      data: { status: 'Active' }
    });
    
    // Emit real-time event to the specific executive room or broadcast to all
    const io = req.app.get('io');
    if (io) {
      io.emit('chat_accepted', { userEmail: session.userEmail, execId: session.execId });
    }

    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to accept chat' });
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
  const { userEmail, text, mediaUrl } = req.body;
  if (!userEmail || (!text && !mediaUrl)) {
    return res.status(400).json({ success: false, error: 'Recipient email and message content or media are required' });
  }

  try {
    const message = await prisma.supportMessage.create({
      data: {
        sender: 'executive',
        userEmail: userEmail.trim().toLowerCase(),
        execId: req.executive.id,
        text: text || '',
        mediaUrl: mediaUrl || null
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('new_support_message', message);
    }

    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to dispatch reply' });
  }
});

// DELETE /api/support/chats/:userEmail - Resolve and end/clear conversation thread
router.delete('/support/chats/:userEmail', requireExecAuth, async (req, res) => {
  const { userEmail } = req.params;
  try {
    await prisma.supportMessage.deleteMany({
      where: { userEmail: userEmail.trim().toLowerCase() }
    });
    const session = await prisma.supportSession.update({
      where: { userEmail: userEmail.trim().toLowerCase() },
      data: { status: 'Resolved' }
    });
    const io = req.app.get('io');
    await resolveRequest(io, 'chat', session.id, userEmail.trim().toLowerCase(), req.executive.id);
    res.json({ success: true, message: 'Thread resolved and chat ended successfully' });
  } catch (error) {
    console.error('Resolve thread error:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve thread' });
  }
});

// GET /api/user/chats - Customer fetches their own message history
router.get('/user/chats', requireUserAuth, async (req, res) => {
  try {
    const messages = await prisma.supportMessage.findMany({
      where: { userEmail: req.user.email.toLowerCase() },
      orderBy: { createdAt: 'asc' }
    });

    const execIds = [...new Set(messages.filter(m => m.sender === 'executive' && m.execId).map(m => m.execId))];
    const executives = await prisma.supportExecutive.findMany({
      where: { id: { in: execIds } },
      select: { id: true, name: true }
    });

    const execMap = {};
    for (let ex of executives) {
      execMap[ex.id] = ex.name;
    }

    const messagesWithExec = messages.map(msg => ({
      ...msg,
      execName: msg.execId ? (execMap[msg.execId] || 'Support Agent') : null
    }));

    res.json({ success: true, messages: messagesWithExec });
  } catch (error) {
    console.error('Error fetching user chats:', error);
    res.status(500).json({ success: false, error: 'Failed to load support history' });
  }
});

// POST /api/user/chats/send - Customer submits message to support queue
router.post('/user/chats/send', requireUserAuth, async (req, res) => {
  const { text, mediaUrl } = req.body;
  if (!text && !mediaUrl) {
    return res.status(400).json({ success: false, error: 'Message content or media required' });
  }

  try {
    const userEmail = req.user.email.toLowerCase();
    
    let session = await prisma.supportSession.findUnique({ where: { userEmail } });
    const io = req.app.get('io');
    if (!session || session.status === 'Resolved') {
      if (session) {
        session = await prisma.supportSession.update({
          where: { userEmail },
          data: { status: 'Pending', execId: null, assignedAt: new Date() }
        });
      } else {
        session = await prisma.supportSession.create({
          data: { userEmail, status: 'Pending', execId: null, assignedAt: new Date() }
        });
      }
      
      await dispatchSupportRequest(io, 'chat', session.id, userEmail, req.user.name, req.user.phone);
    }

    const message = await prisma.supportMessage.create({
      data: {
        sender: 'user',
        userEmail,
        text: text || '',
        mediaUrl: mediaUrl || null
      }
    });

    if (io) {
      io.emit('new_support_message', message);
    }

    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to send support message' });
  }
});


// ==========================================
// 4. CALL REQUEST MANAGEMENT
// ==========================================

// GET /api/support/call-requests - Executive fetches all call requests
router.get('/support/call-requests', requireExecAuth, async (req, res) => {
  try {
    const requests = await prisma.callRequest.findMany({
      where: { execId: req.executive.id },
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
    if (status === 'Closed') {
      const io = req.app.get('io');
      await resolveRequest(io, 'call', updated.id, updated.userEmail, req.executive.id);
    }
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

    const io = req.app.get('io');
    const request = await prisma.callRequest.create({
      data: {
        userEmail: req.user.email.toLowerCase(),
        userName: req.user.name || req.user.email.split('@')[0],
        phone,
        execId: null,
        status: 'Pending'
      }
    });

    await dispatchSupportRequest(io, 'call', request.id, request.userEmail, request.userName, phone);

    res.json({ success: true, message: 'Callback requested successfully!', request });
  } catch (error) {
    console.error('Call request error:', error);
    res.status(500).json({ success: false, error: 'Failed to register callback request' });
  }
});

module.exports = router;
