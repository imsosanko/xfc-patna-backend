const express = require('express');
const router = express.Router();
const {
  adminProtect,
  superAdminOnly,
} = require('../middlewares/adminAuth');
const {
  adminLogin,
  getDashboardStats,
  listMembers,
  updateMemberStatus,
  adjustMemberPoints,
  getMemberPointsBreakdown,
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
  // Meetups
  createMeetup,
  updateMeetup,
  deleteMeetup,
  listMeetupsAdmin,
  getMeetupRSVPs,
  checkInMember,
  // Notifications
  broadcastToMembers,
  getBroadcastHistory,
  deleteBroadcast,
  updateBroadcast,
  // Data Exports
  exportMembersCSV,
  exportMeetupAttendanceCSV,
  exportActivityLogCSV,
} = require('../controllers/admin.controller');
const {
  getMe,
  getAvailablePermissions,
  changeOwnPassword,
  listAdmins,
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  deleteAdmin,
} = require('../controllers/adminManagement.controller');

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
router.post('/members/:id/adjust-points', adminProtect, adjustMemberPoints);
router.get('/members/:id/points-breakdown', adminProtect, getMemberPointsBreakdown);

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

// ═══════════════════════════════════════════
// MEETUPS
// ═══════════════════════════════════════════
router.post('/meetups', adminProtect, createMeetup);
router.get('/meetups', adminProtect, listMeetupsAdmin);
router.patch('/meetups/:id', adminProtect, updateMeetup);
router.delete('/meetups/:id', adminProtect, deleteMeetup);
router.get('/meetups/:id/rsvps', adminProtect, getMeetupRSVPs);
router.post('/meetups/:id/check-in', adminProtect, checkInMember);

// ═══════════════════════════════════════════
// NOTIFICATIONS / BROADCAST
// ═══════════════════════════════════════════
router.post('/broadcast', adminProtect, broadcastToMembers);
router.get('/broadcast/history', adminProtect, getBroadcastHistory);
router.delete('/broadcast/:broadcast_id', adminProtect, deleteBroadcast);
router.patch('/broadcast/:broadcast_id', adminProtect, updateBroadcast);

// ═══════════════════════════════════════════
// DATA EXPORTS
// ═══════════════════════════════════════════
router.get('/export/members', adminProtect, exportMembersCSV);
router.get('/export/meetup-attendance', adminProtect, exportMeetupAttendanceCSV);
router.get('/export/activity-log', adminProtect, exportActivityLogCSV);

// ═══════════════════════════════════════════
// ADMIN MANAGEMENT
// ═══════════════════════════════════════════

// Self (any logged-in admin)
router.get('/me', adminProtect, getMe);
router.post('/me/change-password', adminProtect, changeOwnPassword);

// Super admin only — permissions list
router.get('/admins/permissions', adminProtect, superAdminOnly, getAvailablePermissions);

// Super admin only — manage admins
router.get('/admins', adminProtect, superAdminOnly, listAdmins);
router.post('/admins', adminProtect, superAdminOnly, createAdmin);
router.patch('/admins/:id', adminProtect, superAdminOnly, updateAdmin);
router.post('/admins/:id/reset-password', adminProtect, superAdminOnly, resetAdminPassword);
router.delete('/admins/:id', adminProtect, superAdminOnly, deleteAdmin);

module.exports = router;