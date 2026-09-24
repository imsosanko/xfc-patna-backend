require('dotenv').config();
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
    startMidnightJob();        // 12:00 AM IST — Points processing
    startDailyReminderJob();   // 8:00 PM IST  — Daily activity reminder
    startStreakWarningJob();   // 9:00 PM IST  — Streak warnings + milestones
    startMeetupReminderJob();  // 8:00 AM + every 30 min — Meetup reminders

    // Initialize Telegram Bot
    initBot();

    // Auto-set webhook in production
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