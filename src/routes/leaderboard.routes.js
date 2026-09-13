const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const { getLeaderboard } = require('../controllers/leaderboard.controller');

/**
 * GET /api/leaderboard
 * Leaderboard fetch karo (month/filter ke saath)
 */
router.get('/', protect, getLeaderboard);

module.exports = router;