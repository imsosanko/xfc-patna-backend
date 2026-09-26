const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  activity_id: { 
    type: String, 
    unique: true, 
    index: true 
  },
  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  date: { 
    type: String, 
    required: true, 
    index: true 
  },   // YYYY-MM-DD (IST)
  month: { 
    type: String, 
    required: true, 
    index: true 
  },   // YYYY-MM
  platform: { 
    type: String, 
    required: true, 
    index: true 
  },
  activity_type: { 
    type: String, 
    required: true 
  },
  url: { 
    type: String, 
    required: true 
  },
  normalized_url: { 
    type: String, 
    required: true 
  },
  url_hash: { 
    type: String, 
    required: true, 
    index: true 
  },
  submitted_at: { 
    type: Date, 
    default: Date.now 
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE', 'INVALID'],
    default: 'PENDING',
    index: true,
  },
  verified_at: Date,
  verified_by: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  points: { 
    type: Number, 
    default: 0 
  },
  special_activity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SpecialActivity',
    default: null,
  },
  rejection_reason: { 
    type: String, 
    default: '' 
  },

  // ═══════════════════════════════════════════
  // AUTO-VERIFICATION FIELDS (NEW)
  // ═══════════════════════════════════════════
  auto_verified: {
    type: Boolean,
    default: false,
    index: true,
  },
  verified_by_system: {
    type: Boolean,
    default: false,
  },
  auto_verify_reason: {
    type: String,
    default: '',
  },
}, { timestamps: true });

// ⚠️ CRITICAL: Duplicate protection — ek member same URL dobara nahi de sakta
ActivitySchema.index({ member_id: 1, url_hash: 1 }, { unique: true });

module.exports = mongoose.model('Activity', ActivitySchema);