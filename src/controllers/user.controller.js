const User = require('../models/User');
const MonthlyScore = require('../models/MonthlyScore');
const { getUserProfilePhoto } = require('../services/telegramBot.service');

// Helper: Full name banao
const getFullName = (user) => {
  if (!user) return 'Unknown';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
};

// ═══════════════════════════════════════════
// GET USER PROFILE
// ═══════════════════════════════════════════
exports.getUserProfile = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const user = await User.findOne({ telegram_id: telegramId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const currentMonth = new Date().toISOString().slice(0, 7);
    const score = await MonthlyScore.findOne({
      member_id: user._id,
      month: currentMonth,
    });

    res.json({
      name: getFullName(user),
      username: user.telegram_username || 'unknown',
      telegramId: user.telegram_id,
      avatarUrl: user.profile_photo_url || '',
      role: user.role || 'MEMBER',
      badges: user.badges || [],
      admin_badges: user.admin_badges || [],
      total_points: score ? score.total_points : 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════
// GET LEADERBOARD (Points-based)
// ═══════════════════════════════════════════
exports.getLeaderboard = async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const scores = await MonthlyScore.find({ month: currentMonth })
      .sort({ total_points: -1 })
      .limit(10)
      .populate('member_id', 'first_name last_name telegram_username profile_photo_url role badges admin_badges');

    const leaderboard = scores.map((score, index) => {
      const user = score.member_id;

      const userBadges = (user?.badges || [])
        .sort((a, b) => (b.streak_days || 0) - (a.streak_days || 0))
        .slice(0, 3)
        .map((b) => ({
          code: b.code,
          emoji: b.emoji,
          title: b.title,
        }));

      const userAdminBadges = (user?.admin_badges || [])
        .slice(0, 3)
        .map((b) => ({
          code: b.code,
          emoji: b.emoji,
          title: b.title,
          color: b.color,
        }));

      return {
        rank: index + 1,
        name: getFullName(user),
        username: user?.telegram_username || 'unknown',
        avatarUrl: user?.profile_photo_url || '',
        role: user?.role || 'MEMBER',
        badges: userBadges,
        admin_badges: userAdminBadges,
        points: score.total_points,
      };
    });

    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════
// GET STREAK LEADERBOARD
// ═══════════════════════════════════════════
exports.getStreakLeaderboard = async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);

    const scores = await MonthlyScore.find({
      month: currentMonth,
      longest_streak: { $gt: 0 },
    })
      .sort({ longest_streak: -1, current_streak: -1 })
      .limit(20)
      .populate('member_id', 'first_name last_name telegram_username profile_photo_url role badges admin_badges')
      .lean();

    const leaderboard = scores
      .filter((s) => s.member_id)
      .map((score, index) => {
        const user = score.member_id;

        const userBadges = (user.badges || [])
          .sort((a, b) => (b.streak_days || 0) - (a.streak_days || 0))
          .slice(0, 3)
          .map((b) => ({
            code: b.code,
            emoji: b.emoji,
            title: b.title,
          }));

        const userAdminBadges = (user.admin_badges || [])
          .slice(0, 3)
          .map((b) => ({
            code: b.code,
            emoji: b.emoji,
            title: b.title,
            color: b.color,
          }));

        return {
          rank: index + 1,
          name: getFullName(user),
          username: user.telegram_username || 'unknown',
          avatarUrl: user.profile_photo_url || '',
          role: user.role || 'MEMBER',
          current_streak: score.current_streak || 0,
          longest_streak: score.longest_streak || 0,
          active_days: score.active_days || 0,
          badges: userBadges,
          admin_badges: userAdminBadges,
        };
      });

    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════
// REFRESH MY PROFILE PHOTO ⬅️ NEW
// ═══════════════════════════════════════════
exports.refreshMyPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.telegram_id) {
      return res.status(400).json({ success: false, error: 'No telegram ID' });
    }

    const freshUrl = await getUserProfilePhoto(user.telegram_id);

    if (freshUrl && freshUrl !== user.profile_photo_url) {
      user.profile_photo_url = freshUrl;
      await user.save();
      return res.json({
        success: true,
        updated: true,
        profile_photo_url: freshUrl,
      });
    }

    if (!freshUrl && user.profile_photo_url) {
      user.profile_photo_url = '';
      await user.save();
      return res.json({
        success: true,
        updated: true,
        profile_photo_url: '',
      });
    }

    res.json({
      success: true,
      updated: false,
      profile_photo_url: user.profile_photo_url,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};