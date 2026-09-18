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
    index: true,
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
    default: 0, // 0 = no limit
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
    sparse: true, // allow multiple nulls
    index: true,
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  // Stats (denormalized for speed)
  total_rsvps: {
    type: Number,
    default: 0,
  },
  total_attended: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Index for listing
MeetupSchema.index({ status: 1, date: -1 });
MeetupSchema.index({ date: 1 });

module.exports = mongoose.model('Meetup', MeetupSchema);