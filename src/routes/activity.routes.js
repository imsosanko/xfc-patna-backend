const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const { 
  submitActivity, 
  submitBulk, 
  getMyActivities 
} = require('../controllers/activity.controller');

/**
 * POST /api/activities
 * Single activity submit karo
 */
router.post('/', protect, submitActivity);

/**
 * POST /api/activities/bulk
 * Multiple activities ek saath submit karo (no fixed limit)
 */
router.post('/bulk', protect, submitBulk);

/**
 * GET /api/activities
 * Member ki apni activities
 */
router.get('/', protect, getMyActivities);

module.exports = router;