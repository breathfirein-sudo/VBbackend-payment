require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const chartRoutes = require('./routes/chartRoutes');
const tradeRoutes = require('./routes/tradeRoutes');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.FRONTEND_ORIGINS 
  ? process.env.FRONTEND_ORIGINS.split(',') 
  : ['http://localhost:5173', 'http://localhost:5174', 'https://invest-hour.com', 'https://www.invest-hour.com'];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
app.use('/', require('./routes/dbViewerRoutes'));

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});
setupSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
