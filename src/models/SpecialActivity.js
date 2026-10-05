const mongoose = require('mongoose');

const SpecialActivitySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  banner_url: {
    type: String,
    default: '',
  },

  // ═══════════════════════════════════════════
  // ✅ NEW: ACTIVITY TYPE (3 options)
  // ═══════════════════════════════════════════
  activity_type: {
    type: String,
    enum: ['NORMAL', 'MEETUP_LAUNCH_LINKED', 'MEETUP_LAUNCH_LABEL'],
    default: 'NORMAL',
    index: true,
  },
  // Only used when activity_type = 'MEETUP_LAUNCH_LINKED'
  linked_meetup_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meetup',
    default: null,
  },

  start_date: {
    type: Date,
    required: true,
  },
  end_date: {
    type: Date,
    required: true,
  },
  instructions: {
    type: String,
    default: '',
  },
  special_points: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'LOCKED', 'OPEN', 'PAUSED', 'CLOSED'],
    default: 'DRAFT',
    index: true,
  },
  approval_required: {
    type: Boolean,
    default: true,
  },
  member_editing_allowed: {
    type: Boolean,
    default: false,
  },
  count_toward_leaderboard: {
    type: Boolean,
    default: true,
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },

  // ═══════════════════════════════════════════
  // REQUIREMENTS (Per-platform tasks)
  // is_required = true → min platform (admin warning on approval)
  // required_count = custom (admin sets)
  // ═══════════════════════════════════════════
  requirements: [
    {
      platform: { type: String, required: true },
      activity_type: { type: String, required: true },
      required_count: { type: Number, required: true },
      is_required: { type: Boolean, default: true },
    },
  ],

  // ═══════════════════════════════════════════
  // REMINDER FLAGS (prevent duplicate notifications)
  // ═══════════════════════════════════════════
  reminder_start_sent: {
    type: Boolean,
    default: false,
  },
  reminder_end_sent: {
    type: Boolean,
    default: false,
  },

  // ═══════════════════════════════════════════
  // DENORMALIZED STATS (for speed)
  // ═══════════════════════════════════════════
  total_submissions: {
    type: Number,
    default: 0,
  },
  total_approved: {
    type: Number,
    default: 0,
  },
  total_rejected: {
    type: Number,
    default: 0,
  },
  total_pending: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Query indexes
SpecialActivitySchema.index({ status: 1, end_date: -1 });
SpecialActivitySchema.index({ start_date: -1 });
SpecialActivitySchema.index({ activity_type: 1, status: 1 });

module.exports = mongoose.model('SpecialActivity', SpecialActivitySchema);