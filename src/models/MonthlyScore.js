const mongoose = require('mongoose');

const MonthlyScoreSchema = new mongoose.Schema({
  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  month: {
    type: String,
    required: true,
  }, // YYYY-MM
  total_points: {
    type: Number,
    default: 0,
  },
  special_points: {
    type: Number,
    default: 0,
  },
  regular_points: {
    type: Number,
    default: 0,
  },
  meetup_points: {        // ← NEW
    type: Number,
    default: 0,
  },
  manual_adjustments: {   // ← NEW (Feature 1 ke liye)
    type: Number,
    default: 0,
  },
  verified_activities: {
    type: Number,
    default: 0,
  },
  active_days: {
    type: Number,
    default: 0,
  },
  percentage: {
    type: Number,
    default: 0,
  },
  current_streak: {
    type: Number,
    default: 0,
  },
  longest_streak: {
    type: Number,
    default: 0,
  },
  first_activity_at: Date,
  last_activity_at: Date,
}, { timestamps: true });

MonthlyScoreSchema.index({ member_id: 1, month: 1 }, { unique: true });
MonthlyScoreSchema.index({ month: 1, total_points: -1 });

module.exports = mongoose.model('MonthlyScore', MonthlyScoreSchema);