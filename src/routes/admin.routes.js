const express = require('express');
const router = express.Router();
const {
  adminProtect,
  superAdminOnly,
  requirePermission,
  requireAnyPermission,
} = require('../middlewares/adminAuth');
const {
  adminLogin,
  getDashboardStats,
  listMembers,
  updateMemberStatus,
  getMemberDetail,
  updateMemberDetail,
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
  broadcastToMembers,
  getBroadcastHistory,
  deleteBroadcast,
  updateBroadcast,
  exportMembersCSV,
  exportMeetupAttendanceCSV,
  exportActivityLogCSV,
  exportMemberWiseCSV,
  getBadgesCatalog,
  searchUsersForBadges,
  giveBadgeToUser,
  giveAllBadgesToUser,
  removeBadgeFromUser,
  getAutoVerifySettings,
  toggleAutoVerify,
  updateAutoVerifyTiming,
  getAutoApprovedLog,
  overrideAutoApproved,
  // Admin Leaderboard + Reports
  getAdminLeaderboard,
  getMemberActivitiesReport,
  getMemberHeatmap,
  // ⬅️ NAYE EXPORTS
  exportMemberActivities,
  exportLeaderboard,
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
  searchMembersForLink,
  linkAdminToMember,
  unlinkAdminFromMember,
} = require('../controllers/adminManagement.controller');
const {
  listPopups,
  getPopup,
  createPopup,
  updatePopup,
  deletePopup,
  togglePopup,
  autofillSpecial,
  autofillMeetup,
} = require('../controllers/popup.controller');

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
// MEMBER DETAIL
// ═══════════════════════════════════════════
router.get('/members/:id/detail', adminProtect, getMemberDetail);
router.patch('/members/:id/detail', adminProtect, updateMemberDetail);
router.get('/members/:id/activities', adminProtect, getMemberActivitiesReport);
router.get('/members/:id/heatmap', adminProtect, getMemberHeatmap);
router.get('/members/:id/activities/export', adminProtect, exportMemberActivities);  // ⬅️ NEW

// ═══════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════
router.get('/activities', adminProtect, listActivities);
router.patch('/activities/:id/approve', adminProtect, approveActivity);
router.patch('/activities/:id/reject', adminProtect, rejectActivity);
router.post('/activities/bulk-approve', adminProtect, bulkApprove);
router.post('/activities/bulk-reject', adminProtect, bulkReject);

// ═══════════════════════════════════════════
// AUTO-VERIFICATION
// ═══════════════════════════════════════════
router.get('/auto-verify/settings', adminProtect, requirePermission('auto_verify.view'), getAutoVerifySettings);
router.post('/auto-verify/toggle', adminProtect, requirePermission('auto_verify.manage'), toggleAutoVerify);
router.patch('/auto-verify/timing', adminProtect, requirePermission('auto_verify.manage'), updateAutoVerifyTiming);
router.get('/auto-verify/log', adminProtect, requirePermission('auto_verify.view'), getAutoApprovedLog);
router.patch('/auto-verify/override/:id', adminProtect, requirePermission('auto_verify.manage'), overrideAutoApproved);

// ═══════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════
router.get('/reports/monthly', adminProtect, getMonthlyReport);
router.get('/reports/member-wise', adminProtect, getMemberWiseReport);
router.get('/reports/export', adminProtect, exportMonthlyCSV);
router.get('/reports/member-wise/export', adminProtect, exportMemberWiseCSV);

// ═══════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════
router.get('/leaderboard', adminProtect, getAdminLeaderboard);
router.get('/leaderboard/export', adminProtect, exportLeaderboard);  // ⬅️ NEW

// ═══════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════
router.get('/analytics', adminProtect, getAnalytics);

// ═══════════════════════════════════════════
// MIDNIGHT JOB
// ═══════════════════════════════════════════
router.post('/trigger-midnight-job', adminProtect, superAdminOnly, triggerMidnightJob);
router.get('/processing-status', adminProtect, getProcessingStatus);

