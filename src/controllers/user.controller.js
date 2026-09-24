const User = require('../models/User');
const MonthlyScore = require('../models/MonthlyScore');

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
      .populate('member_id', 'first_name last_name telegram_username profile_photo_url');

    const leaderboard = scores.map((score, index) => ({
      rank: index + 1,
      name: getFullName(score.member_id),
      username: score.member_id?.telegram_username || 'unknown',
      avatarUrl: score.member_id?.profile_photo_url || '',
      points: score.total_points,
    }));

    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════
// GET STREAK LEADERBOARD (NEW)
// Top members by longest_streak (this month)
// ═══════════════════════════════════════════
exports.getStreakLeaderboard = async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Top 20 by longest_streak
    const scores = await MonthlyScore.find({
      month: currentMonth,
      longest_streak: { $gt: 0 },
    })
      .sort({ longest_streak: -1, current_streak: -1 })
      .limit(20)
      .populate('member_id', 'first_name last_name telegram_username profile_photo_url badges')
      .lean();

    const leaderboard = scores
      .filter((s) => s.member_id) // safety check
      .map((score, index) => {
        const user = score.member_id;

        // Top 3 badges (by streak_days desc)
        const userBadges = (user.badges || [])
          .sort((a, b) => b.streak_days - a.streak_days)
          .slice(0, 3)
          .map((b) => ({
            code: b.code,
            emoji: b.emoji,
            title: b.title,
          }));

        return {
          rank: index + 1,
          name: getFullName(user),
          username: user.telegram_username || 'unknown',
          avatarUrl: user.profile_photo_url || '',
          current_streak: score.current_streak || 0,
          longest_streak: score.longest_streak || 0,
          active_days: score.active_days || 0,
          badges: userBadges,
        };
      });

    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};