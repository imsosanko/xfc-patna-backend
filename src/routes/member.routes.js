const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const {
  getProfile,
  createOrUpdateProfile,
  getPointsBreakdown,
} = require('../controllers/member.controller');
const {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/notification.controller');

// ═══════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════
router.get('/profile', protect, getProfile);
router.put('/profile', protect, createOrUpdateProfile);

// ═══════════════════════════════════════════
// POINTS
// ═══════════════════════════════════════════
router.get('/points-breakdown', protect, getPointsBreakdown);

// ═══════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════
router.get('/notifications', protect, getMyNotifications);
router.get('/notifications/unread-count', protect, getUnreadCount);
router.patch('/notifications/read-all', protect, markAllAsRead);
router.patch('/notifications/:id/read', protect, markAsRead);
router.delete('/notifications/:id', protect, deleteNotification);

module.exports = router;