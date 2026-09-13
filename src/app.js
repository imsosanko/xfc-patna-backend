const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Routes
const authRoutes = require('./routes/auth.routes');
const memberRoutes = require('./routes/member.routes');
const activityRoutes = require('./routes/activity.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');

// Middlewares
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// ============================
// SECURITY MIDDLEWARES
// ============================
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, Telegram)
    if (!origin) return callback(null, true);
    
    // Allow localhost, netlify, ngrok
    if (
      allowedOrigins.includes(origin) ||
      /\.netlify\.app$/.test(origin) ||
      /\.ngrok-free\.app$/.test(origin) ||
      /\.ngrok\.io$/.test(origin) ||
      origin.startsWith('http://localhost')
    ) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ============================
// BODY PARSING
// ============================
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ============================
// LOGGING
// ============================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ============================
// HEALTH CHECK
// ============================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'XFC Patna Backend',
    version: '1.0.0',
    time: new Date().toISOString(),
    timezone: process.env.TZ || 'Asia/Kolkata',
  });
});

// ============================
// API ROUTES
// ============================
app.use('/api/auth', authRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// ============================
// 404 HANDLER
// ============================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ============================
// GLOBAL ERROR HANDLER
// ============================
app.use(errorHandler);

module.exports = app;