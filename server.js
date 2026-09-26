require('dotenv').config();

// ═══════════════════════════════════════════
// 🔍 DEBUG: Check which admin controller loads
// ═══════════════════════════════════════════
const path = require('path');
const fs = require('fs');
try {
  const controllerPath = path.join(__dirname, 'src', 'controllers', 'admin.controller.js');
  if (fs.existsSync(controllerPath)) {
    const stats = fs.statSync(controllerPath);
    console.log('══════════════════════════════════════════');
    console.log('🔍 ADMIN CONTROLLER FILE INFO:');
    console.log('   Path:', controllerPath);
    console.log('   Size:', stats.size, 'bytes');
    console.log('   Modified:', stats.mtime.toISOString());
    
    // Actual file me "Name,Role,Xiaomi" hai ya nahi?
    const content = fs.readFileSync(controllerPath, 'utf8');
    const hasRoleColumn = content.includes('Name,Role,Xiaomi');
    const hasRoleFilter = content.includes("role === 'ADMIN'");
    console.log('   ✅ Has "Name,Role,Xiaomi" header:', hasRoleColumn);
    console.log('   ✅ Has role filter logic:', hasRoleFilter);
    console.log('══════════════════════════════════════════');
  } else {
    console.error('❌ admin.controller.js NOT FOUND at:', controllerPath);
  }
} catch (err) {
  console.error('❌ Debug error:', err.message);
}

const app = require('./src/app');
const connectDB = require('./src/config/db');
const { startMidnightJob } = require('./src/jobs/midnightProcessor');
const { startDailyReminderJob } = require('./src/jobs/dailyReminder');
const { startStreakWarningJob } = require('./src/jobs/streakWarning');
const { startMeetupReminderJob } = require('./src/jobs/meetupReminder');
const { initBot, setWebhook } = require('./src/services/telegramBot.service');

const start = async () => {
  try {
    await connectDB();

    // ═══════════════════════════════════════════
    // START CRON JOBS
    // ═══════════════════════════════════════════
    startMidnightJob();
    startDailyReminderJob();
    startStreakWarningJob();
    startMeetupReminderJob();

    initBot();

    if (process.env.NODE_ENV === 'production') {
      const serverUrl = 'https://xfc-patna-backend.onrender.com';
      setTimeout(() => setWebhook(serverUrl), 5000);
    }

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

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

start();