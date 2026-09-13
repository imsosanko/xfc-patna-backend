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
} = require('../controllers/admin.controller');

// Public
router.post('/login', adminLogin);

// Protected
router.get('/dashboard', adminProtect, getDashboardStats);
router.get('/members', adminProtect, listMembers);
router.patch('/members/:id/status', adminProtect, updateMemberStatus);
router.get('/activities', adminProtect, listActivities);
router.patch('/activities/:id/approve', adminProtect, approveActivity);
router.patch('/activities/:id/reject', adminProtect, rejectActivity);
router.post('/activities/bulk-approve', adminProtect, bulkApprove);
router.post('/activities/bulk-reject', adminProtect, bulkReject);

module.exports = router;