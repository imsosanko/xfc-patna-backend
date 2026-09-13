const express = require('express');
const router = express.Router();
const { adminProtect } = require('../middlewares/adminAuth');
const {
  adminLogin,
  getDashboardStats,
  listMembers,
  updateMemberStatus,
  listActivities,
  approveActivity,
  rejectActivity,
  bulkApprove,
  bulkReject,
  getMonthlyReport,
  getMemberWiseReport,
  getAnalytics,
  exportMonthlyCSV,
  triggerMidnightJob,
  getProcessingStatus,
} = require('../controllers/admin.controller');

// ═══════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════
router.post('/login', adminLogin);

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
router.get('/dashboard', adminProtect, getDashboardStats);

// ═══════════════════════════════════════════
// MEMBERS
// ═══════════════════════════════════════════
router.get('/members', adminProtect, listMembers);
router.patch('/members/:id/status', adminProtect, updateMemberStatus);

// ═══════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════
router.get('/activities', adminProtect, listActivities);
router.patch('/activities/:id/approve', adminProtect, approveActivity);
router.patch('/activities/:id/reject', adminProtect, rejectActivity);
router.post('/activities/bulk-approve', adminProtect, bulkApprove);
router.post('/activities/bulk-reject', adminProtect, bulkReject);

// ═══════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════
router.get('/reports/monthly', adminProtect, getMonthlyReport);
router.get('/reports/member-wise', adminProtect, getMemberWiseReport);
router.get('/reports/export', adminProtect, exportMonthlyCSV);

// ═══════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════
router.get('/analytics', adminProtect, getAnalytics);

// ═══════════════════════════════════════════
// MIDNIGHT JOB (Manual Trigger + Status)
// ═══════════════════════════════════════════
router.post('/trigger-midnight-job', adminProtect, triggerMidnightJob);
router.get('/processing-status', adminProtect, getProcessingStatus);

module.exports = router;