const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const { adminProtect } = require('../middlewares/adminAuth');
const { anyAuth } = require('../middlewares/anyAuth');

const {
  // ═══ ADMIN ═══
  createSpecialActivity,
  listSpecialActivities,
  getSpecialActivity,
  updateSpecialActivity,
  updateSpecialStatus,
  deleteSpecialActivity,
  verifySubmissionItem,
  bulkVerifyItems,
  editMemberSubmission,

  // ═══ MEMBER ═══
  getMemberSpecialActivities,
  submitSpecialActivity,

  // ═══ PHASE 2 ═══
  getActivityLeaderboard,
  getActivityAnalytics,
  exportActivitySubmissions,
} = require('../controllers/special.controller');

// ═══════════════════════════════════════════
// MEMBER ROUTES
// ═══════════════════════════════════════════
router.get('/my-activities', protect, getMemberSpecialActivities);
router.post('/:id/submit', protect, submitSpecialActivity);

// ✅ FIX: Admin + Member both allowed
router.get('/:id/leaderboard', anyAuth, getActivityLeaderboard);

// ═══════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════
router.post('/', adminProtect, createSpecialActivity);
router.get('/', adminProtect, listSpecialActivities);

router.patch(
  '/submissions/:submissionId/items/:itemIndex',
  adminProtect,
  verifySubmissionItem
);
router.post(
  '/submissions/:submissionId/bulk-verify',
  adminProtect,
  bulkVerifyItems
);
router.patch('/submissions/:submissionId', adminProtect, editMemberSubmission);

router.get('/:id/analytics', adminProtect, getActivityAnalytics);
router.get('/:id/export', adminProtect, exportActivitySubmissions);

router.get('/:id', adminProtect, getSpecialActivity);
router.put('/:id', adminProtect, updateSpecialActivity);
router.patch('/:id/status', adminProtect, updateSpecialStatus);
router.delete('/:id', adminProtect, deleteSpecialActivity);

module.exports = router;