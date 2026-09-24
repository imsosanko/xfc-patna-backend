const mongoose = require('mongoose');

const MeetupRSVPSchema = new mongoose.Schema({
  meetup_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meetup',
    required: true,
    index: true,
  },
  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  rsvp_status: {
    type: String,
    enum: ['INTERESTED', 'NOT_GOING', 'ATTENDED'],
    default: 'INTERESTED',
    index: true,
  },
  bringing_guest: {
    type: Boolean,
    default: false,
  },
  guest_count: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },

  // ═══════════════════════════════════════════
  // RSVP LOCK
  // Member RSVP ke baad edit nahi kar sakta
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

  // ═══════════════════════════════════════════
  // X (TWITTER) LINK SUBMISSION
  // ═══════════════════════════════════════════
  x_link: {
    type: String,
    default: '',
    trim: true,
  },
  x_post_type: {
    type: String,
    enum: ['POST', 'QUOTE_POST', 'THREAD_POST', ''],
    default: '',
  },
  x_status: {
    type: String,
    enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'],
    default: 'NOT_SUBMITTED',
    index: true,
  },
  x_submitted_at: {
    type: Date,
    default: null,
  },
  x_reviewed_at: {
    type: Date,
    default: null,
  },
  x_reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  x_rejection_reason: {
    type: String,
    default: '',
  },

  // ═══════════════════════════════════════════
  // INSTAGRAM LINK SUBMISSION
  // ═══════════════════════════════════════════
  instagram_link: {
    type: String,
    default: '',
    trim: true,
  },
  instagram_post_type: {
    type: String,
    enum: ['STORY', 'POST', 'REEL', ''],
    default: '',
  },
  instagram_status: {
    type: String,
    enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'],
    default: 'NOT_SUBMITTED',
    index: true,
  },
  instagram_submitted_at: {
    type: Date,
    default: null,
  },
  instagram_reviewed_at: {
    type: Date,
    default: null,
  },
  instagram_reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  instagram_rejection_reason: {
    type: String,
    default: '',
  },

  // ═══════════════════════════════════════════
  // POINTS (combined: X + Insta + Physical se alag aayega)
  // ═══════════════════════════════════════════
  points_awarded: {
    type: Number,
    default: 0,
  },

  // ═══════════════════════════════════════════
  // ADMIN EDIT AUDIT
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
  edit_history: [{
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
  }],

  note: {
    type: String,
    default: '',
  },
}, { timestamps: true });

// Ek member ek meetup ke liye sirf ek RSVP
MeetupRSVPSchema.index({ meetup_id: 1, member_id: 1 }, { unique: true });

// Query indexes
MeetupRSVPSchema.index({ meetup_id: 1, rsvp_status: 1 });
MeetupRSVPSchema.index({ meetup_id: 1, x_status: 1 });
MeetupRSVPSchema.index({ meetup_id: 1, instagram_status: 1 });

module.exports = mongoose.model('MeetupRSVP', MeetupRSVPSchema);