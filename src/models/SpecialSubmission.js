const mongoose = require('mongoose');

const SpecialSubmissionSchema = new mongoose.Schema({
  special_activity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SpecialActivity',
    required: true,
    index: true,
  },
  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // ═══════════════════════════════════════════
  // SUBMISSION ITEMS (Per-requirement URLs)
  // ═══════════════════════════════════════════
  items: [
    {
      platform: String,
      activity_type: String,
      url: String,
      normalized_url: String,
      url_hash: String,

      // Per-item review
      status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING',
      },
      rejection_reason: String,

      // Review tracking (Meetup-style)
      submitted_at: {
        type: Date,
        default: Date.now,
      },
      reviewed_at: {
        type: Date,
        default: null,
      },
      reviewed_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null,
      },

      // Per-item points (calculated after approval)
      points: {
        type: Number,
        default: 0,
      },
    },
  ],

  // ═══════════════════════════════════════════
  // OVERALL SUBMISSION STATUS
  // ═══════════════════════════════════════════
  status: {
    type: String,
    enum: [
      'NOT_STARTED',
      'IN_PROGRESS',
      'SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'PARTIALLY_APPROVED',
      'REJECTED',
      'COMPLETED',
    ],
    default: 'NOT_STARTED',
    index: true,
  },

  // ═══════════════════════════════════════════
  // SUBMISSION LOCK
  // Member submit karne ke baad edit nahi kar sakta
  // Admin/Super Admin edit kar sakta hai
  // ═══════════════════════════════════════════
  is_locked: {
    type: Boolean,
    default: false,
    index: true,
  },
  locked_at: {
    type: Date,
    default: null,
  },
  submitted_at: {
    type: Date,
    default: null,
  },

  // ═══════════════════════════════════════════
  // POINTS
  // ═══════════════════════════════════════════
  points_awarded: {
    type: Number,
    default: 0,
  },

  // ═══════════════════════════════════════════
  // ADMIN EDIT AUDIT (Meetup-style)
  // ═══════════════════════════════════════════
  last_edited_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  last_edited_at: {
    type: Date,
    default: null,
  },
  edit_history: [
    {
      edited_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
      },
      edited_at: {
        type: Date,
        default: Date.now,
      },
      changes: {
        type: mongoose.Schema.Types.Mixed,
      },
      note: {
        type: String,
        default: '',
      },
    },
  ],
}, { timestamps: true });

SpecialSubmissionSchema.index(
  { special_activity_id: 1, member_id: 1 },
  { unique: true }
);

// Query indexes
SpecialSubmissionSchema.index({ special_activity_id: 1, status: 1 });
SpecialSubmissionSchema.index({ member_id: 1, status: 1 });

module.exports = mongoose.model('SpecialSubmission', SpecialSubmissionSchema);