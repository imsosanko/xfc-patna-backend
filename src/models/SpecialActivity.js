const mongoose = require('mongoose');

const SpecialActivitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  banner_url: { type: String, default: '' },
  start_date: { type: Date, required: true },
  end_date: { type: Date, required: true },
  instructions: { type: String, default: '' },
  special_points: { type: Number, default: 0 },
  
  // ✅ NEW: Total minimum links required (Mix of any platform)
  min_total_links: { type: Number, default: 1 },
  
  // Purana array, safety ke liye rakh rahe hain (khali rahega ab)
  requirements: [{
    platform: String,
    activity_type: String,
    required_count: Number,
    is_required: Boolean,
  }],

  approval_required: { type: Boolean, default: true },
  member_editing_allowed: { type: Boolean, default: false },
  count_toward_leaderboard: { type: Boolean, default: true },
  activity_type: { type: String, default: 'NORMAL' },
  linked_meetup_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Meetup', default: null },
  status: { type: String, enum: ['DRAFT', 'LOCKED', 'OPEN', 'PAUSED', 'CLOSED'], default: 'DRAFT' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  total_submissions: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('SpecialActivity', SpecialActivitySchema);