const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const { adminProtect } = require('../middlewares/adminAuth');

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

  // ═══ PHASE 2: Leaderboard, Analytics, Export ═══
  getActivityLeaderboard,
  getActivityAnalytics,
  exportActivitySubmissions,
} = require('../controllers/special.controller');

// ═══════════════════════════════════════════
// MEMBER ROUTES
// ═══════════════════════════════════════════
router.get('/my-activities', protect, getMemberSpecialActivities);
router.post('/:id/submit', protect, submitSpecialActivity);
router.get('/:id/leaderboard', protect, getActivityLeaderboard);

// ═══════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════
router.post('/', adminProtect, createSpecialActivity);
router.get('/', adminProtect, listSpecialActivities);

// Submissions (before /:id dynamic route)
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

// Phase 2: Analytics + Export
router.get('/:id/analytics', adminProtect, getActivityAnalytics);
router.get('/:id/export', adminProtect, exportActivitySubmissions);

// Dynamic last
router.get('/:id', adminProtect, getSpecialActivity);
router.put('/:id', adminProtect, updateSpecialActivity);
router.patch('/:id/status', adminProtect, updateSpecialStatus);
router.delete('/:id', adminProtect, deleteSpecialActivity);

module.exports = router;