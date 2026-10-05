const PopupMessage = require('../models/PopupMessage');
const SpecialActivity = require('../models/SpecialActivity');
const Meetup = require('../models/Meetup');
const AuditLog = require('../models/AuditLog');

// ═══════════════════════════════════════════
// ADMIN: LIST ALL POPUPS
// ═══════════════════════════════════════════
const listPopups = async (req, res) => {
  try {
    const { page = 1, limit = 50, active } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (active === 'true') query.is_active = true;
    if (active === 'false') query.is_active = false;

    const [popups, total] = await Promise.all([
      PopupMessage.find(query)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('created_by', 'name email')
        .lean(),
      PopupMessage.countDocuments(query),
    ]);

    const now = new Date();
    const enriched = popups.map((p) => ({
      ...p,
      seen_count: (p.seen_history || []).length,
      is_expired: p.ends_at ? new Date(p.ends_at) < now : false,
      is_scheduled: new Date(p.starts_at) > now,
      is_live:
        p.is_active &&
        new Date(p.starts_at) <= now &&
        (!p.ends_at || new Date(p.ends_at) >= now),
    }));

    res.json({ success: true, total, page: parseInt(page), popups: enriched });
  } catch (error) {
    console.error('listPopups error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: GET ONE
// ═══════════════════════════════════════════
const getPopup = async (req, res) => {
  try {
    const popup = await PopupMessage.findById(req.params.id)
      .populate('created_by', 'name email')
      .lean();

    if (!popup) {
      return res.status(404).json({ success: false, error: 'Popup not found' });
    }

    res.json({ success: true, popup });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: CREATE
// ═══════════════════════════════════════════
const createPopup = async (req, res) => {
  try {
    const {
      title,
      message,
      type = 'CUSTOM',
      icon = 'megaphone',
      image_url = '',
      button_text = 'Got It 👍',
      button_link = '',
      priority = 5,
      is_active = false,
      frequency = 'ONCE_PER_DAY',
      starts_at,
      ends_at,
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message required' });
    }

    const popup = await PopupMessage.create({
      title: title.trim(),
      message: message.trim(),
      type,
      icon,
      image_url,
      button_text,
      button_link,
      priority: Math.min(10, Math.max(1, parseInt(priority) || 5)),
      is_active,
      frequency,
      starts_at: starts_at ? new Date(starts_at) : new Date(),
      ends_at: ends_at ? new Date(ends_at) : null,
      created_by: req.admin._id,
    });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'CREATE_POPUP',
      target_type: 'POPUP',
      target_id: popup._id,
      new_value: { title, type, is_active, frequency },
    });

    res.json({ success: true, popup });
  } catch (error) {
    console.error('createPopup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: UPDATE
// ═══════════════════════════════════════════
const updatePopup = async (req, res) => {
  try {
    const popup = await PopupMessage.findById(req.params.id);

    if (!popup) {
      return res.status(404).json({ success: false, error: 'Popup not found' });
    }

    const updates = req.body;
    const allowed = [
      'title', 'message', 'type', 'icon', 'image_url',
      'button_text', 'button_link', 'priority',
      'is_active', 'frequency', 'starts_at', 'ends_at',
    ];

    allowed.forEach((field) => {
      if (updates[field] !== undefined) {
        if (field === 'starts_at' || field === 'ends_at') {
          popup[field] = updates[field] ? new Date(updates[field]) : null;
        } else if (field === 'priority') {
          popup[field] = Math.min(10, Math.max(1, parseInt(updates[field]) || 5));
        } else {
          popup[field] = updates[field];
        }
      }
    });

    await popup.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UPDATE_POPUP',
      target_type: 'POPUP',
      target_id: popup._id,
      new_value: updates,
    });

    res.json({ success: true, popup });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: DELETE
// ═══════════════════════════════════════════
const deletePopup = async (req, res) => {
  try {
    const popup = await PopupMessage.findById(req.params.id);

    if (!popup) {
      return res.status(404).json({ success: false, error: 'Popup not found' });
    }

    await PopupMessage.deleteOne({ _id: popup._id });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'DELETE_POPUP',
      target_type: 'POPUP',
      target_id: popup._id,
      previous_value: { title: popup.title },
    });

    res.json({ success: true, message: 'Popup deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: TOGGLE ACTIVE
// ═══════════════════════════════════════════
const togglePopup = async (req, res) => {
  try {
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active must be boolean' });
    }

    const popup = await PopupMessage.findByIdAndUpdate(
      req.params.id,
      { is_active },
      { new: true }
    );

    if (!popup) {
      return res.status(404).json({ success: false, error: 'Popup not found' });
    }

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'TOGGLE_POPUP',
      target_type: 'POPUP',
      target_id: popup._id,
      new_value: { is_active },
    });

    res.json({ success: true, popup });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: AUTOFILL FROM SPECIAL ACTIVITY
// ═══════════════════════════════════════════
const autofillSpecial = async (req, res) => {
  try {
    const now = new Date();

    const special = await SpecialActivity.findOne({
      status: 'OPEN',
      end_date: { $gte: now },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!special) {
      return res.status(404).json({ success: false, error: 'No active special activity' });
    }

    res.json({
      success: true,
      data: {
        title: `${special.title} is Live! 🎉`,
        message: special.description || 'Participate now and earn bonus points!',
        type: 'SPECIAL_ACTIVITY',
        icon: 'sparkles',
        image_url: special.banner_url || '',
        button_text: 'Participate Now',
        button_link: '/special',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: AUTOFILL FROM MEETUP
// ═══════════════════════════════════════════
const autofillMeetup = async (req, res) => {
  try {
    const now = new Date();

    const meetup = await Meetup.findOne({
      status: { $in: ['PUBLISHED', 'ONGOING'] },
      date: { $gte: now },
    })
      .sort({ date: 1 })
      .lean();

    if (!meetup) {
      return res.status(404).json({ success: false, error: 'No upcoming meetup' });
    }

    res.json({
      success: true,
      data: {
        title: `${meetup.title} — Register Now! 🎉`,
        message: `Join us on ${new Date(meetup.date).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })} at ${meetup.venue}.`,
        type: 'MEETUP',
        icon: 'map-pin',
        image_url: meetup.banner_url || '',
        button_text: 'View Meetup',
        button_link: `/meetups/${meetup._id}`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEMBER: GET ACTIVE POPUP (with frequency logic)
// ═══════════════════════════════════════════
const getActivePopup = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    // Fetch all active, in-range popups sorted by priority
    const popups = await PopupMessage.find({
      is_active: true,
      starts_at: { $lte: now },
      $or: [
        { ends_at: null },
        { ends_at: { $gte: now } },
      ],
    })
      .sort({ priority: -1, createdAt: -1 })
      .limit(10)
      .lean();

    // Filter based on frequency logic
    const visible = popups.filter((p) => {
      const history = (p.seen_history || []).filter(
        (h) => String(h.user_id) === String(userId)
      );

      // Never seen → show
      if (history.length === 0) return true;

      // Get most recent seen_at
      const lastSeen = history.reduce((latest, h) => {
        const dt = new Date(h.seen_at);
        return dt > latest ? dt : latest;
      }, new Date(0));

      const diffHours = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);

      switch (p.frequency) {
        case 'ALWAYS':
          return true;

        case 'ONCE_ONLY':
          return false;

        case 'ONCE_PER_DAY': {
          const lastDay = new Date(lastSeen).toLocaleDateString('en-CA', {
            timeZone: 'Asia/Kolkata',
          });
          const todayDay = new Date(now).toLocaleDateString('en-CA', {
            timeZone: 'Asia/Kolkata',
          });
          return lastDay !== todayDay;
        }

        case 'EVERY_4_HOURS':
          return diffHours >= 4;

        case 'EVERY_6_HOURS':
          return diffHours >= 6;

        case 'EVERY_12_HOURS':
          return diffHours >= 12;

        default:
          return true;
      }
    });

    const popup = visible[0] || null;

    res.json({
      success: true,
      popup: popup
        ? {
            _id: popup._id,
            title: popup.title,
            message: popup.message,
            type: popup.type,
            icon: popup.icon,
            image_url: popup.image_url,
            button_text: popup.button_text,
            button_link: popup.button_link,
            priority: popup.priority,
            frequency: popup.frequency,
          }
        : null,
    });
  } catch (error) {
    console.error('getActivePopup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEMBER: DISMISS (track timestamp)
// ═══════════════════════════════════════════
const dismissPopup = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Remove old entry for this user
    await PopupMessage.findByIdAndUpdate(id, {
      $pull: { seen_history: { user_id: userId } },
    });

    // Push fresh timestamp
    await PopupMessage.findByIdAndUpdate(id, {
      $push: { seen_history: { user_id: userId, seen_at: new Date() } },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  // Admin
  listPopups,
  getPopup,
  createPopup,
  updatePopup,
  deletePopup,
  togglePopup,
  autofillSpecial,
  autofillMeetup,
  // Member
  getActivePopup,
  dismissPopup,
};