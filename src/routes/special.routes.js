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
  getMemberSpecialActivities,
  submitSpecialActivity,
} = require('../controllers/special.controller');

// ═══════════════════════════════════════════
// MEMBER ROUTES
// ═══════════════════════════════════════════
router.get('/my-activities', protect, getMemberSpecialActivities);
router.post('/:id/submit', protect, submitSpecialActivity);

// ═══════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════
router.post('/', adminProtect, createSpecialActivity);
router.get('/', adminProtect, listSpecialActivities);
router.get('/:id', adminProtect, getSpecialActivity);
router.put('/:id', adminProtect, updateSpecialActivity);
router.patch('/:id/status', adminProtect, updateSpecialStatus);
router.delete('/:id', adminProtect, deleteSpecialActivity);
router.patch(
  '/submissions/:submissionId/items/:itemIndex',
  adminProtect,
  verifySubmissionItem
);

module.exports = router;