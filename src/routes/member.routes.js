const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const {
  getProfile,
  createOrUpdateProfile,
  getPointsBreakdown,
} = require('../controllers/member.controller');

/**
 * GET /api/member/profile
 * Logged-in member ka profile
 */
router.get('/profile', protect, getProfile);

/**
 * PUT /api/member/profile
 * Profile create ya update karo
 */
router.put('/profile', protect, createOrUpdateProfile);

/**
 * GET /api/member/points-breakdown
 * Points ka breakdown (regular, special, meetup, manual)
 */
router.get('/points-breakdown', protect, getPointsBreakdown);

module.exports = router;