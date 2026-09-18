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
  requirements: [
    {
      platform: { type: String, required: true },
      activity_type: { type: String, required: true },
      required_count: { type: Number, required: true },
      is_required: { type: Boolean, default: true },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('SpecialActivity', SpecialActivitySchema);