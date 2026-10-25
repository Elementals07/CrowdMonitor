const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');

// Load environment variables from the project root .env
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { getDb } = require('./db');
const { setIo } = require('./lib/events');
const { startMqtt } = require('./mqtt');

const occupancyRouter = require('./routes/occupancy');
const analyticsRouter = require('./routes/analytics');
const sessionsRouter = require('./routes/sessions');
const alertsRouter = require('./routes/alerts');
const reportsRouter = require('./routes/reports');
const settingsRouter = require('./routes/settings');
const publicRouter = require('./routes/public');

// Initialize database instance and run migrations
try {
  getDb();
} catch (err) {
  console.error('[Startup] Failed to initialize SQLite database:', err);
  process.exit(1);
}

const app = express();

// Set up CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or allowed origins
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in development
  },
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// API health endpoint (available at /api/health and /health)
const healthHandler = (req, res) => {
  return res.json({
    ok: true,
    uptime: process.uptime(),
    ts: Date.now()
  });
};
app.get('/api/health', healthHandler);
app.get('/health', healthHandler);

// Mount API routes
app.use('/api/public', publicRouter);
app.use('/api/occupancy', occupancyRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);

// Fallback 404 for unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    data: null,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
    meta: { timestamp: Date.now() }
  });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled route error:', err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(500).json({
    data: null,
    error: err.message || 'Internal server error',
    meta: { timestamp: Date.now() }
  });
});

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Register Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`);
  });
});

// Inject Socket.IO instance into broadcaster
setIo(io);

// Start MQTT client
startMqtt(io);

// Global unhandled error logging
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Server] CrowdMonitor backend listening on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
});
