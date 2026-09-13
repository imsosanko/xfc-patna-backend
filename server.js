require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { startMidnightJob } = require('./src/jobs/midnightProcessor');

const start = async () => {
  try {
    // ═══════════════════════════════════════════
    // MongoDB connect karo
    // ═══════════════════════════════════════════
    await connectDB();

    // ═══════════════════════════════════════════
    // Midnight Cron Job start karo
    // ═══════════════════════════════════════════
    startMidnightJob();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, '0.0.0.0', () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 XFC PATNA BACKEND STARTED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`📅 Timezone: ${process.env.TZ || 'Asia/Kolkata'}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ═══════════════════════════════════════════
// UNHANDLED REJECTIONS
// ═══════════════════════════════════════════
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
});

// ═══════════════════════════════════════════
// UNCAUGHT EXCEPTIONS
// ═══════════════════════════════════════════
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

start();