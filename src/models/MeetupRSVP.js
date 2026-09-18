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
  checked_in_at: {
    type: Date,
    default: null,
  },
  checked_in_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  points_awarded: {
    type: Number,
    default: 0,
  },
  note: {
    type: String,
    default: '',
  },
}, { timestamps: true });

// Ek member ek meetup ke liye sirf ek RSVP
MeetupRSVPSchema.index({ meetup_id: 1, member_id: 1 }, { unique: true });

module.exports = mongoose.model('MeetupRSVP', MeetupRSVPSchema);