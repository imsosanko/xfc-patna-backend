require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const start = async () => {
  try {
    // MongoDB connect karo
    await connectDB();

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

// Unhandled rejections handle karo
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
});

// Uncaught exceptions handle karo
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

start();