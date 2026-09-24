const Meetup = require('../models/Meetup');
const MeetupRSVP = require('../models/MeetupRSVP');
const MeetupAttendance = require('../models/MeetupAttendance');
const MemberProfile = require('../models/MemberProfile');
const User = require('../models/User');

// ═══════════════════════════════════════════
// HELPER: Distance calculate (Haversine formula)
// ═══════════════════════════════════════════
const calcDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ═══════════════════════════════════════════
// HELPER: Enrich RSVP for response
// ═══════════════════════════════════════════
const enrichRSVP = (rsvp, attendance) => {
  if (!rsvp) return null;
  return {
    status: rsvp.rsvp_status,
    bringing_guest: rsvp.bringing_guest,
    guest_count: rsvp.guest_count,
    is_locked: rsvp.is_locked,
    locked_at: rsvp.locked_at,
    points_awarded: rsvp.points_awarded,

    // X submission
    x_link: rsvp.x_link,
    x_post_type: rsvp.x_post_type,
    x_status: rsvp.x_status,
    x_submitted_at: rsvp.x_submitted_at,
    x_rejection_reason: rsvp.x_rejection_reason,

    // Instagram submission
    instagram_link: rsvp.instagram_link,
    instagram_post_type: rsvp.instagram_post_type,
    instagram_status: rsvp.instagram_status,
    instagram_submitted_at: rsvp.instagram_submitted_at,
    instagram_rejection_reason: rsvp.instagram_rejection_reason,

    // Physical attendance (from MeetupAttendance)
    attendance: attendance
      ? {
          status: attendance.attendance_status,
          check_in_method: attendance.check_in_method,
          check_in_at: attendance.check_in_at,
          points_awarded: attendance.points_awarded,
        }
      : null,
  };
};

