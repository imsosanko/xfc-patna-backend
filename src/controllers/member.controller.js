const MemberProfile = require('../models/MemberProfile');
const MonthlyScore = require('../models/MonthlyScore');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Activity = require('../models/Activity');
const { formatDateIST } = require('../services/points.service');

/**
 * GET /api/member/profile
 */
const getProfile = async (req, res) => {
  try {
    const profile = await MemberProfile.findOne({ user_id: req.user._id });
    const fullUser = await User.findById(req.user._id).select('badges admin_badges');
    const adminInfo = await Admin.findOne({ user_id: req.user._id }).select('name role email').lean();

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
        badges: fullUser?.badges || [],
        admin_badges: fullUser?.admin_badges || [],
        is_admin: !!adminInfo,
        admin_role: adminInfo ? adminInfo.role : null,
        admin_name: adminInfo ? adminInfo.name : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/member/profile
 */
const createOrUpdateProfile = async (req, res) => {
  try {
    const {
      full_name, telegram_username, xiaomi_id, whatsapp_number,
      instagram_url, facebook_url, x_twitter_url,
    } = req.body;

    if (!full_name || !xiaomi_id || !whatsapp_number) {
      return res.status(400).json({
        success: false,
        error: 'Full name, Xiaomi ID, and WhatsApp number are required',
      });
    }

    if (xiaomi_id.length < 5) {
      return res.status(400).json({ success: false, error: 'Xiaomi ID must be at least 5 characters' });
    }

    const cleanWhatsApp = whatsapp_number.replace(/\D/g, '');
    if (cleanWhatsApp.length < 10 || cleanWhatsApp.length > 15) {
      return res.status(400).json({ success: false, error: 'Invalid WhatsApp number' });
    }

    let profile = await MemberProfile.findOne({ user_id: req.user._id });

    if (profile) {
      profile.full_name = full_name;
      profile.telegram_username = telegram_username || req.user.telegram_username || '';
      profile.xiaomi_id = xiaomi_id;
      profile.whatsapp_number = cleanWhatsApp;
      profile.instagram_url = instagram_url || '';
      profile.facebook_url = facebook_url || '';
      profile.x_twitter_url = x_twitter_url || '';
      await profile.save();
    } else {
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

    res.json({ success: true, profile });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Xiaomi ID already registered by another member' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// GET POINTS BREAKDOWN (Member)
// ═══════════════════════════════════════════
const getPointsBreakdown = async (req, res) => {
  try {
    const month = formatDateIST().substring(0, 7);
    const score = await MonthlyScore.findOne({ member_id: req.user._id, month });

    res.json({
      success: true,
      month,
      total_points: score?.total_points || 0,
      breakdown: {
        regular_points: score?.regular_points || 0,
        bonus_points: score?.bonus_points || 0,
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
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ✅ GET DASHBOARD (month selector + overall)
// GET /api/member/dashboard?month=2026-09
// ═══════════════════════════════════════════
const getDashboard = async (req, res) => {
  try {
    const { month } = req.query;
    const currentMonth = formatDateIST().substring(0, 7);
    const selectedMonth = month && month !== 'current' ? month : currentMonth;

    const memberId = req.user._id;

    // ═══ SELECTED MONTH DATA ═══
    let monthData = {
      month: selectedMonth,
      points: 0,
      current_streak: 0,
      longest_streak: 0,
      active_days: 0,
      activities: 0,
      percentage: 0,
      rank: null,
      found: false,
    };

    if (selectedMonth !== 'all') {
      const score = await MonthlyScore.findOne({
        member_id: memberId,
        month: selectedMonth,
      }).lean();

      if (score) {
        monthData.points = score.total_points || 0;
        monthData.current_streak = score.current_streak || 0;
        monthData.longest_streak = score.longest_streak || 0;
        monthData.active_days = score.active_days || 0;
        monthData.activities = score.verified_activities || 0;
        monthData.percentage = score.percentage || 0;
        monthData.found = true;

        const rankCount = await MonthlyScore.countDocuments({
          month: selectedMonth,
          total_points: { $gt: score.total_points },
        });
        monthData.rank = rankCount + 1;
      } else {
        // ✅ FALLBACK: MonthlyScore nahi hai, Activities se calculate
        const monthActivities = await Activity.find({
          member_id: memberId,
          month: selectedMonth,
          status: 'APPROVED',
        }).lean();

        if (monthActivities.length > 0) {
          monthData.activities = monthActivities.length;
          monthData.points = Math.round(
            monthActivities.reduce((sum, a) => sum + (a.points || 0), 0) * 100
          ) / 100;
          monthData.active_days = new Set(monthActivities.map((a) => a.date)).size;
          monthData.percentage = Math.min((monthData.points / 100) * 100, 100);
          monthData.current_streak = 0;
          monthData.longest_streak = 0;
          monthData.found = true;

          const rankAgg = await MonthlyScore.aggregate([
            { $match: { month: selectedMonth } },
            { $group: { _id: '$member_id', total: { $sum: '$total_points' } } },
            { $match: { total: { $gt: monthData.points } } },
            { $count: 'higher' },
          ]);
          monthData.rank = (rankAgg[0]?.higher || 0) + 1;
        }
      }
    }

    // ═══ OVERALL DATA (ALL TIME) ═══
    const allScores = await MonthlyScore.find({ member_id: memberId }).lean();

    const overall = {
      total_points: 0,
      longest_streak: 0,
      total_active_days: 0,
      total_activities: 0,
      months_active: allScores.length,
      avg_per_month: 0,
      rank: null,
      total_members: 0,
    };

    allScores.forEach((s) => {
      overall.total_points += s.total_points || 0;
      overall.longest_streak = Math.max(overall.longest_streak, s.longest_streak || 0);
      overall.total_active_days += s.active_days || 0;
      overall.total_activities += s.verified_activities || 0;
    });

    overall.total_points = Math.round(overall.total_points * 100) / 100;
    overall.avg_per_month = allScores.length > 0
      ? Math.round((overall.total_points / allScores.length) * 100) / 100
      : 0;

    const rankAgg = await MonthlyScore.aggregate([
      { $group: { _id: '$member_id', total: { $sum: '$total_points' } } },
      { $sort: { total: -1 } },
    ]);
    const myIdx = rankAgg.findIndex((m) => String(m._id) === String(memberId));
    overall.rank = myIdx >= 0 ? myIdx + 1 : null;
    overall.total_members = rankAgg.length;

    // ✅ AVAILABLE MONTHS — MonthlyScore + Activity dono se
    const [scoreMonths, activityMonths] = await Promise.all([
      MonthlyScore.distinct('month', { member_id: memberId }),
      Activity.distinct('month', { member_id: memberId }),
    ]);

    const availableMonths = [...new Set([...scoreMonths, ...activityMonths])]
      .filter(Boolean)
      .sort()
      .reverse();

    if (!availableMonths.includes(currentMonth)) {
      availableMonths.unshift(currentMonth);
    }

    // ═══ RECENT ACTIVITIES ═══
    const recentActivities = await Activity.find({ member_id: memberId })
      .sort({ submitted_at: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      current_month: currentMonth,
      selected_month: selectedMonth,
      month_data: monthData,
      overall,
      available_months: availableMonths,
      recent_activities: recentActivities.map((a) => ({
        id: a._id,
        platform: a.platform,
        activity_type: a.activity_type,
        status: a.status,
        points: a.points || 0,
        date: a.date,
        submitted_at: a.submitted_at,
      })),
    });
  } catch (error) {
    console.error('getDashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// GET NOTIFICATION PREFERENCES
// ═══════════════════════════════════════════
const getNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notification_preferences');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const defaults = {
      daily_reminder: true,
      streak_alerts: true,
      meetup_reminders: true,
      activity_updates: true,
      broadcasts: true,
      points_updates: true,
    };

    res.json({
      success: true,
      preferences: { ...defaults, ...(user.notification_preferences || {}) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// UPDATE NOTIFICATION PREFERENCES
// ═══════════════════════════════════════════
const updateNotificationPreferences = async (req, res) => {
  try {
    const allowed = [
      'daily_reminder', 'streak_alerts', 'meetup_reminders',
      'activity_updates', 'broadcasts', 'points_updates',
    ];

    const updates = {};
    for (const key of allowed) {
      if (typeof req.body[key] === 'boolean') {
        updates[`notification_preferences.${key}`] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid preferences to update' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('notification_preferences');

    res.json({
      success: true,
      message: 'Preferences updated',
      preferences: user.notification_preferences,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getProfile,
  createOrUpdateProfile,
  getPointsBreakdown,
  getDashboard,
  getNotificationPreferences,
  updateNotificationPreferences,
};