// ═══════════════════════════════════════════
// MEETUPS
// ═══════════════════════════════════════════
router.post('/meetups', adminProtect, createMeetup);
router.get('/meetups', adminProtect, listMeetupsAdmin);
router.patch('/meetups/:id', adminProtect, updateMeetup);
router.delete('/meetups/:id', adminProtect, deleteMeetup);
router.get('/meetups/:id/rsvps', adminProtect, getMeetupRSVPs);
router.post('/meetups/:id/lock-location', adminProtect, lockLocation);
router.post('/meetups/:id/unlock-location', adminProtect, superAdminOnly, unlockLocation);
router.post('/meetups/:id/check-in', adminProtect, checkInMember);
router.patch('/meetups/:id/rsvps/:rsvp_id/x-link/review', adminProtect, reviewXLink);
router.patch('/meetups/:id/rsvps/:rsvp_id/instagram-link/review', adminProtect, reviewInstagramLink);
router.patch('/meetups/:id/rsvps/:rsvp_id', adminProtect, editMemberRSVP);
router.get('/meetups/:id/attendance-pdf', adminProtect, downloadMeetupAttendancePDF);

// ═══════════════════════════════════════════
// BADGE MANAGER
// ═══════════════════════════════════════════
router.get('/badges/catalog', adminProtect, requirePermission('badges.view'), getBadgesCatalog);
router.get('/badges/users', adminProtect, requirePermission('badges.view'), searchUsersForBadges);
router.post('/badges/users/:id/give', adminProtect, requirePermission('badges.manage'), giveBadgeToUser);
router.post('/badges/users/:id/give-all', adminProtect, requirePermission('badges.manage'), giveAllBadgesToUser);
router.delete('/badges/users/:id/remove/:badge_code', adminProtect, requirePermission('badges.manage'), removeBadgeFromUser);

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
router.get('/me', adminProtect, getMe);
router.post('/me/change-password', adminProtect, changeOwnPassword);
router.get('/admins/permissions', adminProtect, requirePermission('admins.view'), getAvailablePermissions);
router.get('/admins', adminProtect, requirePermission('admins.view'), listAdmins);
router.post('/admins', adminProtect, requirePermission('admins.manage'), createAdmin);
router.patch('/admins/:id', adminProtect, requirePermission('admins.manage'), updateAdmin);
router.post('/admins/:id/reset-password', adminProtect, requirePermission('admins.manage'), resetAdminPassword);
router.delete('/admins/:id', adminProtect, requirePermission('admins.manage'), deleteAdmin);

// ═══════════════════════════════════════════
// ADMIN ↔ MEMBER LINKING
// ═══════════════════════════════════════════
router.get('/admins/search-members', adminProtect, requirePermission('admins.manage'), searchMembersForLink);
router.patch('/admins/:id/link-member', adminProtect, requirePermission('admins.manage'), linkAdminToMember);
router.delete('/admins/:id/unlink-member', adminProtect, requirePermission('admins.manage'), unlinkAdminFromMember);

// ═══════════════════════════════════════════
// POPUP MESSAGES (Permission-based)
// ═══════════════════════════════════════════
router.get('/popups', adminProtect, requirePermission('popups.view'), listPopups);
router.get('/popups/autofill/special', adminProtect, requirePermission('popups.manage'), autofillSpecial);
router.get('/popups/autofill/meetup', adminProtect, requirePermission('popups.manage'), autofillMeetup);
router.get('/popups/:id', adminProtect, requirePermission('popups.view'), getPopup);
router.post('/popups', adminProtect, requirePermission('popups.manage'), createPopup);
router.patch('/popups/:id', adminProtect, requirePermission('popups.manage'), updatePopup);
router.delete('/popups/:id', adminProtect, requirePermission('popups.manage'), deletePopup);
router.patch('/popups/:id/toggle', adminProtect, requirePermission('popups.manage'), togglePopup);

module.exports = router;