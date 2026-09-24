const mongoose = require('mongoose');

const MeetupSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  banner_url: {
    type: String,
    default: '',
  },
  date: {
    type: Date,
    required: true,
    // ❌ index: true hataya (neeche schema.index mein already hai)
  },
  end_time: {
    type: Date,
  },
  venue: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
    default: '',
  },
  map_url: {
    type: String,
    default: '',
  },
  points: {
    type: Number,
    default: 10,
    min: 0,
  },
  max_attendees: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT',
    index: true,
  },
  qr_code: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },

  // ═══════════════════════════════════════════
  // LOCATION LOCK (Admin action)
  // ═══════════════════════════════════════════
  location_locked: {
    type: Boolean,
    default: false,
    // ❌ index: true hataya (neeche schema.index mein already hai)
  },
  location_locked_at: {
    type: Date,
    default: null,
  },
  location_locked_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  location_lat: {
    type: Number,
    default: null,
  },
  location_lng: {
    type: Number,
    default: null,
  },
  location_radius_meters: {
    type: Number,
    default: 100,
  },

  // ═══════════════════════════════════════════
  // ATTENDANCE SCORE WEIGHTS
  // ═══════════════════════════════════════════
  attendance_weights: {
    physical: { type: Number, default: 50 },
    x_link: { type: Number, default: 25 },
    instagram: { type: Number, default: 25 },
  },

  // ═══════════════════════════════════════════
  // SUBMISSION DEADLINE
  // ═══════════════════════════════════════════
  submission_deadline: {
    type: Date,
    default: null,
  },

  // Stats
  total_rsvps: {
    type: Number,
    default: 0,
  },
  total_attended: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// ═══════════════════════════════════════════
// INDEXES (sab yahan ek jagah)
// ═══════════════════════════════════════════
MeetupSchema.index({ status: 1, date: -1 });
MeetupSchema.index({ date: 1 });
MeetupSchema.index({ location_locked: 1 });

module.exports = mongoose.model('Meetup', MeetupSchema);