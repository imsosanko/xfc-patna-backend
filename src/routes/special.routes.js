const express = require('express');
const router = express.Router();
const { adminProtect } = require('../middlewares/adminAuth');
const { protect } = require('../middlewares/telegramAuth');
const {
  createSpecialActivity,
  listSpecialActivities,
  getSpecialActivity,
  updateSpecialActivity,
  updateSpecialStatus,
  deleteSpecialActivity,
  verifySubmissionItem,
  bulkVerifyItems,
  editMemberSubmission,
  getMemberSpecialActivities,
  submitSpecialActivity,
} = require('../controllers/special.controller');

// ═══════════════════════════════════════════
// MEMBER ROUTES
// ═══════════════════════════════════════════
router.get('/my-activities', protect, getMemberSpecialActivities);
router.post('/:id/submit', protect, submitSpecialActivity);

// ═══════════════════════════════════════════
// ADMIN ROUTES — SUBMISSIONS (must come BEFORE /:id)
// ═══════════════════════════════════════════

// Bulk verify all pending items
router.post(
  '/submissions/:submissionId/bulk-verify',
  adminProtect,
  bulkVerifyItems
);

// Edit member submission (admin override)
router.patch(
  '/submissions/:submissionId',
  adminProtect,
  editMemberSubmission
);

// Per-item approve/reject
router.patch(
  '/submissions/:submissionId/items/:itemIndex',
  adminProtect,
  verifySubmissionItem
);

// ═══════════════════════════════════════════
// ADMIN ROUTES — ACTIVITIES
// ═══════════════════════════════════════════
router.post('/', adminProtect, createSpecialActivity);
router.get('/', adminProtect, listSpecialActivities);
router.get('/:id', adminProtect, getSpecialActivity);
router.put('/:id', adminProtect, updateSpecialActivity);
router.patch('/:id/status', adminProtect, updateSpecialStatus);
router.delete('/:id', adminProtect, deleteSpecialActivity);

module.exports = router;