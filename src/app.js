const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Routes
const authRoutes = require('./routes/auth.routes');
const memberRoutes = require('./routes/member.routes');
const activityRoutes = require('./routes/activity.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const adminRoutes = require('./routes/admin.routes');
const specialRoutes = require('./routes/special.routes');
const telegramRoutes = require('./routes/telegram.routes');
const meetupRoutes = require('./routes/meetup.routes');
const userRoutes = require('./routes/user.routes'); // ← NEW

// Middlewares
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Security
app.use(helmet());

// CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      /\.netlify\.app$/.test(origin) ||
      /\.vercel\.app$/.test(origin) ||
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

// Body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'XFC Patna Backend',
    version: '1.0.0',
    time: new Date().toISOString(),
    timezone: process.env.TZ || 'Asia/Kolkata',
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/special-activities', specialRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/meetups', meetupRoutes);
app.use('/api/user', userRoutes); // ← NEW

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Error handler
app.use(errorHandler);

module.exports = app;