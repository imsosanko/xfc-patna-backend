const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  getLeaderboard,
  getStreakLeaderboard,
} = require('../controllers/user.controller');

// GET user profile by telegram ID
router.get('/profile/:telegramId', getUserProfile);

// GET leaderboard (top 10 by points)
router.get('/leaderboard', getLeaderboard);

// GET streak leaderboard (top 20 by longest_streak) ← NEW
router.get('/streak-leaderboard', getStreakLeaderboard);

module.exports = router;