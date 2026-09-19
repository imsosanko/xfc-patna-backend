const Notification = require('../models/Notification');
const { sendMessageToUser, sendBulkMessages } = require('./telegramBot.service');
const crypto = require('crypto');

// ═══════════════════════════════════════════
// SEND NOTIFICATION TO A SINGLE MEMBER
// ═══════════════════════════════════════════
const sendNotification = async ({
  memberId,
  telegramId,
  type,
  title,
  message,
  data = {},
  adminId = null,
  telegramOptions = {},
}) => {
  try {
    const notification = await Notification.create({
      member_id: memberId,
      type,
      title,
      message,
      data,
      sent_by_admin: adminId,
      telegram_sent: false,
    });

    if (telegramId) {
      const result = await sendMessageToUser(telegramId, message, telegramOptions);

      if (result.success) {
        notification.telegram_sent = true;
        notification.telegram_message_id = result.message_id;
      } else {
        notification.telegram_sent = false;
        notification.telegram_error = result.error;
      }
      await notification.save();
    }

    return { success: true, notification };
  } catch (error) {
    console.error('sendNotification error:', error.message);
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════
// BROADCAST TO MANY MEMBERS
// ═══════════════════════════════════════════
const broadcastNotification = async ({
  members,
  type = 'BROADCAST',
  title,
  message,
  data = {},
  adminId = null,
}) => {
  const broadcastId = crypto.randomUUID();

  const results = {
    total: members.length,
    notifications_created: 0,
    telegram_sent: 0,
    telegram_failed: 0,
    errors: [],
    broadcast_id: broadcastId,
  };

  if (members.length === 0) {
    return { success: true, ...results };
  }

  // Step 1: Bulk create DB records
  const notifications = members.map((m) => ({
    member_id: m._id,
    type,
    broadcast_id: broadcastId,
    title,
    message,
    data,
    sent_by_admin: adminId,
    telegram_sent: false,
  }));

  try {
    const created = await Notification.insertMany(notifications);
    results.notifications_created = created.length;

    // Step 2: Prepare Telegram messages
    const telegramMessages = members
      .filter((m) => m.telegram_id)
      .map((m) => ({
        telegramId: m.telegram_id,
        text: message,
        options: {},
      }));

    // Step 3: Send bulk DMs
    if (telegramMessages.length > 0) {
      const sendResults = await sendBulkMessages(telegramMessages, 50);
      results.telegram_sent = sendResults.sent;
      results.telegram_failed = sendResults.failed;
      results.errors = sendResults.errors;

      // Step 4: Update DB records for successfully sent
      const sentTelegramIds = members
        .filter((m) => m.telegram_id)
        .slice(0, sendResults.sent)
        .map((m) => m._id);

      if (sentTelegramIds.length > 0) {
        await Notification.updateMany(
          {
            member_id: { $in: sentTelegramIds },
            broadcast_id: broadcastId,
          },
          { $set: { telegram_sent: true } }
        );
      }
    }

    return { success: true, ...results };
  } catch (error) {
    console.error('broadcastNotification error:', error.message);
    return { success: false, error: error.message, ...results };
  }
};

// ═══════════════════════════════════════════
// HELPER: Format templates
// ═══════════════════════════════════════════

const formatActivityApproved = ({ activity, points, newTotal }) => ({
  title: '✅ Activity Approved',
  message: `✅ *Activity Approved*\n\nYour ${activity.platform} ${activity.activity_type} has been approved.\n\n+${Number(points).toFixed(2)} points awarded\nCurrent total: ${Number(newTotal).toFixed(2)} pts`,
  type: 'ACTIVITY_APPROVED',
  data: { activity_id: activity._id, points },
});

const formatActivityRejected = ({ activity, reason }) => ({
  title: '❌ Activity Rejected',
  message: `❌ *Activity Rejected*\n\nYour ${activity.platform} ${activity.activity_type} was rejected.\n\nReason: ${reason || 'Not specified'}`,
  type: 'ACTIVITY_REJECTED',
  data: { activity_id: activity._id, reason },
});

const formatSpecialCampaign = ({ campaign }) => ({
  title: '⭐ New Special Campaign',
  message: `⭐ *New Special Campaign!*\n\n*${campaign.title}*\n\n${(campaign.description || '').substring(0, 200)}\n\n🏆 ${campaign.special_points} points up for grabs!\n\nOpen the XFC Patna app to participate.`,
  type: 'SPECIAL_CAMPAIGN',
  data: { special_activity_id: campaign._id },
});

const formatMeetupReminder = ({ meetup, isTomorrow }) => ({
  title: isTomorrow ? '📅 Meetup Tomorrow' : '📅 Meetup Reminder',
  message: `📅 *Meetup ${isTomorrow ? 'Tomorrow' : 'Reminder'}!*\n\n*${meetup.title}*\n\n📍 ${meetup.venue}\n🕐 ${new Date(meetup.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}\n\nSee you there!`,
  type: 'MEETUP_REMINDER',
  data: { meetup_id: meetup._id },
});

const formatPointsAdjusted = ({ amount, reason, newTotal }) => ({
  title: amount > 0 ? '🎁 Points Added' : '⚠️ Points Deducted',
  message: `${amount > 0 ? '🎁' : '⚠️'} *Points ${amount > 0 ? 'Added' : 'Deducted'}*\n\n${amount > 0 ? '+' : ''}${Number(amount).toFixed(2)} points\nReason: ${reason}\n\nCurrent total: ${Number(newTotal).toFixed(2)} pts`,
  type: 'POINTS_ADJUSTED',
  data: { amount, reason },
});

module.exports = {
  sendNotification,
  broadcastNotification,
  formatActivityApproved,
  formatActivityRejected,
  formatSpecialCampaign,
  formatMeetupReminder,
  formatPointsAdjusted,
};