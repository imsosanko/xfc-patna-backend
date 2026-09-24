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
// GET LEADERBOARD
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