// ═══════════════════════════════════════════
// GET /api/meetups
// Member meetups list
// ═══════════════════════════════════════════
const getMeetups = async (req, res) => {
  try {
    const { status } = req.query;
    const now = new Date();

    let query = {};

    if (status === 'upcoming') {
      query = {
        status: { $in: ['PUBLISHED', 'ONGOING'] },
        date: { $gte: now },
      };
    } else if (status === 'past') {
      query = {
        status: { $in: ['COMPLETED', 'CANCELLED'] },
      };
    } else if (status === 'ongoing') {
      query = {
        status: 'ONGOING',
        date: { $lte: now },
        end_time: { $gte: now },
      };
    } else {
      query = {
        status: { $in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
      };
    }

    const meetups = await Meetup.find(query)
      .sort({ date: -1 })
      .limit(50)
      .lean();

    const meetupIds = meetups.map((m) => m._id);
    const myRSVPs = await MeetupRSVP.find({
      member_id: req.user._id,
      meetup_id: { $in: meetupIds },
    }).lean();

    const rsvpMap = {};
    myRSVPs.forEach((r) => {
      rsvpMap[r.meetup_id.toString()] = r;
    });

    const enriched = meetups.map((m) => {
      const myRsvp = rsvpMap[m._id.toString()];
      return {
        id: m._id,
        title: m.title,
        description: m.description,
        banner_url: m.banner_url,
        date: m.date,
        end_time: m.end_time,
        venue: m.venue,
        address: m.address,
        map_url: m.map_url,
        points: m.points,
        max_attendees: m.max_attendees,
        status: m.status,
        total_rsvps: m.total_rsvps,
        total_attended: m.total_attended,
        location_locked: m.location_locked,
        my_rsvp: myRsvp
          ? {
              status: myRsvp.rsvp_status,
              bringing_guest: myRsvp.bringing_guest,
              guest_count: myRsvp.guest_count,
              is_locked: myRsvp.is_locked,
            }
          : null,
      };
    });

    res.json({
      success: true,
      count: enriched.length,
      meetups: enriched,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// GET /api/meetups/:id
// Meetup detail (full info)
// ═══════════════════════════════════════════
const getMeetupDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const myRSVP = await MeetupRSVP.findOne({
      meetup_id: id,
      member_id: req.user._id,
    }).lean();

    const myAttendance = await MeetupAttendance.findOne({
      meetup_id: id,
      member_id: req.user._id,
    }).lean();

    const rsvpCount = await MeetupRSVP.countDocuments({
      meetup_id: id,
      rsvp_status: { $in: ['INTERESTED', 'ATTENDED'] },
    });

    res.json({
      success: true,
      meetup: {
        id: meetup._id,
        title: meetup.title,
        description: meetup.description,
        banner_url: meetup.banner_url,
        date: meetup.date,
        end_time: meetup.end_time,
        venue: meetup.venue,
        address: meetup.address,
        map_url: meetup.map_url,
        points: meetup.points,
        max_attendees: meetup.max_attendees,
        status: meetup.status,
        total_rsvps: meetup.total_rsvps,
        total_attended: meetup.total_attended,
        location_locked: meetup.location_locked,
        location_lat: meetup.location_lat,
        location_lng: meetup.location_lng,
        location_radius_meters: meetup.location_radius_meters,
        attendance_weights: meetup.attendance_weights,
        submission_deadline: meetup.submission_deadline,
      },
      my_rsvp: enrichRSVP(myRSVP, myAttendance),
      rsvp_count: rsvpCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// POST /api/meetups/:id/rsvp
// RSVP create (only once — locked after)
// ═══════════════════════════════════════════
const submitRSVP = async (req, res) => {
  try {
    const { id } = req.params;
    const { rsvp_status, bringing_guest, guest_count } = req.body;

    const profile = await MemberProfile.findOne({ user_id: req.user._id });
    if (!profile) {
      return res.status(403).json({
        success: false,
        error: 'Please complete your profile first',
      });
    }

    if (!['INTERESTED', 'NOT_GOING'].includes(rsvp_status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid RSVP status',
      });
    }

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    if (['CANCELLED', 'COMPLETED'].includes(meetup.status)) {
      return res.status(400).json({
        success: false,
        error: `This meetup is ${meetup.status.toLowerCase()}`,
      });
    }

    // ─────────────────────────────────────────
    // CHECK: Existing RSVP locked?
    // ─────────────────────────────────────────
    const existing = await MeetupRSVP.findOne({
      meetup_id: id,
      member_id: req.user._id,
    });

    if (existing && existing.is_locked) {
      return res.status(403).json({
        success: false,
        error: 'Your RSVP is locked. Contact admin to make changes.',
      });
    }

    // Max attendees check
    if (meetup.max_attendees > 0 && rsvp_status === 'INTERESTED') {
      const currentCount = await MeetupRSVP.countDocuments({
        meetup_id: id,
        rsvp_status: { $in: ['INTERESTED', 'ATTENDED'] },
      });
      if (!existing || existing.rsvp_status === 'NOT_GOING') {
        if (currentCount >= meetup.max_attendees) {
          return res.status(400).json({
            success: false,
            error: 'Meetup is full',
          });
        }
      }
    }

    const wasInterested = existing?.rsvp_status === 'INTERESTED';
    let rsvp;

    if (existing) {
      existing.rsvp_status = rsvp_status;
      existing.bringing_guest = !!bringing_guest;
      existing.guest_count = bringing_guest
        ? Math.max(0, Math.min(5, parseInt(guest_count) || 0))
        : 0;
      // Lock after update
      existing.is_locked = true;
      existing.locked_at = new Date();
      await existing.save();
      rsvp = existing;
    } else {
      rsvp = await MeetupRSVP.create({
        meetup_id: id,
        member_id: req.user._id,
        rsvp_status,
        bringing_guest: !!bringing_guest,
        guest_count: bringing_guest
          ? Math.max(0, Math.min(5, parseInt(guest_count) || 0))
          : 0,
        is_locked: true,
        locked_at: new Date(),
      });
    }

    const isInterested = rsvp_status === 'INTERESTED';
    if (isInterested && !wasInterested) {
      await Meetup.findByIdAndUpdate(id, { $inc: { total_rsvps: 1 } });
    } else if (!isInterested && wasInterested) {
      await Meetup.findByIdAndUpdate(id, { $inc: { total_rsvps: -1 } });
    }

    res.json({
      success: true,
      message: isInterested
        ? "You're registered! See you there 🎉"
        : 'RSVP updated & locked',
      rsvp: {
        status: rsvp.rsvp_status,
        bringing_guest: rsvp.bringing_guest,
        guest_count: rsvp.guest_count,
        is_locked: rsvp.is_locked,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'RSVP already exists',
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// POST /api/meetups/:id/x-link
// Member submits X (Twitter) link
// ═══════════════════════════════════════════
const submitXLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { x_link, x_post_type } = req.body;

    if (!x_link || !x_link.trim()) {
      return res.status(400).json({ success: false, error: 'X link required' });
    }

    if (!['POST', 'QUOTE_POST', 'THREAD_POST'].includes(x_post_type)) {
      return res.status(400).json({ success: false, error: 'Invalid post type' });
    }

    // X link validation
    if (!/^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+/i.test(x_link.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid X/Twitter URL',
      });
    }

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const rsvp = await MeetupRSVP.findOne({
      meetup_id: id,
      member_id: req.user._id,
    });

    if (!rsvp || rsvp.rsvp_status !== 'INTERESTED') {
      return res.status(403).json({
        success: false,
        error: 'You must RSVP first',
      });
    }

    if (rsvp.x_status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        error: 'X link already approved',
      });
    }

    // Update
    rsvp.x_link = x_link.trim();
    rsvp.x_post_type = x_post_type;
    rsvp.x_status = 'PENDING';
    rsvp.x_submitted_at = new Date();
    rsvp.x_rejection_reason = '';
    await rsvp.save();

    res.json({
      success: true,
      message: 'X link submitted for review',
      x_status: rsvp.x_status,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// POST /api/meetups/:id/instagram-link
// Member submits Instagram link
// ═══════════════════════════════════════════
const submitInstagramLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { instagram_link, instagram_post_type } = req.body;

    if (!instagram_link || !instagram_link.trim()) {
      return res.status(400).json({ success: false, error: 'Instagram link required' });
    }

    if (!['STORY', 'POST', 'REEL'].includes(instagram_post_type)) {
      return res.status(400).json({ success: false, error: 'Invalid post type' });
    }

    // Instagram link validation
    if (!/^https?:\/\/(www\.)?instagram\.com\/.+/i.test(instagram_link.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Instagram URL',
      });
    }

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const rsvp = await MeetupRSVP.findOne({
      meetup_id: id,
      member_id: req.user._id,
    });

    if (!rsvp || rsvp.rsvp_status !== 'INTERESTED') {
      return res.status(403).json({
        success: false,
        error: 'You must RSVP first',
      });
    }

    if (rsvp.instagram_status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        error: 'Instagram link already approved',
      });
    }

    rsvp.instagram_link = instagram_link.trim();
    rsvp.instagram_post_type = instagram_post_type;
    rsvp.instagram_status = 'PENDING';
    rsvp.instagram_submitted_at = new Date();
    rsvp.instagram_rejection_reason = '';
    await rsvp.save();

    res.json({
      success: true,
      message: 'Instagram link submitted for review',
      instagram_status: rsvp.instagram_status,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// POST /api/meetups/:id/check-in
// Member self GPS check-in (requires location locked)
// ═══════════════════════════════════════════
const selfCheckIn = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, accuracy } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude required',
      });
    }

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    if (!meetup.location_locked) {
      return res.status(403).json({
        success: false,
        error: 'Check-in not open yet. Admin will unlock shortly.',
      });
    }

    if (meetup.location_lat == null || meetup.location_lng == null) {
      return res.status(400).json({
        success: false,
        error: 'Meetup location not set',
      });
    }

    // Distance check
    const distance = calcDistanceMeters(
      latitude,
      longitude,
      meetup.location_lat,
      meetup.location_lng
    );

    if (distance > meetup.location_radius_meters) {
      return res.status(400).json({
        success: false,
        error: `You are ${Math.round(distance)}m away. Must be within ${meetup.location_radius_meters}m.`,
        distance_meters: Math.round(distance),
      });
    }

    // Check RSVP
    const rsvp = await MeetupRSVP.findOne({
      meetup_id: id,
      member_id: req.user._id,
    });

    if (!rsvp || rsvp.rsvp_status !== 'INTERESTED') {
      return res.status(403).json({
        success: false,
        error: 'You must RSVP first',
      });
    }

    // Upsert attendance
    let attendance = await MeetupAttendance.findOne({
      meetup_id: id,
      member_id: req.user._id,
    });

    if (attendance && attendance.attendance_status === 'PRESENT') {
      return res.status(400).json({
        success: false,
        error: 'Already checked in',
      });
    }

    // Calculate physical points (50% of meetup points)
    const physicalPoints =
      (meetup.points * (meetup.attendance_weights?.physical || 50)) / 100;

    if (attendance) {
      attendance.attendance_status = 'PRESENT';
      attendance.check_in_method = 'SELF_GPS';
      attendance.check_in_location = { latitude, longitude, accuracy };
      attendance.distance_from_venue_meters = Math.round(distance);
      attendance.check_in_at = new Date();
      attendance.points_awarded = physicalPoints;
      await attendance.save();
    } else {
      attendance = await MeetupAttendance.create({
        meetup_id: id,
        member_id: req.user._id,
        attendance_status: 'PRESENT',
        check_in_method: 'SELF_GPS',
        check_in_location: { latitude, longitude, accuracy },
        distance_from_venue_meters: Math.round(distance),
        check_in_at: new Date(),
        points_awarded: physicalPoints,
      });
    }

    await Meetup.findByIdAndUpdate(id, { $inc: { total_attended: 1 } });

    res.json({
      success: true,
      message: 'Checked in successfully! ✅',
      attendance: {
        status: attendance.attendance_status,
        check_in_method: attendance.check_in_method,
        points_awarded: attendance.points_awarded,
        distance_meters: attendance.distance_from_venue_meters,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// DELETE /api/meetups/:id/rsvp
// Cancel RSVP (only if not locked)
// ═══════════════════════════════════════════
const cancelRSVP = async (req, res) => {
  try {
    const { id } = req.params;
    const rsvp = await MeetupRSVP.findOne({
      meetup_id: id,
      member_id: req.user._id,
    });

    if (!rsvp) {
      return res.status(404).json({ success: false, error: 'RSVP not found' });
    }

    if (rsvp.is_locked) {
      return res.status(403).json({
        success: false,
        error: 'RSVP is locked. Contact admin to cancel.',
      });
    }

    if (rsvp.rsvp_status === 'ATTENDED') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel — you already attended',
      });
    }

    const wasInterested = rsvp.rsvp_status === 'INTERESTED';
    await MeetupRSVP.deleteOne({ _id: rsvp._id });

    if (wasInterested) {
      await Meetup.findByIdAndUpdate(id, { $inc: { total_rsvps: -1 } });
    }

    res.json({ success: true, message: 'RSVP cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getMeetups,
  getMeetupDetail,
  submitRSVP,
  submitXLink,
  submitInstagramLink,
  selfCheckIn,
  cancelRSVP,
};