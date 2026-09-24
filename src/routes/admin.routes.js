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
  lockLocation,
  unlockLocation,
  checkInMember,
  reviewXLink,
  reviewInstagramLink,
  editMemberRSVP,
  downloadMeetupAttendancePDF,
  // Notifications
  broadcastToMembers,
  getBroadcastHistory,
  deleteBroadcast,
  updateBroadcast,
  // Data Exports
  exportMembersCSV,
  exportMeetupAttendanceCSV,
  exportActivityLogCSV,
  // Badge Manager ← NEW
  getBadgesCatalog,
  searchUsersForBadges,
  giveBadgeToUser,
  giveAllBadgesToUser,
  removeBadgeFromUser,
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
// MIDNIGHT JOB
// ═══════════════════════════════════════════
router.post('/trigger-midnight-job', adminProtect, triggerMidnightJob);
router.get('/processing-status', adminProtect, getProcessingStatus);

// ═══════════════════════════════════════════
// MEETUPS
// ═══════════════════════════════════════════

// Create / List / Update / Delete
router.post('/meetups', adminProtect, createMeetup);
router.get('/meetups', adminProtect, listMeetupsAdmin);
router.patch('/meetups/:id', adminProtect, updateMeetup);
router.delete('/meetups/:id', adminProtect, deleteMeetup);

// RSVPs list
router.get('/meetups/:id/rsvps', adminProtect, getMeetupRSVPs);

// Location lock
router.post('/meetups/:id/lock-location', adminProtect, lockLocation);
router.post('/meetups/:id/unlock-location', adminProtect, superAdminOnly, unlockLocation);

// Physical check-in (Admin manual)
router.post('/meetups/:id/check-in', adminProtect, checkInMember);

// Review submissions
router.patch('/meetups/:id/rsvps/:rsvp_id/x-link/review', adminProtect, reviewXLink);
router.patch('/meetups/:id/rsvps/:rsvp_id/instagram-link/review', adminProtect, reviewInstagramLink);

// Edit member RSVP (Admin override)
router.patch('/meetups/:id/rsvps/:rsvp_id', adminProtect, editMemberRSVP);

// Download Attendance PDF
router.get('/meetups/:id/attendance-pdf', adminProtect, downloadMeetupAttendancePDF);

// ═══════════════════════════════════════════
// BADGE MANAGER ← NEW
// ═══════════════════════════════════════════

// View catalog & search — any admin can view
router.get('/badges/catalog', adminProtect, getBadgesCatalog);
router.get('/badges/users', adminProtect, searchUsersForBadges);

// Give/Remove badges — SUPER ADMIN ONLY
router.post('/badges/users/:id/give', adminProtect, superAdminOnly, giveBadgeToUser);
router.post('/badges/users/:id/give-all', adminProtect, superAdminOnly, giveAllBadgesToUser);
router.delete('/badges/users/:id/remove/:badge_code', adminProtect, superAdminOnly, removeBadgeFromUser);

// ═══════════════════════════════════════════
// NOTIFICATIONS / BROADCAST
// ═══════════════════════════════════════════
router.post('/broadcast/delete', adminProtect, deleteBroadcast);
router.post('/broadcast/update', adminProtect, updateBroadcast);
router.get('/broadcast/history', adminProtect, getBroadcastHistory);
router.post('/broadcast', adminProtect, broadcastToMembers);

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