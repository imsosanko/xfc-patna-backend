const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const Activity = require('../models/Activity');
const DailySummary = require('../models/DailySummary');
const MonthlyScore = require('../models/MonthlyScore');
const SystemSetting = require('../models/SystemSetting');
const AuditLog = require('../models/AuditLog');
const Meetup = require('../models/Meetup');
const MeetupRSVP = require('../models/MeetupRSVP');
const notificationService = require('../services/notification.service');
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
// ADMIN: ADJUST MEMBER POINTS (Manual)
// ═══════════════════════════════════════════
const adjustMemberPoints = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Amount and reason are required',
      });
    }

    const pointsAmount = parseFloat(amount);
    if (isNaN(pointsAmount) || pointsAmount === 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a non-zero number',
      });
    }

    if (reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Reason must be at least 3 characters',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const month = formatDateIST().substring(0, 7);

    let score = await MonthlyScore.findOne({
      member_id: id,
      month,
    });

    if (!score) {
      score = await MonthlyScore.create({
        member_id: id,
        month,
        total_points: 0,
        regular_points: 0,
        special_points: 0,
        meetup_points: 0,
        manual_adjustments: 0,
      });
    }

    const previousPoints = score.total_points;

    score.total_points = Math.max(0, score.total_points + pointsAmount);
    score.manual_adjustments = (score.manual_adjustments || 0) + pointsAmount;
    await score.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'ADJUST_POINTS',
      target_type: 'MEMBER',
      target_id: id,
      previous_value: { total_points: previousPoints },
      new_value: {
        total_points: score.total_points,
        amount: pointsAmount,
        reason: reason.trim(),
      },
    });

    try {
      if (user.telegram_id) {
        const template = notificationService.formatPointsAdjusted({
          amount: pointsAmount,
          reason: reason.trim(),
          newTotal: score.total_points,
        });

        notificationService.sendNotification({
          memberId: user._id,
          telegramId: user.telegram_id,
          type: template.type,
          title: template.title,
          message: template.message,
          data: template.data,
          adminId: req.admin._id,
        });
      }
    } catch (notifErr) {
      console.error('Points adjust notification failed:', notifErr.message);
    }

    res.json({
      success: true,
      message: `Points ${pointsAmount > 0 ? 'added' : 'deducted'} successfully`,
      member_id: id,
      previous_points: previousPoints,
      new_points: score.total_points,
      adjustment: pointsAmount,
      reason: reason.trim(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: GET MEMBER POINTS BREAKDOWN
// ═══════════════════════════════════════════
const getMemberPointsBreakdown = async (req, res) => {
  try {
    const { id } = req.params;
    const month = formatDateIST().substring(0, 7);

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const score = await MonthlyScore.findOne({
      member_id: id,
      month,
    });

    res.json({
      success: true,
      member_id: id,
      month,
      total_points: score?.total_points || 0,
      breakdown: {
        regular_points: score?.regular_points || 0,
        special_points: score?.special_points || 0,
        meetup_points: score?.meetup_points || 0,
        manual_adjustments: score?.manual_adjustments || 0,
      },
      stats: {
        verified_activities: score?.verified_activities || 0,
        active_days: score?.active_days || 0,
        percentage: score?.percentage || 0,
        current_streak: score?.current_streak || 0,
      },
    });
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

    try {
      const member = await User.findById(activity.member_id);
      const month = formatDateIST().substring(0, 7);
      const score = await MonthlyScore.findOne({ member_id: activity.member_id, month });

      if (member && member.telegram_id) {
        const template = notificationService.formatActivityApproved({
          activity,
          points: 3.33,
          newTotal: score?.total_points || 0,
        });

        notificationService.sendNotification({
          memberId: member._id,
          telegramId: member.telegram_id,
          type: template.type,
          title: template.title,
          message: template.message,
          data: template.data,
          adminId: req.admin._id,
        });
      }
    } catch (notifErr) {
      console.error('Activity approve notification failed:', notifErr.message);
    }

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

    try {
      const member = await User.findById(activity.member_id);
      if (member && member.telegram_id) {
        const template = notificationService.formatActivityRejected({
          activity,
          reason: reason || 'No reason provided',
        });

        notificationService.sendNotification({
          memberId: member._id,
          telegramId: member.telegram_id,
          type: template.type,
          title: template.title,
          message: template.message,
          data: template.data,
          adminId: req.admin._id,
        });
      }
    } catch (notifErr) {
      console.error('Activity reject notification failed:', notifErr.message);
    }

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
// EXPORT MONTHLY REPORT CSV (existing)
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

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="xfc-monthly-report-${currentYear}.csv"`
    );
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// EXPORT: ALL MEMBERS CSV ← NEW
// ═══════════════════════════════════════════
const exportMembersCSV = async (req, res) => {
  try {
    const { status } = req.query;

    const query = { role: 'MEMBER' };
    if (status) query.status = status;

    const members = await User.find(query).sort({ createdAt: -1 }).lean();
    const currentMonth = formatDateIST().substring(0, 7);

    const esc = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let csv = 'Name,Xiaomi ID,WhatsApp,Telegram,Instagram,Facebook,X,Current Points,Status,Joined\n';

    for (const m of members) {
      const profile = await MemberProfile.findOne({ user_id: m._id }).lean();
      const score = await MonthlyScore.findOne({
        member_id: m._id,
        month: currentMonth,
      }).lean();

      csv += [
        esc(profile?.full_name || m.first_name || 'Unknown'),
        esc(profile?.xiaomi_id || ''),
        esc(profile?.whatsapp_number || ''),
        esc(m.telegram_username ? '@' + m.telegram_username.replace('@', '') : ''),
        esc(profile?.instagram_url || ''),
        esc(profile?.facebook_url || ''),
        esc(profile?.x_twitter_url || ''),
        esc(score?.total_points || 0),
        esc(m.status),
        esc(new Date(m.createdAt).toLocaleDateString('en-IN')),
      ].join(',') + '\n';
    }

    const filename = `xfc-members-${status || 'all'}-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// EXPORT: MEETUP ATTENDANCE CSV ← NEW
// ═══════════════════════════════════════════
const exportMeetupAttendanceCSV = async (req, res) => {
  try {
    const { meetup_id } = req.query;

    if (!meetup_id) {
      return res.status(400).json({
        success: false,
        error: 'meetup_id is required',
      });
    }

    const meetup = await Meetup.findById(meetup_id).lean();
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const rsvps = await MeetupRSVP.find({ meetup_id })
      .sort({ rsvp_status: 1, createdAt: 1 })
      .populate('member_id', 'first_name last_name telegram_username')
      .lean();

    const esc = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let csv = `Meetup: ${meetup.title}\n`;
    csv += `Date: ${new Date(meetup.date).toLocaleString('en-IN')}\n`;
    csv += `Venue: ${meetup.venue}\n\n`;
    csv += 'Name,Xiaomi ID,WhatsApp,Telegram,RSVP Status,Bringing Guest,Guest Count,Checked In,Points Awarded\n';

    for (const r of rsvps) {
      const profile = await MemberProfile.findOne({ user_id: r.member_id }).lean();

      csv += [
        esc(profile?.full_name || r.member_id?.first_name || 'Unknown'),
        esc(profile?.xiaomi_id || ''),
        esc(profile?.whatsapp_number || ''),
        esc(r.member_id?.telegram_username ? '@' + r.member_id.telegram_username.replace('@', '') : ''),
        esc(r.rsvp_status),
        esc(r.bringing_guest ? 'Yes' : 'No'),
        esc(r.bringing_guest ? r.guest_count : 0),
        esc(r.checked_in_at ? new Date(r.checked_in_at).toLocaleString('en-IN') : '—'),
        esc(r.points_awarded || 0),
      ].join(',') + '\n';
    }

    const safeTitle = meetup.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `xfc-meetup-${safeTitle}-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// EXPORT: ACTIVITY LOG CSV ← NEW
// ═══════════════════════════════════════════
const exportActivityLogCSV = async (req, res) => {
  try {
    const { month, status } = req.query;

    const query = {};
    if (month) query.month = month;
    if (status) query.status = status;

    const activities = await Activity.find(query)
      .sort({ submitted_at: -1 })
      .limit(10000)
      .populate('member_id', 'first_name last_name telegram_username')
      .lean();

    const esc = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let csv = 'Date,Member,Xiaomi ID,Telegram,Platform,Type,URL,Status,Points,Submitted At,Rejection Reason\n';

    for (const a of activities) {
      const profile = await MemberProfile.findOne({ user_id: a.member_id }).lean();

      csv += [
        esc(a.date),
        esc(profile?.full_name || a.member_id?.first_name || 'Unknown'),
        esc(profile?.xiaomi_id || ''),
        esc(a.member_id?.telegram_username ? '@' + a.member_id.telegram_username.replace('@', '') : ''),
        esc(a.platform),
        esc(a.activity_type),
        esc(a.url),
        esc(a.status),
        esc(a.points || 0),
        esc(a.submitted_at ? new Date(a.submitted_at).toLocaleString('en-IN') : ''),
        esc(a.rejection_reason || ''),
      ].join(',') + '\n';
    }

    const filename = `xfc-activities-${month || 'all'}-${status || 'all'}-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
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

    const targetDate = date || getYesterdayIST();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }

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
// MEETUPS: CREATE
// ═══════════════════════════════════════════
const createMeetup = async (req, res) => {
  try {
    const {
      title,
      description,
      banner_url,
      date,
      end_time,
      venue,
      address,
      map_url,
      points,
      max_attendees,
      status,
    } = req.body;

    if (!title || !date || !venue) {
      return res.status(400).json({
        success: false,
        error: 'Title, date, and venue are required',
      });
    }

    const meetup = await Meetup.create({
      title: title.trim(),
      description: description || '',
      banner_url: banner_url || '',
      date: new Date(date),
      end_time: end_time ? new Date(end_time) : null,
      venue: venue.trim(),
      address: address || '',
      map_url: map_url || '',
      points: points || 10,
      max_attendees: max_attendees || 0,
      status: status || 'DRAFT',
      created_by: req.admin._id,
    });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'CREATE_MEETUP',
      target_type: 'MEETUP',
      target_id: meetup._id,
      new_value: { title: meetup.title, date: meetup.date },
    });

    res.json({ success: true, meetup });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: UPDATE
// ═══════════════════════════════════════════
const updateMeetup = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const previous = {
      title: meetup.title,
      date: meetup.date,
      status: meetup.status,
    };

    const allowedFields = [
      'title', 'description', 'banner_url', 'date', 'end_time',
      'venue', 'address', 'map_url', 'points', 'max_attendees', 'status',
    ];

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        if (field === 'date' || field === 'end_time') {
          meetup[field] = updates[field] ? new Date(updates[field]) : null;
        } else {
          meetup[field] = updates[field];
        }
      }
    });

    await meetup.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UPDATE_MEETUP',
      target_type: 'MEETUP',
      target_id: id,
      previous_value: previous,
      new_value: {
        title: meetup.title,
        date: meetup.date,
        status: meetup.status,
      },
    });

    res.json({ success: true, meetup });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: DELETE
// ═══════════════════════════════════════════
const deleteMeetup = async (req, res) => {
  try {
    const { id } = req.params;

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    await MeetupRSVP.deleteMany({ meetup_id: id });
    await Meetup.deleteOne({ _id: id });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'DELETE_MEETUP',
      target_type: 'MEETUP',
      target_id: id,
      previous_value: { title: meetup.title },
    });

    res.json({ success: true, message: 'Meetup deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: LIST (Admin)
// ═══════════════════════════════════════════
const listMeetupsAdmin = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) query.status = status;

    const [meetups, total] = await Promise.all([
      Meetup.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('created_by', 'name email')
        .lean(),
      Meetup.countDocuments(query),
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      meetups,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: GET RSVPs (Admin)
// ═══════════════════════════════════════════
const getMeetupRSVPs = async (req, res) => {
  try {
    const { id } = req.params;
    const { rsvp_status } = req.query;

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const query = { meetup_id: id };
    if (rsvp_status) query.rsvp_status = rsvp_status;

    const rsvps = await MeetupRSVP.find(query)
      .sort({ createdAt: 1 })
      .populate('member_id', 'first_name last_name telegram_username profile_photo_url')
      .lean();

    const enriched = await Promise.all(
      rsvps.map(async (r) => {
        const profile = await MemberProfile.findOne({ user_id: r.member_id });
        return {
          id: r._id,
          member_id: r.member_id?._id,
          member_name: profile?.full_name || r.member_id?.first_name || 'Unknown',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          whatsapp_number: profile?.whatsapp_number || 'N/A',
          telegram_username: r.member_id?.telegram_username || '',
          profile_photo_url: r.member_id?.profile_photo_url || '',
          rsvp_status: r.rsvp_status,
          bringing_guest: r.bringing_guest,
          guest_count: r.guest_count,
          checked_in_at: r.checked_in_at,
          points_awarded: r.points_awarded,
          created_at: r.createdAt,
        };
      })
    );

    res.json({
      success: true,
      meetup: {
        id: meetup._id,
        title: meetup.title,
        date: meetup.date,
        venue: meetup.venue,
        points: meetup.points,
        status: meetup.status,
      },
      count: enriched.length,
      rsvps: enriched,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: CHECK-IN (Manual)
// ═══════════════════════════════════════════
const checkInMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { member_id, xiaomi_id } = req.body;

    if (!member_id && !xiaomi_id) {
      return res.status(400).json({
        success: false,
        error: 'member_id or xiaomi_id is required',
      });
    }

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    let member;
    if (member_id) {
      member = await User.findById(member_id);
    } else {
      const profile = await MemberProfile.findOne({ xiaomi_id });
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Member not found by Xiaomi ID' });
      }
      member = await User.findById(profile.user_id);
    }

    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    let rsvp = await MeetupRSVP.findOne({ meetup_id: id, member_id: member._id });

    if (rsvp && rsvp.rsvp_status === 'ATTENDED') {
      return res.status(400).json({
        success: false,
        error: 'Already checked in',
        rsvp,
      });
    }

    const pointsToAward = meetup.points || 10;

    if (rsvp) {
      rsvp.rsvp_status = 'ATTENDED';
      rsvp.checked_in_at = new Date();
      rsvp.checked_in_by = req.admin._id;
      rsvp.points_awarded = pointsToAward;
      await rsvp.save();
    } else {
      rsvp = await MeetupRSVP.create({
        meetup_id: id,
        member_id: member._id,
        rsvp_status: 'ATTENDED',
        checked_in_at: new Date(),
        checked_in_by: req.admin._id,
        points_awarded: pointsToAward,
      });
    }

    await Meetup.findByIdAndUpdate(id, { $inc: { total_attended: 1 } });

    const month = formatDateIST().substring(0, 7);
    let score = await MonthlyScore.findOne({ member_id: member._id, month });
    if (!score) {
      score = await MonthlyScore.create({
        member_id: member._id,
        month,
        total_points: 0,
        regular_points: 0,
        special_points: 0,
        meetup_points: 0,
        manual_adjustments: 0,
      });
    }

    score.total_points += pointsToAward;
    score.meetup_points = (score.meetup_points || 0) + pointsToAward;
    await score.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'MEETUP_CHECKIN',
      target_type: 'MEETUP',
      target_id: id,
      new_value: {
        member_id: member._id,
        points_awarded: pointsToAward,
      },
    });

    res.json({
      success: true,
      message: `${rsvp.bringing_guest ? 'Checked in (+ guest)' : 'Checked in'} — ${pointsToAward} points awarded`,
      member: {
        id: member._id,
        first_name: member.first_name,
        telegram_username: member.telegram_username,
      },
      rsvp: {
        status: rsvp.rsvp_status,
        checked_in_at: rsvp.checked_in_at,
        points_awarded: rsvp.points_awarded,
        bringing_guest: rsvp.bringing_guest,
        guest_count: rsvp.guest_count,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// BROADCAST NOTIFICATION (Admin → Members)
// ═══════════════════════════════════════════
const broadcastToMembers = async (req, res) => {
  try {
    const {
      title,
      message,
      target = 'ALL',
      member_ids = [],
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required',
      });
    }

    if (title.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Title must be at least 3 characters',
      });
    }

    if (message.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Message must be at least 5 characters',
      });
    }

    let query = { role: 'MEMBER' };

    if (target === 'ACTIVE') {
      query.status = 'ACTIVE';
    } else if (target === 'SPECIFIC') {
      if (!Array.isArray(member_ids) || member_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'member_ids required for SPECIFIC target',
        });
      }
      query._id = { $in: member_ids };
    }

    const members = await User.find(query).select('_id telegram_id first_name');

    if (members.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No members found for the selected target',
      });
    }

    const result = await notificationService.broadcastNotification({
      members,
      type: 'BROADCAST',
      title: title.trim(),
      message: message.trim(),
      data: { target },
      adminId: req.admin._id,
    });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'BROADCAST_NOTIFICATION',
      target_type: 'BROADCAST',
      target_id: null,
      new_value: {
        title: title.trim(),
        target,
        member_count: members.length,
        telegram_sent: result.telegram_sent,
        telegram_failed: result.telegram_failed,
      },
    });

    res.json({
      success: true,
      message: `Broadcast sent to ${members.length} members`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
  // Data Exports ← NEW
  exportMembersCSV,
  exportMeetupAttendanceCSV,
  exportActivityLogCSV,
};