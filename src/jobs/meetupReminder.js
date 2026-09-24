const cron = require('node-cron');
const Meetup = require('../models/Meetup');
const MeetupRSVP = require('../models/MeetupRSVP');
const User = require('../models/User');
const notificationService = require('../services/notification.service');

// ═══════════════════════════════════════════
// HELPER: Get RSVP'd members with preferences
// ═══════════════════════════════════════════
const getRSVPMembers = async (meetupId) => {
  const rsvps = await MeetupRSVP.find({
    meetup_id: meetupId,
    rsvp_status: 'INTERESTED',
  }).populate('member_id', 'first_name telegram_id notification_preferences status');

  return rsvps
    .filter((r) => r.member_id && r.member_id.telegram_id)
    .filter((r) => r.member_id.status === 'ACTIVE')
    .filter(
      (r) =>
        r.member_id.notification_preferences?.meetup_reminders !== false
    )
    .map((r) => r.member_id);
};

// ═══════════════════════════════════════════
// PART A: Send 1-Day-Before Reminder
// Runs at 8:00 AM — meetups tomorrow
// ═══════════════════════════════════════════
const sendDayBeforeReminders = async () => {
  console.log('\n📅 Checking meetups for tomorrow...');

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const meetups = await Meetup.find({
      date: { $gte: tomorrow, $lt: dayAfter },
      status: { $in: ['PUBLISHED', 'ONGOING'] },
    });

    console.log(`Found ${meetups.length} meetups tomorrow`);

    let totalSent = 0;

    for (const meetup of meetups) {
      const members = await getRSVPMembers(meetup._id);
      console.log(`  → "${meetup.title}" — ${members.length} RSVPs`);

      const template = notificationService.formatMeetupReminder({
        meetup,
        isTomorrow: true,
      });

      for (const member of members) {
        const result = await notificationService.sendNotification({
          memberId: member._id,
          telegramId: member.telegram_id,
          type: template.type,
          title: template.title,
          message: template.message,
          data: template.data,
        });
        if (result.success) totalSent++;
      }
    }

    console.log(`✅ Day-before reminders sent: ${totalSent}`);
    return { success: true, sent: totalSent };
  } catch (error) {
    console.error('Day-before reminder error:', error.message);
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════
// PART B: Send 2-Hour-Before Urgent Reminder
// Runs every 30 min — checks meetups in 1.5-2.5 hrs
// ═══════════════════════════════════════════
const sendUrgentReminders = async () => {
  try {
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoAndHalfHours = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);

    // Meetups between 2 and 2.5 hours from now
    const meetups = await Meetup.find({
      date: { $gte: twoHoursLater, $lt: twoAndHalfHours },
      status: { $in: ['PUBLISHED', 'ONGOING'] },
    });

    if (meetups.length === 0) return { success: true, sent: 0 };

    console.log(`\n🚨 Found ${meetups.length} meetups in ~2 hours`);

    let totalSent = 0;

    for (const meetup of meetups) {
      const members = await getRSVPMembers(meetup._id);
      if (members.length === 0) continue;

      console.log(`  → "${meetup.title}" — ${members.length} members`);

      const template = notificationService.formatMeetupUrgent({ meetup });

      for (const member of members) {
        const result = await notificationService.sendNotification({
          memberId: member._id,
          telegramId: member.telegram_id,
          type: template.type,
          title: template.title,
          message: template.message,
          data: template.data,
        });
        if (result.success) totalSent++;
      }
    }

    console.log(`✅ Urgent reminders sent: ${totalSent}`);
    return { success: true, sent: totalSent };
  } catch (error) {
    console.error('Urgent reminder error:', error.message);
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════
// START CRONS
// ═══════════════════════════════════════════
const startMeetupReminderJob = () => {
  // Day-before: Every day at 8:00 AM IST
  cron.schedule(
    '0 8 * * *',
    async () => {
      console.log('\n🕗 8 AM CRON — Meetup day-before reminders');
      await sendDayBeforeReminders();
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Urgent: Every 30 minutes
  cron.schedule(
    '*/30 * * * *',
    async () => {
      await sendUrgentReminders();
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('✅ Meetup reminder crons scheduled');
  console.log('   ├─ Day-before: 8:00 AM IST');
  console.log('   └─ 2-hour-before: Every 30 min');
};

module.exports = {
  startMeetupReminderJob,
  sendDayBeforeReminders,
  sendUrgentReminders,
};