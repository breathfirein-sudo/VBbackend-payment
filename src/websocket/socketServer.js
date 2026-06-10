const jwt = require('jsonwebtoken');
const { JWT_SECRET = 'vb-demo-secret' } = process.env;

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function initSocketServer(io, marketEngine) {
  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const user = verifyToken(token);
    const clientId = user?.email || socket.id;

    socket.data.clientId = clientId;
    socket.join(clientId);

    marketEngine.registerClient(clientId);
    const clientState = marketEngine.getClientSnapshot(clientId);

    socket.emit('market:init', marketEngine.getMarketSnapshot());
    socket.emit('wallet:init', clientState.wallet);
    socket.emit('trade:init', {
      openTrades: clientState.openTrades,
      closedTrades: clientState.closedTrades,
      transactions: clientState.transactions,
    });

    socket.emit('connection:ready', {
      clientId,
      message: 'Connected to VB paper trading realtime engine',
    });

    socket.on('trade:execute', async (payload, callback) => {
      try {
        const trade = marketEngine.executeTrade(clientId, payload);
        callback?.({ success: true, trade });
      } catch (err) {
        callback?.({ success: false, error: err.message });
      }
    });

    socket.on('trade:close', (tradeId, callback) => {
      try {
        const trade = marketEngine.closeTrade(clientId, tradeId);
        if (!trade) throw new Error('Trade not found or already closed.');
        callback?.({ success: true, trade });
      } catch (err) {
        callback?.({ success: false, error: err.message });
      }
    });

    socket.on('demo:reset', (callback) => {
      const snapshot = marketEngine.resetClient(clientId);
      callback?.({ success: true, snapshot });
    });

    socket.on('disconnect', () => {
      // Keep the client state in memory for reconnects.
    });
  });

  marketEngine.on('market:update', (payload) => {
    io.emit('market:update', payload);
  });

  marketEngine.on('candle:update', (payload) => {
    io.emit('candle:update', payload);
  });

  marketEngine.on('trade:open', (payload) => {
    io.to(payload.clientId).emit('trade:open', payload);
  });

  marketEngine.on('trade:close', (payload) => {
    io.to(payload.clientId).emit('trade:close', payload);
  });

  marketEngine.on('wallet:update', (payload) => {
    io.to(payload.clientId).emit('wallet:update', payload);
  });

  marketEngine.on('pnl:update', (payload) => {
    io.to(payload.clientId).emit('pnl:update', payload);
  });
}

module.exports = { initSocketServer, verifyToken };
