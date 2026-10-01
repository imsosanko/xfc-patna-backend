const User = require('../models/User');
const MonthlyScore = require('../models/MonthlyScore');
const MemberProfile = require('../models/MemberProfile');
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
// Supports: ?range=month (default) | ?range=all
// ═══════════════════════════════════════════
exports.getLeaderboard = async (req, res) => {
  try {
    const { range = 'month' } = req.query;
    const currentMonth = new Date().toISOString().slice(0, 7);

    let leaderboard;

    if (range === 'all') {
      // ⬇️ ALL TIME — saare months aggregate karo
      const scores = await MonthlyScore.aggregate([
        {
          $group: {
            _id: '$member_id',
            total_points: { $sum: '$total_points' },
            verified_activities: { $sum: '$verified_activities' },
            active_days: { $sum: '$active_days' },
            longest_streak: { $max: '$longest_streak' },
            current_streak: { $max: '$current_streak' },
          },
        },
        { $sort: { total_points: -1 } },
        { $limit: 100 },
      ]);

      const memberIds = scores.map((s) => s._id);
      const users = await User.find({ _id: { $in: memberIds } })
        .select('first_name last_name telegram_username profile_photo_url role badges admin_badges')
        .lean();
      const profiles = await MemberProfile.find({ user_id: { $in: memberIds } }).lean();

      const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
      const profileMap = Object.fromEntries(profiles.map((p) => [String(p.user_id), p]));

      leaderboard = scores
        .map((s, index) => {
          const user = userMap[String(s._id)];
          const profile = profileMap[String(s._id)];
          if (!user) return null;

          const userBadges = (user.badges || [])
            .sort((a, b) => (b.streak_days || 0) - (a.streak_days || 0))
            .slice(0, 3)
            .map((b) => ({ code: b.code, emoji: b.emoji, title: b.title }));

          const userAdminBadges = (user.admin_badges || [])
            .slice(0, 3)
            .map((b) => ({ code: b.code, emoji: b.emoji, title: b.title, color: b.color }));

          return {
            rank: index + 1,
            member_id: s._id,
            name: profile?.full_name || getFullName(user),
            username: user.telegram_username || 'unknown',
            avatarUrl: user.profile_photo_url || '',
            role: user.role || 'MEMBER',
            badges: userBadges,
            admin_badges: userAdminBadges,
            points: Math.round(s.total_points * 100) / 100,
            verified_activities: s.verified_activities || 0,
            active_days: s.active_days || 0,
            longest_streak: s.longest_streak || 0,
            current_streak: s.current_streak || 0,
          };
        })
        .filter(Boolean);
    } else {
      // ⬇️ THIS MONTH (default)
      const scores = await MonthlyScore.find({ month: currentMonth })
        .sort({ total_points: -1 })
        .limit(100)
        .populate('member_id', 'first_name last_name telegram_username profile_photo_url role badges admin_badges');

      leaderboard = scores.map((score, index) => {
        const user = score.member_id;

        const userBadges = (user?.badges || [])
          .sort((a, b) => (b.streak_days || 0) - (a.streak_days || 0))
          .slice(0, 3)
          .map((b) => ({ code: b.code, emoji: b.emoji, title: b.title }));

        const userAdminBadges = (user?.admin_badges || [])
          .slice(0, 3)
          .map((b) => ({ code: b.code, emoji: b.emoji, title: b.title, color: b.color }));

        return {
          rank: index + 1,
          member_id: user?._id || null,
          name: getFullName(user),
          username: user?.telegram_username || 'unknown',
          avatarUrl: user?.profile_photo_url || '',
          role: user?.role || 'MEMBER',
          badges: userBadges,
          admin_badges: userAdminBadges,
          points: Math.round(score.total_points * 100) / 100,
          verified_activities: score.verified_activities || 0,
          active_days: score.active_days || 0,
          longest_streak: score.longest_streak || 0,
          current_streak: score.current_streak || 0,
        };
      });
    }

    res.json(leaderboard);
  } catch (error) {
    console.error('getLeaderboard error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════
// GET STREAK LEADERBOARD
// Supports: ?range=month (default) | ?range=all
// ═══════════════════════════════════════════
exports.getStreakLeaderboard = async (req, res) => {
  try {
    const { range = 'month' } = req.query;
    const currentMonth = new Date().toISOString().slice(0, 7);

    let leaderboard;

    if (range === 'all') {
      // ⬇️ ALL TIME — max streak across all months
      const scores = await MonthlyScore.aggregate([
        {
          $group: {
            _id: '$member_id',
            longest_streak: { $max: '$longest_streak' },
            current_streak: { $max: '$current_streak' },
            active_days: { $sum: '$active_days' },
          },
        },
        { $match: { longest_streak: { $gt: 0 } } },
        { $sort: { longest_streak: -1, current_streak: -1 } },
        { $limit: 100 },
      ]);

      const memberIds = scores.map((s) => s._id);
      const users = await User.find({ _id: { $in: memberIds } })
        .select('first_name last_name telegram_username profile_photo_url role badges admin_badges')
        .lean();
      const profiles = await MemberProfile.find({ user_id: { $in: memberIds } }).lean();

      const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
      const profileMap = Object.fromEntries(profiles.map((p) => [String(p.user_id), p]));

      leaderboard = scores
        .map((s, index) => {
          const user = userMap[String(s._id)];
          const profile = profileMap[String(s._id)];
          if (!user) return null;

          const userBadges = (user.badges || [])
            .sort((a, b) => (b.streak_days || 0) - (a.streak_days || 0))
            .slice(0, 3)
            .map((b) => ({ code: b.code, emoji: b.emoji, title: b.title }));

          const userAdminBadges = (user.admin_badges || [])
            .slice(0, 3)
            .map((b) => ({ code: b.code, emoji: b.emoji, title: b.title, color: b.color }));

          return {
            rank: index + 1,
            member_id: s._id,
            name: profile?.full_name || getFullName(user),
            username: user.telegram_username || 'unknown',
            avatarUrl: user.profile_photo_url || '',
            role: user.role || 'MEMBER',
            current_streak: s.current_streak || 0,
            longest_streak: s.longest_streak || 0,
            active_days: s.active_days || 0,
            badges: userBadges,
            admin_badges: userAdminBadges,
          };
        })
        .filter(Boolean);
    } else {
      // ⬇️ THIS MONTH
      const scores = await MonthlyScore.find({
        month: currentMonth,
        longest_streak: { $gt: 0 },
      })
        .sort({ longest_streak: -1, current_streak: -1 })
        .limit(100)
        .populate('member_id', 'first_name last_name telegram_username profile_photo_url role badges admin_badges')
        .lean();

      leaderboard = scores
        .filter((s) => s.member_id)
        .map((score, index) => {
          const user = score.member_id;

          const userBadges = (user.badges || [])
            .sort((a, b) => (b.streak_days || 0) - (a.streak_days || 0))
            .slice(0, 3)
            .map((b) => ({ code: b.code, emoji: b.emoji, title: b.title }));

          const userAdminBadges = (user.admin_badges || [])
            .slice(0, 3)
            .map((b) => ({ code: b.code, emoji: b.emoji, title: b.title, color: b.color }));

          return {
            rank: index + 1,
            member_id: user._id,
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
    }

    res.json(leaderboard);
  } catch (error) {
    console.error('getStreakLeaderboard error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════
// REFRESH MY PROFILE PHOTO
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