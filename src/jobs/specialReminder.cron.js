const cron = require('node-cron');
const SpecialActivity = require('../models/SpecialActivity');
const User = require('../models/User');
const notificationService = require('../services/notification.service');

// ═══════════════════════════════════════════
// HELPER: Check if date is "tomorrow" (IST)
// ═══════════════════════════════════════════
const isTomorrowIST = (targetDate) => {
  const now = new Date();
  const istNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );
  const tomorrow = new Date(istNow);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const target = new Date(
    new Date(targetDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );

  return (
    tomorrow.getFullYear() === target.getFullYear() &&
    tomorrow.getMonth() === target.getMonth() &&
    tomorrow.getDate() === target.getDate()
  );
};

// ═══════════════════════════════════════════
// HELPER: Send to all active members
// ═══════════════════════════════════════════
const broadcastToMembers = async (title, message, data = {}) => {
  const members = await User.find({
    role: 'MEMBER',
    status: 'ACTIVE',
    'notification_preferences.broadcasts': { $ne: false },
    telegram_id: { $exists: true, $ne: null },
  }).select('_id telegram_id first_name');

  let sent = 0;
  let failed = 0;

  for (const member of members) {
    try {
      await notificationService.sendNotification({
        memberId: member._id,
        telegramId: member.telegram_id,
        type: 'SPECIAL_ACTIVITY_REMINDER',
        title,
        message,
        data,
        adminId: null, // System notification
      });
      sent++;
    } catch (err) {
      failed++;
    }
  }

  return { sent, failed, total: members.length };
};

// ═══════════════════════════════════════════
// JOB 1: START DATE REMINDER (1 day before)
// Runs daily at 10:00 AM IST
// ═══════════════════════════════════════════
const sendStartReminders = async () => {
  console.log('\n🔔 [CRON] Checking start-date reminders...');

  try {
    const upcoming = await SpecialActivity.find({
      status: 'OPEN',
      reminder_start_sent: false,
    });

    let sentCount = 0;

    for (const activity of upcoming) {
      if (!isTomorrowIST(activity.start_date)) continue;

      const message = `🚀 *${activity.title}* starts TOMORROW!\n\n${
        activity.description || 'Get ready to participate!'
      }\n\n🏆 Points: ${activity.special_points}\n📅 Start: ${new Date(
        activity.start_date
      ).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })}\n\n👉 Open the app to see full details.`;

      const result = await broadcastToMembers(
        `${activity.title} starts tomorrow! 🚀`,
        message,
        { special_activity_id: activity._id }
      );

      activity.reminder_start_sent = true;
      await activity.save();

      sentCount++;
      console.log(
        `✅ Start reminder sent for "${activity.title}" (${result.sent}/${result.total})`
      );
    }

    console.log(`📊 Total start reminders sent: ${sentCount}`);
  } catch (error) {
    console.error('❌ Start reminder error:', error.message);
  }
};

// ═══════════════════════════════════════════
// JOB 2: END DATE REMINDER (1 day before)
// Runs daily at 10:00 AM IST
// ═══════════════════════════════════════════
const sendEndReminders = async () => {
  console.log('\n🔔 [CRON] Checking end-date reminders...');

  try {
    const ending = await SpecialActivity.find({
      status: 'OPEN',
      reminder_end_sent: false,
    });

    let sentCount = 0;

    for (const activity of ending) {
      if (!isTomorrowIST(activity.end_date)) continue;

      const message = `⏰ *Last Chance!*\n\n*${activity.title}* ends TOMORROW!\n\n📝 Don't miss your submission.\n🏆 Points: ${activity.special_points}\n📅 Deadline: ${new Date(
        activity.end_date
      ).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })}\n\n👉 Submit your links NOW!`;

      const result = await broadcastToMembers(
        `⏰ Last day for ${activity.title}!`,
        message,
        { special_activity_id: activity._id }
      );

      activity.reminder_end_sent = true;
      await activity.save();

      sentCount++;
      console.log(
        `✅ End reminder sent for "${activity.title}" (${result.sent}/${result.total})`
      );
    }

    console.log(`📊 Total end reminders sent: ${sentCount}`);
  } catch (error) {
    console.error('❌ End reminder error:', error.message);
  }
};

// ═══════════════════════════════════════════
// JOB 3: AUTO-CLOSE EXPIRED ACTIVITIES
// Runs every hour
// ═══════════════════════════════════════════
const autoCloseExpired = async () => {
  try {
    const now = new Date();

    const result = await SpecialActivity.updateMany(
      {
        status: 'OPEN',
        end_date: { $lt: now },
      },
      {
        $set: { status: 'CLOSED' },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `✅ [CRON] Auto-closed ${result.modifiedCount} expired special activities`
      );
    }
  } catch (error) {
    console.error('❌ Auto-close error:', error.message);
  }
};

// ═══════════════════════════════════════════
// START ALL CRONS
// ═══════════════════════════════════════════
const startSpecialReminders = () => {
  // Start + End reminders: Daily at 10:00 AM IST
  cron.schedule(
    '0 10 * * *',
    async () => {
      console.log(
        `\n🕙 [CRON] Special activity reminder job triggered at ${new Date().toLocaleString(
          'en-IN',
          { timeZone: 'Asia/Kolkata' }
        )}`
      );
      await sendStartReminders();
      await sendEndReminders();
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Auto-close expired: Every hour
  cron.schedule(
    '0 * * * *',
    async () => {
      await autoCloseExpired();
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('✅ Special activity reminder cron scheduled (10:00 AM IST daily)');
  console.log('✅ Auto-close expired special activities (every hour)');
};

module.exports = {
  startSpecialReminders,
  sendStartReminders,
  sendEndReminders,
  autoCloseExpired,
};