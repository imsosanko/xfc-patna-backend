const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  getLeaderboard,
  getStreakLeaderboard,
  refreshMyPhoto,
} = require('../controllers/user.controller');
const { protect } = require('../middlewares/telegramAuth');

// GET user profile by telegram ID
router.get('/profile/:telegramId', getUserProfile);

// GET leaderboard (top 10 by points)
router.get('/leaderboard', getLeaderboard);

// GET streak leaderboard (top 20 by longest_streak)
router.get('/streak-leaderboard', getStreakLeaderboard);

// POST refresh my photo ⬅️ NEW
router.post('/refresh-my-photo', protect, refreshMyPhoto);

module.exports = router;