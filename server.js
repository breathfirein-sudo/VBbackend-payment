const express = require('express');
const http = require('http');
const cors = require('cors');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { MarketEngine } = require('./src/engine/marketEngine');
const { initSocketServer } = require('./src/websocket/socketServer');
const { prisma } = require('./src/prisma/client');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 300;
const requestCounts = new Map();
const tokenStore = new Map();

function simpleRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = requestCounts.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  entry.count += 1;
  requestCounts.set(ip, entry);

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests from this IP, please try again later.' });
  }

  return next();
}
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173').split(',');

app.use(cors({
  origin: FRONTEND_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST'],
}));
app.use(express.json());
app.use(simpleRateLimiter);

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authorization token missing.' });
  }

  const session = tokenStore.get(token);
  if (!session || session.expiresAt < Date.now()) {
    tokenStore.delete(token);
    return res.status(401).json({ error: 'Invalid or expired authorization token.' });
  }

  req.user = { email: session.email };
  return next();
}

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'VB Commodities Paper Trading Engine',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required for demo login.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  tokenStore.set(token, {
    email,
    expiresAt: Date.now() + 4 * 60 * 60 * 1000,
  });

  return res.json({
    success: true,
    token,
    user: {
      email,
      name: email.split('@')[0],
      demo: true,
    },
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.post('/api/demo/reset', authenticateToken, (req, res) => {
  const clientId = req.user.email;
  const snapshot = marketEngine.resetClient(clientId);
  return res.json({ success: true, snapshot });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

const marketEngine = new MarketEngine();
initSocketServer(io, marketEngine);
marketEngine.start();

httpServer.listen(PORT, async () => {
  console.log(`\n🚀 VB paper trading backend running on http://localhost:${PORT}`);
  console.log('✅ Socket.IO ready for live market updates, trades, and wallet events.');
  console.log('👉 Login endpoint: http://localhost:' + PORT + '/api/auth/login');
  console.log('👉 Demo reset endpoint: http://localhost:' + PORT + '/api/demo/reset');
  console.log('======================================================\n');
});

httpServer.on('error', (err) => {
  console.error('[Server] Fatal error starting HTTP server:', err);
  process.exit(1);
});
