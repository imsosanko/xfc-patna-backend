const mongoose = require('mongoose');

const MeetupAttendanceSchema = new mongoose.Schema({
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

  // ═══════════════════════════════════════════
  // ATTENDANCE STATUS
  // ═══════════════════════════════════════════
  attendance_status: {
    type: String,
    enum: ['PENDING', 'PRESENT', 'ABSENT'],
    default: 'PENDING',
    index: true,
  },

  // ═══════════════════════════════════════════
  // CHECK-IN METHOD
  // SELF_GPS     → Member ne khud GPS se kiya
  // ADMIN_MANUAL → Admin ne manually mark kiya
  // ═══════════════════════════════════════════
  check_in_method: {
    type: String,
    enum: ['SELF_GPS', 'ADMIN_MANUAL', ''],
    default: '',
  },

  // ═══════════════════════════════════════════
  // GPS CHECK-IN (Member self check-in)
  // ═══════════════════════════════════════════
  check_in_location: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
  },
  distance_from_venue_meters: { type: Number, default: null },
  check_in_at: { type: Date, default: null },

  // ═══════════════════════════════════════════
  // ADMIN MANUAL MARK
  // ═══════════════════════════════════════════
  marked_by_admin: { type: Boolean, default: false },
  marked_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  marked_at: { type: Date, default: null },
  admin_note: { type: String, default: '' },

  // ═══════════════════════════════════════════
  // POINTS (50% of meetup.points)
  // ═══════════════════════════════════════════
  points_awarded: { type: Number, default: 0 },
}, { timestamps: true });

// Indexes
MeetupAttendanceSchema.index({ meetup_id: 1, member_id: 1 }, { unique: true });
MeetupAttendanceSchema.index({ meetup_id: 1, attendance_status: 1 });

module.exports = mongoose.model('MeetupAttendance', MeetupAttendanceSchema);