const cron = require('node-cron');
const User = require('../models/User');
const MonthlyScore = require('../models/MonthlyScore');
const Activity = require('../models/Activity');
const SystemSetting = require('../models/SystemSetting');
const notificationService = require('../services/notification.service');
const {
  formatDateIST,
  getYesterdayIST,
  getStreakMilestone,
} = require('../services/points.service');

// ═══════════════════════════════════════════
// HELPER: Idempotency
// ═══════════════════════════════════════════
const hasRun = async (key) => {
  const record = await SystemSetting.findOne({ key });
  return !!record;
};

const markRun = async (key, stats) => {
  await SystemSetting.create({
    key,
    value: { run_at: new Date(), ...stats },
  });
};

// ═══════════════════════════════════════════
// PART A: Streak Break Warnings
// ═══════════════════════════════════════════
const sendStreakBreakWarnings = async () => {
  const today = formatDateIST();
  const yesterday = getYesterdayIST();
  const month = today.substring(0, 7);

  const lockKey = `streak_warning_sent_${today}`;
  if (await hasRun(lockKey)) {
    console.log('⚠️  Streak warnings already sent today');
    return { success: true, skipped: true };
  }

  try {
    const yesterdayActive = await Activity.distinct('member_id', {
      date: yesterday,
      status: 'APPROVED',
    });

    const members = await User.find({
      role: 'MEMBER',
      status: 'ACTIVE',
      'notification_preferences.streak_alerts': { $ne: false },
      _id: { $in: yesterdayActive },
    }).select('_id telegram_id first_name');

    let sent = 0;

    for (const member of members) {
      const score = await MonthlyScore.findOne({
        member_id: member._id,
        month,
      });

      if (
        score &&
        score.current_streak === 0 &&
        score.longest_streak >= 2
      ) {
        const template = notificationService.formatStreakWarning({
          name: member.first_name || 'Member',
          currentStreak: score.longest_streak,
          longestStreak: score.longest_streak,
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
      }
    }

    await markRun(lockKey, { sent, total: members.length });
    console.log(`✅ Streak break warnings sent: ${sent}`);
    return { success: true, sent };
  } catch (error) {
    console.error('Streak warning error:', error.message);
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════
// PART B: Streak Milestone Celebrations + Badge Award
// ═══════════════════════════════════════════
const sendStreakMilestones = async () => {
  const today = formatDateIST();
  const month = today.substring(0, 7);

  const lockKey = `streak_milestone_sent_${today}`;
  if (await hasRun(lockKey)) {
    console.log('⚠️  Streak milestones already sent today');
    return { success: true, skipped: true };
  }

  try {
    const todayActive = await Activity.distinct('member_id', {
      date: today,
      status: 'APPROVED',
    });

    const members = await User.find({
      role: 'MEMBER',
      status: 'ACTIVE',
      _id: { $in: todayActive },
    }).select('_id telegram_id first_name badges notification_preferences');

    let sent = 0;
    let badgesAwarded = 0;

    for (const member of members) {
      const score = await MonthlyScore.findOne({
        member_id: member._id,
        month,
      });

      if (!score) continue;

      // Milestone check (exact match)
      const milestone = getStreakMilestone(score.current_streak);
      if (!milestone) continue;

      // Check if badge already earned
      const alreadyHasBadge = (member.badges || []).some(
        (b) => b.code === milestone.badge
      );

      // Award badge if not already earned
      if (!alreadyHasBadge) {
        await User.findByIdAndUpdate(member._id, {
          $push: {
            badges: {
              code: milestone.badge,
              title: milestone.title,
              emoji: milestone.emoji,
              streak_days: milestone.days,
              earned_at: new Date(),
            },
          },
        });
        badgesAwarded++;
        console.log(`  🏅 Badge awarded: ${milestone.title} to ${member.first_name}`);
      }

      // Send notification (only if streak_alerts enabled)
      if (member.notification_preferences?.streak_alerts !== false) {
        const template = notificationService.formatStreakMilestone({
          name: member.first_name || 'Member',
          streak: score.current_streak,
        });

        const result = await notificationService.sendNotification({
          memberId: member._id,
          telegramId: member.telegram_id,
          type: template.type,
          title: template.title,
          message: template.message,
          data: { ...template.data, badge: milestone.badge },
        });

        if (result.success) sent++;
      }
    }

    await markRun(lockKey, { sent, badgesAwarded, total: members.length });
    console.log(`✅ Streak milestones sent: ${sent}`);
    console.log(`🏅 Badges awarded: ${badgesAwarded}`);
    return { success: true, sent, badgesAwarded };
  } catch (error) {
    console.error('Streak milestone error:', error.message);
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════
// COMBINED: Run Both
// ═══════════════════════════════════════════
const sendStreakAlerts = async () => {
  console.log('\n═══════════════════════════════════════════');
  console.log('🔥 STREAK ALERT JOB STARTED');
  console.log('═══════════════════════════════════════════');

  const warnings = await sendStreakBreakWarnings();
  const milestones = await sendStreakMilestones();

  console.log('═══════════════════════════════════════════\n');

  return {
    success: true,
    warnings,
    milestones,
  };
};

// ═══════════════════════════════════════════
// START CRON — Every day at 9:00 PM IST
// ═══════════════════════════════════════════
const startStreakWarningJob = () => {
  cron.schedule(
    '0 21 * * *',
    async () => {
      console.log('\n🕘 9 PM CRON TRIGGERED');
      await sendStreakAlerts();
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  console.log('✅ Streak warning cron scheduled (9:00 PM IST)');
};

module.exports = {
  startStreakWarningJob,
  sendStreakAlerts,
  sendStreakBreakWarnings,
  sendStreakMilestones,
};