const Meetup = require('../models/Meetup');
const MeetupRSVP = require('../models/MeetupRSVP');
const MemberProfile = require('../models/MemberProfile');
const User = require('../models/User');

/**
 * GET /api/meetups
 * Member ke liye meetups list (upcoming + past)
 * Query: ?status=upcoming|past|ongoing
 */
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
      // Default: sab published meetups
      query = {
        status: { $in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
      };
    }

    const meetups = await Meetup.find(query)
      .sort({ date: -1 })
      .limit(50)
      .lean();

    // Member ke RSVPs fetch karo
    const meetupIds = meetups.map((m) => m._id);
    const myRSVPs = await MeetupRSVP.find({
      member_id: req.user._id,
      meetup_id: { $in: meetupIds },
    }).lean();

    const rsvpMap = {};
    myRSVPs.forEach((r) => {
      rsvpMap[r.meetup_id.toString()] = r;
    });

    // Enrich
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
        my_rsvp: myRsvp
          ? {
              status: myRsvp.rsvp_status,
              bringing_guest: myRsvp.bringing_guest,
              guest_count: myRsvp.guest_count,
              checked_in_at: myRsvp.checked_in_at,
              points_awarded: myRsvp.points_awarded,
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

/**
 * GET /api/meetups/:id
 * Meetup detail
 */
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

    // RSVP count
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
      },
      my_rsvp: myRSVP
        ? {
            status: myRSVP.rsvp_status,
            bringing_guest: myRSVP.bringing_guest,
            guest_count: myRSVP.guest_count,
            checked_in_at: myRSVP.checked_in_at,
            points_awarded: myRSVP.points_awarded,
          }
        : null,
      rsvp_count: rsvpCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/meetups/:id/rsvp
 * RSVP create or update
 * Body: { rsvp_status: 'INTERESTED' | 'NOT_GOING', bringing_guest: bool, guest_count: number }
 */
const submitRSVP = async (req, res) => {
  try {
    const { id } = req.params;
    const { rsvp_status, bringing_guest, guest_count } = req.body;

    // Profile check
    const profile = await MemberProfile.findOne({ user_id: req.user._id });
    if (!profile) {
      return res.status(403).json({
        success: false,
        error: 'Please complete your profile first',
      });
    }

    // Validate status
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

    // Check meetup status
    if (['CANCELLED', 'COMPLETED'].includes(meetup.status)) {
      return res.status(400).json({
        success: false,
        error: `This meetup is ${meetup.status.toLowerCase()}`,
      });
    }

    // Check max attendees (only for INTERESTED)
    if (meetup.max_attendees > 0 && rsvp_status === 'INTERESTED') {
      const currentCount = await MeetupRSVP.countDocuments({
        meetup_id: id,
        rsvp_status: { $in: ['INTERESTED', 'ATTENDED'] },
      });
      const existing = await MeetupRSVP.findOne({
        meetup_id: id,
        member_id: req.user._id,
      });
      // Agar naya RSVP hai ya pehle NOT_GOING tha, toh check karo
      if (!existing || existing.rsvp_status === 'NOT_GOING') {
        if (currentCount >= meetup.max_attendees) {
          return res.status(400).json({
            success: false,
            error: 'Meetup is full',
          });
        }
      }
    }

    // Upsert RSVP
    let rsvp = await MeetupRSVP.findOne({
      meetup_id: id,
      member_id: req.user._id,
    });

    const wasInterested = rsvp?.rsvp_status === 'INTERESTED';

    if (rsvp) {
      rsvp.rsvp_status = rsvp_status;
      rsvp.bringing_guest = !!bringing_guest;
      rsvp.guest_count = bringing_guest ? Math.max(0, Math.min(5, parseInt(guest_count) || 0)) : 0;
      await rsvp.save();
    } else {
      rsvp = await MeetupRSVP.create({
        meetup_id: id,
        member_id: req.user._id,
        rsvp_status,
        bringing_guest: !!bringing_guest,
        guest_count: bringing_guest ? Math.max(0, Math.min(5, parseInt(guest_count) || 0)) : 0,
      });
    }

    // Update meetup total_rsvps (denormalized)
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
        : 'RSVP updated',
      rsvp: {
        status: rsvp.rsvp_status,
        bringing_guest: rsvp.bringing_guest,
        guest_count: rsvp.guest_count,
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

/**
 * DELETE /api/meetups/:id/rsvp
 * Cancel RSVP
 */
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
  cancelRSVP,
};