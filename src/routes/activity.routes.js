const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const { 
  submitActivity, 
  submitBulk, 
  getMyActivities,
  getActivitySettings 
} = require('../controllers/activity.controller');

// ✅ Settings fetch route (must be above dynamic routes)
router.get('/settings', getActivitySettings);

router.post('/', protect, submitActivity);
router.post('/bulk', protect, submitBulk);
router.get('/', protect, getMyActivities);

module.exports = router;