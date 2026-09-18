const MemberProfile = require('../models/MemberProfile');
const MonthlyScore = require('../models/MonthlyScore');
const { formatDateIST } = require('../services/points.service');

/**
 * GET /api/member/profile
 */
const getProfile = async (req, res) => {
  try {
    const profile = await MemberProfile.findOne({ user_id: req.user._id });

    res.json({
      success: true,
      profile,
      user: {
        id: req.user._id,
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        telegram_username: req.user.telegram_username,
        profile_photo_url: req.user.profile_photo_url,
        role: req.user.role,
        status: req.user.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * PUT /api/member/profile
 * Create or update profile
 */
const createOrUpdateProfile = async (req, res) => {
  try {
    const {
      full_name,
      telegram_username,
      xiaomi_id,
      whatsapp_number,
      instagram_url,
      facebook_url,
      x_twitter_url,
    } = req.body;

    // Required fields check
    if (!full_name || !xiaomi_id || !whatsapp_number) {
      return res.status(400).json({
        success: false,
        error: 'Full name, Xiaomi ID, and WhatsApp number are required',
      });
    }

    // Xiaomi ID validation
    if (xiaomi_id.length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Xiaomi ID must be at least 5 characters',
      });
    }

    // WhatsApp validation (10-15 digits)
    const cleanWhatsApp = whatsapp_number.replace(/\D/g, '');
    if (cleanWhatsApp.length < 10 || cleanWhatsApp.length > 15) {
      return res.status(400).json({
        success: false,
        error: 'Invalid WhatsApp number',
      });
    }

    let profile = await MemberProfile.findOne({ user_id: req.user._id });

    if (profile) {
      // Update existing
      profile.full_name = full_name;
      profile.telegram_username = telegram_username || req.user.telegram_username || '';
      profile.xiaomi_id = xiaomi_id;
      profile.whatsapp_number = cleanWhatsApp;
      profile.instagram_url = instagram_url || '';
      profile.facebook_url = facebook_url || '';
      profile.x_twitter_url = x_twitter_url || '';
      await profile.save();
    } else {
      // Create new
      profile = await MemberProfile.create({
        user_id: req.user._id,
        full_name,
        telegram_username: telegram_username || req.user.telegram_username || '',
        xiaomi_id,
        whatsapp_number: cleanWhatsApp,
        instagram_url: instagram_url || '',
        facebook_url: facebook_url || '',
        x_twitter_url: x_twitter_url || '',
      });
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Xiaomi ID already registered by another member',
      });
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ═══════════════════════════════════════════
// GET POINTS BREAKDOWN (Member)
// ═══════════════════════════════════════════
const getPointsBreakdown = async (req, res) => {
  try {
    const month = formatDateIST().substring(0, 7); // YYYY-MM
    const score = await MonthlyScore.findOne({
      member_id: req.user._id,
      month,
    });

    res.json({
      success: true,
      month,
      total_points: score?.total_points || 0,
      breakdown: {
        regular_points: score?.regular_points || 0,
        special_points: score?.special_points || 0,
        meetup_points: score?.meetup_points || 0,
        manual_adjustments: score?.manual_adjustments || 0,
      },
      stats: {
        verified_activities: score?.verified_activities || 0,
        active_days: score?.active_days || 0,
        percentage: score?.percentage || 0,
        current_streak: score?.current_streak || 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getProfile,
  createOrUpdateProfile,
  getPointsBreakdown,
};