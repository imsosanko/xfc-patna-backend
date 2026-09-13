const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const Activity = require('../models/Activity');
const DailySummary = require('../models/DailySummary');
const MonthlyScore = require('../models/MonthlyScore');
const SystemSetting = require('../models/SystemSetting');
const {
  formatDateIST,
  getYesterdayIST,
} = require('../services/points.service');

// ═══════════════════════════════════════════
// ADMIN LOGIN
// ═══════════════════════════════════════════
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password required',
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });

    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is inactive',
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    admin.last_login = new Date();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════
const getDashboardStats = async (req, res) => {
  try {
    const today = formatDateIST();
    const currentMonth = today.substring(0, 7);

    const [
      totalMembers,
      activeMembers,
      totalActivities,
      pendingActivities,
      approvedActivities,
      rejectedActivities,
      todayActivities,
      monthActivities,
    ] = await Promise.all([
      User.countDocuments({ role: 'MEMBER' }),
      User.countDocuments({ role: 'MEMBER', status: 'ACTIVE' }),
      Activity.countDocuments(),
      Activity.countDocuments({ status: 'PENDING' }),
      Activity.countDocuments({ status: 'APPROVED' }),
      Activity.countDocuments({ status: 'REJECTED' }),
      Activity.countDocuments({ date: today }),
      Activity.countDocuments({ month: currentMonth }),
    ]);

    res.json({
      success: true,
      stats: {
        totalMembers,
        activeMembers,
        totalActivities,
        pendingActivities,
        approvedActivities,
        rejectedActivities,
        todayActivities,
        monthActivities,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// LIST MEMBERS
// ═══════════════════════════════════════════
const listMembers = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { role: 'MEMBER' };
    if (status) query.status = status;

    let memberIds = null;
    if (search) {
      const profiles = await MemberProfile.find({
        $or: [
          { full_name: { $regex: search, $options: 'i' } },
          { xiaomi_id: { $regex: search, $options: 'i' } },
          { whatsapp_number: { $regex: search, $options: 'i' } },
          { telegram_username: { $regex: search, $options: 'i' } },
        ],
      }).select('user_id');
      memberIds = profiles.map((p) => p.user_id);
      query._id = { $in: memberIds };
    }

    const [members, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query),
    ]);

    const currentMonth = formatDateIST().substring(0, 7);

    const enriched = await Promise.all(
      members.map(async (m) => {
        const profile = await MemberProfile.findOne({ user_id: m._id });
        const score = await MonthlyScore.findOne({
          member_id: m._id,
          month: currentMonth,
        });
        return {
          id: m._id,
          telegram_id: m.telegram_id,
          telegram_username: m.telegram_username,
          first_name: m.first_name,
          last_name: m.last_name,
          profile_photo_url: m.profile_photo_url,
          status: m.status,
          full_name: profile?.full_name || 'N/A',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          whatsapp_number: profile?.whatsapp_number || 'N/A',
          points: score?.total_points || 0,
          activities: score?.verified_activities || 0,
          active_days: score?.active_days || 0,
          streak: score?.current_streak || 0,
          createdAt: m.createdAt,
        };
      })
    );

    res.json({
      success: true,
      total,
      page: parseInt(page),
      members: enriched,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// BLOCK/UNBLOCK MEMBER
// ═══════════════════════════════════════════
const updateMemberStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'BLOCKED', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const user = await User.findByIdAndUpdate(id, { status }, { new: true });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    res.json({ success: true, user: { id: user._id, status: user.status } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// LIST ACTIVITIES
// ═══════════════════════════════════════════
const listActivities = async (req, res) => {
  try {
    const { status, month, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) query.status = status;
    if (month) query.month = month;

    const [activities, total] = await Promise.all([
      Activity.find(query)
        .sort({ submitted_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('member_id', 'first_name last_name telegram_username'),
      Activity.countDocuments(query),
    ]);

    const enriched = await Promise.all(
      activities.map(async (a) => {
        const profile = await MemberProfile.findOne({ user_id: a.member_id });
        return {
          id: a._id,
          activity_id: a.activity_id,
          member_name: profile?.full_name || a.member_id?.first_name || 'Unknown',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          telegram_username: a.member_id?.telegram_username || '',
          date: a.date,
          month: a.month,
          platform: a.platform,
          activity_type: a.activity_type,
          url: a.url,
          status: a.status,
          submitted_at: a.submitted_at,
          verified_at: a.verified_at,
          points: a.points,
          rejection_reason: a.rejection_reason,
        };
      })
    );

    res.json({
      success: true,
      total,
      page: parseInt(page),
      activities: enriched,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// APPROVE ACTIVITY
// ═══════════════════════════════════════════
const approveActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    activity.status = 'APPROVED';
    activity.verified_at = new Date();
    activity.verified_by = req.admin._id;
    await activity.save();

    await DailySummary.findOneAndUpdate(
      { member_id: activity.member_id, date: activity.date },
      { $inc: { approved: 1 }, $setOnInsert: { month: activity.month } },
      { upsert: true }
    );

    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// REJECT ACTIVITY
// ═══════════════════════════════════════════
const rejectActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const activity = await Activity.findById(id);
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    activity.status = 'REJECTED';
    activity.verified_at = new Date();
    activity.verified_by = req.admin._id;
    activity.rejection_reason = reason || 'No reason provided';
    await activity.save();

    await DailySummary.findOneAndUpdate(
      { member_id: activity.member_id, date: activity.date },
      { $inc: { rejected: 1 } },
      { upsert: true }
    );

    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// BULK APPROVE
// ═══════════════════════════════════════════
const bulkApprove = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No IDs provided' });
    }

    const result = await Activity.updateMany(
      { _id: { $in: ids }, status: 'PENDING' },
      {
        $set: {
          status: 'APPROVED',
          verified_at: new Date(),
          verified_by: req.admin._id,
        },
      }
    );

    res.json({ success: true, modified: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// BULK REJECT
// ═══════════════════════════════════════════
const bulkReject = async (req, res) => {
  try {
    const { ids, reason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No IDs provided' });
    }

    const result = await Activity.updateMany(
      { _id: { $in: ids }, status: 'PENDING' },
      {
        $set: {
          status: 'REJECTED',
          verified_at: new Date(),
          verified_by: req.admin._id,
          rejection_reason: reason || 'Bulk rejected',
        },
      }
    );

    res.json({ success: true, modified: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MONTHLY REPORT
// ═══════════════════════════════════════════
const getMonthlyReport = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const months = [
      `${currentYear}-01`, `${currentYear}-02`, `${currentYear}-03`,
      `${currentYear}-04`, `${currentYear}-05`, `${currentYear}-06`,
      `${currentYear}-07`, `${currentYear}-08`, `${currentYear}-09`,
      `${currentYear}-10`, `${currentYear}-11`, `${currentYear}-12`,
    ];

    const report = await Activity.aggregate([
      { $match: { month: { $in: months } } },
      {
        $group: {
          _id: '$month',
          totalLinks: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          uniqueMembers: { $addToSet: '$member_id' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          month: '$_id',
          _id: 0,
          totalLinks: 1,
          approved: 1,
          rejected: 1,
          pending: 1,
          activeMembers: { $size: '$uniqueMembers' },
        },
      },
    ]);

    const filteredReport = report.filter((r) => r.totalLinks > 0);

    res.json({
      success: true,
      year: currentYear,
      report: filteredReport,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEMBER-WISE REPORT
// ═══════════════════════════════════════════
const getMemberWiseReport = async (req, res) => {
  try {
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({
        success: false,
        error: 'Month is required (YYYY-MM)',
      });
    }

    const report = await Activity.aggregate([
      { $match: { month } },
      {
        $group: {
          _id: '$member_id',
          totalLinks: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          activeDays: { $addToSet: '$date' },
        },
      },
      {
        $lookup: {
          from: 'memberprofiles',
          localField: '_id',
          foreignField: 'user_id',
          as: 'profile',
        },
      },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          member_id: '$_id',
          _id: 0,
          member_name: { $ifNull: ['$profile.full_name', 'Unknown'] },
          xiaomi_id: { $ifNull: ['$profile.xiaomi_id', 'N/A'] },
          telegram_username: { $ifNull: ['$profile.telegram_username', ''] },
          totalLinks: 1,
          approved: 1,
          rejected: 1,
          pending: 1,
          activeDays: { $size: '$activeDays' },
        },
      },
      { $sort: { approved: -1, totalLinks: -1 } },
    ]);

    res.json({
      success: true,
      month,
      report,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════
const getAnalytics = async (req, res) => {
  try {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(monthStr);
    }

    const monthlyTrend = await Activity.aggregate([
      { $match: { month: { $in: months } } },
      {
        $group: {
          _id: '$month',
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
          uniqueMembers: { $addToSet: '$member_id' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          month: '$_id',
          _id: 0,
          total: 1,
          approved: 1,
          activeMembers: { $size: '$uniqueMembers' },
        },
      },
    ]);

    const platformDist = await Activity.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $project: { platform: '$_id', count: 1, _id: 0 } },
    ]);

    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const topMembers = await Activity.aggregate([
      { $match: { month: currentMonth, status: 'APPROVED' } },
      { $group: { _id: '$member_id', approved: { $sum: 1 } } },
      { $sort: { approved: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'memberprofiles',
          localField: '_id',
          foreignField: 'user_id',
          as: 'profile',
        },
      },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          member_id: '$_id',
          _id: 0,
          name: { $ifNull: ['$profile.full_name', 'Unknown'] },
          xiaomi_id: { $ifNull: ['$profile.xiaomi_id', 'N/A'] },
          approved: 1,
        },
      },
    ]);

    res.json({
      success: true,
      monthlyTrend,
      platformDistribution: platformDist,
      topMembers,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════
const exportMonthlyCSV = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const months = [
      `${currentYear}-01`, `${currentYear}-02`, `${currentYear}-03`,
      `${currentYear}-04`, `${currentYear}-05`, `${currentYear}-06`,
      `${currentYear}-07`, `${currentYear}-08`, `${currentYear}-09`,
      `${currentYear}-10`, `${currentYear}-11`, `${currentYear}-12`,
    ];

    const report = await Activity.aggregate([
      { $match: { month: { $in: months } } },
      {
        $group: {
          _id: '$month',
          totalLinks: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          uniqueMembers: { $addToSet: '$member_id' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    let csv = 'Month,Active Members,Total Links,Approved,Rejected,Pending\n';
    report.forEach((r) => {
      csv += `${r._id},${r.uniqueMembers.length},${r.totalLinks},${r.approved},${r.rejected},${r.pending}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="xfc-monthly-report-${currentYear}.csv"`
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MANUAL TRIGGER — Midnight Job
// ═══════════════════════════════════════════
const triggerMidnightJob = async (req, res) => {
  try {
    const { date } = req.body;

    // Agar date nahi di, toh yesterday use karo
    const targetDate = date || getYesterdayIST();

    // Date format validate karo (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }

    // Future date check
    const today = formatDateIST();
    if (targetDate > today) {
      return res.status(400).json({
        success: false,
        error: 'Cannot process future dates',
      });
    }

    const { processDay } = require('../jobs/midnightProcessor');
    const result = await processDay(targetDate);

    res.json({
      success: result.success,
      date: targetDate,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ═══════════════════════════════════════════
// GET PROCESSING STATUS
// ═══════════════════════════════════════════
const getProcessingStatus = async (req, res) => {
  try {
    const today = formatDateIST();
    const yesterday = getYesterdayIST();

    // Last 7 days ka processing status
    const last7Days = [];

    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatDateIST(d);

      const record = await SystemSetting.findOne({ key: `processed_${dateStr}` });

      last7Days.push({
        date: dateStr,
        processed: !!record,
        processed_at: record?.value?.processed_at || null,
        members_processed: record?.value?.members_processed || 0,
        activities_processed: record?.value?.activities_processed || 0,
      });
    }

    res.json({
      success: true,
      today,
      yesterday,
      last7Days,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ═══════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════
module.exports = {
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
};