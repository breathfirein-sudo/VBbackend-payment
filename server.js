require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const chartRoutes = require('./routes/chartRoutes');
const tradeRoutes = require('./routes/tradeRoutes');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);

// Allow all origins to prevent strict CORS blocking (safe since we use JWTs, not cookies)
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request timeout middleware (30s default, prevents hanging requests)
app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Health check endpoint (keeps Render from cold-starting)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Mount API routes
app.use('/api', chartRoutes);
app.use('/api', tradeRoutes);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/contest', require('./routes/contestRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/deposits', require('./routes/depositRoutes'));
app.use('/api', require('./routes/supportRoutes'));
app.use('/', require('./routes/dbViewerRoutes'));

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
setupSocket(io);

// Global error handling middleware (always returns JSON)
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
