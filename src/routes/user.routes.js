const express = require('express');
const router = express.Router();
const { getUserProfile, getLeaderboard } = require('../controllers/user.controller');

// GET user profile by telegram ID
router.get('/profile/:telegramId', getUserProfile);

// GET leaderboard (top 10)
router.get('/leaderboard', getLeaderboard);

module.exports = router;