const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: [
      'ACTIVITY_APPROVED',
      'ACTIVITY_REJECTED',
      'SPECIAL_CAMPAIGN',
      'MEETUP_REMINDER',
      'MEETUP_RSVP',
      'BROADCAST',
      'POINTS_ADJUSTED',
      'SYSTEM',
    ],
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // Telegram DM status
  telegram_sent: {
    type: Boolean,
    default: false,
  },
  telegram_error: {
    type: String,
    default: null,
  },
  telegram_message_id: {
    type: String,
    default: null,
  },
  // Read status
  is_read: {
    type: Boolean,
    default: false,
    index: true,
  },
  read_at: {
    type: Date,
    default: null,
  },
  // Sender info
  sent_by_admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
}, { timestamps: true });

// Indexes for fast queries
NotificationSchema.index({ member_id: 1, createdAt: -1 });
NotificationSchema.index({ member_id: 1, is_read: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);