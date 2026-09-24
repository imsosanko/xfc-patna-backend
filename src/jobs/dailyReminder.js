const cron = require('node-cron');
const User = require('../models/User');
const MonthlyScore = require('../models/MonthlyScore');
const Activity = require('../models/Activity');
const SystemSetting = require('../models/SystemSetting');
const notificationService = require('../services/notification.service');
const { formatDateIST } = require('../services/points.service');

// ═══════════════════════════════════════════
// HELPER: Check if already sent today
// ═══════════════════════════════════════════
const hasSentToday = async (dateStr) => {
  const key = `daily_reminder_sent_${dateStr}`;
  const record = await SystemSetting.findOne({ key });
  return !!record;
};

const markSent = async (dateStr, stats) => {
  const key = `daily_reminder_sent_${dateStr}`;
  await SystemSetting.create({
    key,
    value: {
      sent_at: new Date(),
      ...stats,
    },
  });
};

// ═══════════════════════════════════════════
// MAIN: Send Daily Reminders
// ═══════════════════════════════════════════
const sendDailyReminders = async () => {
  console.log('\n═══════════════════════════════════════════');
  console.log('📝 DAILY REMINDER JOB STARTED');
  console.log('═══════════════════════════════════════════');

  const today = formatDateIST();
  const month = today.substring(0, 7);

  try {
    if (await hasSentToday(today)) {
      console.log('⚠️  Already sent today. Skipping.');
      return { success: true, skipped: true };
    }

    const todayActiveMemberIds = await Activity.distinct('member_id', {
      date: today,
      status: { $in: ['PENDING', 'APPROVED'] },
    });

    const members = await User.find({
      role: 'MEMBER',
      status: 'ACTIVE',
      'notification_preferences.daily_reminder': { $ne: false },
      _id: { $nin: todayActiveMemberIds },
    }).select('_id telegram_id first_name notification_preferences');

    console.log(`📊 Members to remind: ${members.length}`);

    if (members.length === 0) {
      await markSent(today, { sent: 0, failed: 0, total: 0 });
      return { success: true, sent: 0, total: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const member of members) {
      if (!member.telegram_id) continue;

      const score = await MonthlyScore.findOne({
        member_id: member._id,
        month,
      });

      const template = notificationService.formatDailyReminder({
        name: member.first_name || 'Member',
        currentPoints: score?.total_points || 0,
        streak: score?.current_streak || 0,
      });

      const result = await notificationService.sendNotification({
        memberId: member._id,
        telegramId: member.telegram_id,
        type: template.type,
        title: template.title,
        message: template.message,
        data: template.data,
      });

      if (result.success) sent++;
      else failed++;
    }

    await markSent(today, { sent, failed, total: members.length });

    console.log(`✅ Sent: ${sent} | ❌ Failed: ${failed}`);
    console.log('═══════════════════════════════════════════\n');

    return { success: true, sent, failed, total: members.length };
  } catch (error) {
    console.error('❌ Daily reminder error:', error.message);
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════
// START CRON — Every day at 8:00 PM IST
// ═══════════════════════════════════════════
const startDailyReminderJob = () => {
  cron.schedule(
    '0 20 * * *',
    async () => {
      console.log('\n🕐 8 PM CRON TRIGGERED');
      await sendDailyReminders();
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  console.log('✅ Daily reminder cron scheduled (8:00 PM IST)');
};

module.exports = { startDailyReminderJob, sendDailyReminders };