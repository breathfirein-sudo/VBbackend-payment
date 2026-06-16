const { io } = require('socket.io-client');

const SOCKET_URL = 'http://localhost:5000';
console.log(`Connecting to Socket.IO server at ${SOCKET_URL}...`);
const socket = io(SOCKET_URL);

socket.on('connect', () => {
  console.log(`Connected! Socket ID: ${socket.id}`);
  
  console.log("Emitting 'subscribe_interval' for TSLA on 1m...");
  socket.emit('subscribe_interval', { symbol: 'TSLA', interval: '1m' });
});

socket.on('live_candle', (candle) => {
  console.log('Received live_candle:', {
    time: new Date(candle.time * 1000).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.value
  });
});

socket.on('connect_error', (error) => {
  console.error('Connection Error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  process.exit();
});

// Run for 30 seconds, then exit
setTimeout(() => {
  console.log('Test completed. Closing connection...');
  socket.disconnect();
}, 30000);
