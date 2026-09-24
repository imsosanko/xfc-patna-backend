const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  telegram_id: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  telegram_username: { 
    type: String, 
    default: '' 
  },
  first_name: { 
    type: String, 
    default: '' 
  },
  last_name: { 
    type: String, 
    default: '' 
  },
  profile_photo_url: { 
    type: String, 
    default: '' 
  },
  role: {
    type: String,
    enum: ['MEMBER', 'ADMIN', 'SUPER_ADMIN', 'VERIFIER', 'REPORT_ADMIN', 'SPECIAL_ADMIN'],
    default: 'MEMBER',
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'BLOCKED', 'SUSPENDED'],
    default: 'ACTIVE',
  },

  // ═══════════════════════════════════════════
  // NOTIFICATION PREFERENCES
  // ═══════════════════════════════════════════
  notification_preferences: {
    daily_reminder: {
      type: Boolean,
      default: true,
    },
    streak_alerts: {
      type: Boolean,
      default: true,
    },
    meetup_reminders: {
      type: Boolean,
      default: true,
    },
    activity_updates: {
      type: Boolean,
      default: true,
    },
    broadcasts: {
      type: Boolean,
      default: true,
    },
    points_updates: {
      type: Boolean,
      default: true,
    },
  },

  // ═══════════════════════════════════════════
  // STREAK BADGES
  // ═══════════════════════════════════════════
  badges: [
    {
      code: {
        type: String,
        required: true,
      },
      title: {
        type: String,
        required: true,
      },
      emoji: {
        type: String,
        default: '🏅',
      },
      streak_days: {
        type: Number,
        required: true,
      },
      earned_at: {
        type: Date,
        default: Date.now,
      },
      awarded_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null,
      },
    },
  ],

  // ═══════════════════════════════════════════
  // ADMIN ROLE BADGES (Staff/Team)
  // ═══════════════════════════════════════════
  admin_badges: [
    {
      code: {
        type: String,
        required: true,
      },
      title: {
        type: String,
        required: true,
      },
      emoji: {
        type: String,
        default: '🛡️',
      },
      color: {
        type: String,
        default: '#FF6900',
      },
      awarded_at: {
        type: Date,
        default: Date.now,
      },
      awarded_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null,
      },
      note: {
        type: String,
        default: '',
      },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);