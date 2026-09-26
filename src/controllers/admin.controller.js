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
const MeetupAttendance = require('../models/MeetupAttendance');
const Notification = require('../models/Notification');
const SpecialActivity = require('../models/SpecialActivity');
const SpecialSubmission = require('../models/SpecialSubmission');
const notificationService = require('../services/notification.service');
const { generateMeetupAttendancePDF } = require('../services/pdf.service');
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
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });

    if (!admin) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!admin.is_active) {
      return res.status(403).json({ success: false, error: 'Account is inactive' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
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
        permissions: admin.permissions || [],
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

    let query = {
      role: { $in: ['MEMBER', 'ADMIN', 'SUPER_ADMIN', 'VERIFIER', 'REPORT_ADMIN', 'SPECIAL_ADMIN'] },
    };
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
        .limit(parseInt(limit))
        .select('telegram_id telegram_username first_name last_name profile_photo_url status role badges admin_badges createdAt'),
      User.countDocuments(query),
    ]);

    const currentMonth = formatDateIST().substring(0, 7);

    const enriched = await Promise.all(
      members.map(async (m) => {
        const profile = await MemberProfile.findOne({ user_id: m._id });
        const score = await MonthlyScore.findOne({ member_id: m._id, month: currentMonth });
        return {
          id: m._id,
          telegram_id: m.telegram_id,
          telegram_username: m.telegram_username,
          first_name: m.first_name,
          last_name: m.last_name,
          profile_photo_url: m.profile_photo_url,
          status: m.status,
          role: m.role,
          badges: m.badges || [],
          admin_badges: m.admin_badges || [],
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

    res.json({ success: true, total, page: parseInt(page), members: enriched });
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
// GET MEMBER DETAIL
// ═══════════════════════════════════════════
const getMemberDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const month = formatDateIST().substring(0, 7);

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const profile = await MemberProfile.findOne({ user_id: id });
    const score = await MonthlyScore.findOne({ member_id: id, month });

    const activities = await Activity.find({ member_id: id })
      .sort({ submitted_at: -1 })
      .limit(10);

    const adminInfo = await Admin.findOne({ user_id: id }).select('name email role');

    res.json({
      success: true,
      member: {
        id: user._id,
        telegram_id: user.telegram_id,
        telegram_username: user.telegram_username,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_photo_url: user.profile_photo_url,
        status: user.status,
        role: user.role,
        badges: user.badges || [],
        admin_badges: user.admin_badges || [],
        created_at: user.createdAt,
        is_admin: !!adminInfo,
        admin_role: adminInfo ? adminInfo.role : null,

        full_name: profile?.full_name || 'N/A',
        xiaomi_id: profile?.xiaomi_id || 'N/A',
        whatsapp_number: profile?.whatsapp_number || 'N/A',
        instagram_url: profile?.instagram_url || '',
        facebook_url: profile?.facebook_url || '',
        x_twitter_url: profile?.x_twitter_url || '',

        progress: {
          total_points: score?.total_points || 0,
          regular_points: score?.regular_points || 0,
          bonus_points: score?.bonus_points || 0,
          special_points: score?.special_points || 0,
          meetup_points: score?.meetup_points || 0,
          manual_adjustments: score?.manual_adjustments || 0,
          verified_activities: score?.verified_activities || 0,
          active_days: score?.active_days || 0,
          percentage: score?.percentage || 0,
          current_streak: score?.current_streak || 0,
          longest_streak: score?.longest_streak || 0,
        },

        recent_activities: activities.map((a) => ({
          id: a._id,
          platform: a.platform,
          activity_type: a.activity_type,
          url: a.url,
          status: a.status,
          submitted_at: a.submitted_at,
          points: a.points,
          rejection_reason: a.rejection_reason,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// UPDATE MEMBER DETAIL
// Super Admin OR admin with 'members.edit' permission
// ═══════════════════════════════════════════
const updateMemberDetail = async (req, res) => {
  try {
    const isSuperAdmin = req.admin.role === 'SUPER_ADMIN';
    const hasEditPermission = (req.admin.permissions || []).includes('members.edit');

    if (!isSuperAdmin && !hasEditPermission) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to edit member details. Contact Super Admin.',
      });
    }

    const { id } = req.params;
    const {
      full_name,
      xiaomi_id,
      whatsapp_number,
      instagram_url,
      facebook_url,
      x_twitter_url,
    } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const profile = await MemberProfile.findOne({ user_id: id });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Member profile not found' });
    }

    const previousProfile = {
      full_name: profile.full_name,
      xiaomi_id: profile.xiaomi_id,
      whatsapp_number: profile.whatsapp_number,
      instagram_url: profile.instagram_url,
      facebook_url: profile.facebook_url,
      x_twitter_url: profile.x_twitter_url,
    };

    if (full_name) profile.full_name = full_name.trim();
    if (xiaomi_id) profile.xiaomi_id = xiaomi_id.trim();
    if (whatsapp_number) profile.whatsapp_number = whatsapp_number.trim();

    if (instagram_url !== undefined) profile.instagram_url = instagram_url.trim();
    if (facebook_url !== undefined) profile.facebook_url = facebook_url.trim();
    if (x_twitter_url !== undefined) profile.x_twitter_url = x_twitter_url.trim();

    await profile.save();

    if (full_name) {
      const nameParts = full_name.trim().split(' ');
      user.first_name = nameParts[0] || '';
      user.last_name = nameParts.slice(1).join(' ') || '';
      await user.save();
    }

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UPDATE_MEMBER_PROFILE',
      target_type: 'MEMBER',
      target_id: id,
      previous_value: previousProfile,
      new_value: {
        full_name: profile.full_name,
        xiaomi_id: profile.xiaomi_id,
        whatsapp_number: profile.whatsapp_number,
        instagram_url: profile.instagram_url,
        facebook_url: profile.facebook_url,
        x_twitter_url: profile.x_twitter_url,
      },
    });

    res.json({ success: true, message: 'Member profile updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: ADJUST MEMBER POINTS
// ═══════════════════════════════════════════
const adjustMemberPoints = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || !reason) {
      return res.status(400).json({ success: false, error: 'Amount and reason are required' });
    }

    const pointsAmount = parseFloat(amount);
    if (isNaN(pointsAmount) || pointsAmount === 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a non-zero number' });
    }

    if (reason.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Reason must be at least 3 characters' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    // ⬇️ Super Admin — koi restriction nahi
    if (req.admin.role !== 'SUPER_ADMIN') {
      if (req.admin.user_id && String(req.admin.user_id) === String(id)) {
        return res.status(403).json({
          success: false,
          error: 'You cannot adjust your own points',
        });
      }

      const targetAdmin = await Admin.findOne({ user_id: id }).select('name role');
      if (targetAdmin) {
        return res.status(403).json({
          success: false,
          error: `You cannot adjust points of another admin (${targetAdmin.name}). Only Super Admin can do this.`,
        });
      }
    }

    const month = formatDateIST().substring(0, 7);

    let score = await MonthlyScore.findOne({ member_id: id, month });

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

    const score = await MonthlyScore.findOne({ member_id: id, month });

    res.json({
      success: true,
      member_id: id,
      month,
      total_points: score?.total_points || 0,
      breakdown: {
        regular_points: score?.regular_points || 0,
        bonus_points: score?.bonus_points || 0,
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
          member_user_id: a.member_id?._id?.toString() || null,
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

    res.json({ success: true, total, page: parseInt(page), activities: enriched });
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

    // ⬇️ Super Admin — koi restriction nahi
    if (req.admin.role !== 'SUPER_ADMIN') {
      if (req.admin.user_id && String(req.admin.user_id) === String(activity.member_id)) {
        return res.status(403).json({
          success: false,
          error: 'You cannot verify your own activity',
        });
      }
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

    // ⬇️ Super Admin — koi restriction nahi
    if (req.admin.role !== 'SUPER_ADMIN') {
      if (req.admin.user_id && String(req.admin.user_id) === String(activity.member_id)) {
        return res.status(403).json({
          success: false,
          error: 'You cannot verify your own activity',
        });
      }
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

    res.json({ success: true, year: currentYear, report: filteredReport });
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
      return res.status(400).json({ success: false, error: 'Month is required (YYYY-MM)' });
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

    res.json({ success: true, month, report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ANALYTICS (Enhanced)
// ═══════════════════════════════════════════
const getAnalytics = async (req, res) => {
  try {
    const { range = '6months' } = req.query;

    const now = new Date();
    let startDate;

    if (range === '7days') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30days') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === '90days') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (range === 'thismonth') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === 'lastmonth') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    }

    const startDateStr = formatDateIST(startDate);

    const months = [];
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
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
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
          rejected: 1,
          activeMembers: { $size: '$uniqueMembers' },
        },
      },
    ]);

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoStr = formatDateIST(thirtyDaysAgo);

    const dailyActive = await Activity.aggregate([
      { $match: { date: { $gte: thirtyDaysAgoStr }, status: 'APPROVED' } },
      {
        $group: {
          _id: '$date',
          count: { $sum: 1 },
          uniqueMembers: { $addToSet: '$member_id' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: '$_id',
          _id: 0,
          count: 1,
          activeMembers: { $size: '$uniqueMembers' },
        },
      },
    ]);

    const platformDist = await Activity.aggregate([
      { $match: { date: { $gte: startDateStr } } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $project: { platform: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
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

    const streakLeaderboard = await MonthlyScore.find({
      month: currentMonth,
      longest_streak: { $gt: 0 },
    })
      .sort({ longest_streak: -1 })
      .limit(10)
      .populate('member_id', 'first_name last_name profile_photo_url badges admin_badges role')
      .lean();

    const streakData = streakLeaderboard
      .filter((s) => s.member_id)
      .map((s) => ({
        name: `${s.member_id.first_name || ''} ${s.member_id.last_name || ''}`.trim() || 'Unknown',
        current: s.current_streak || 0,
        longest: s.longest_streak || 0,
        badges: (s.member_id.badges || []).length,
        admin_badges: (s.member_id.admin_badges || []).length,
      }));

    const [
      totalMeetups,
      publishedMeetups,
      completedMeetups,
      totalRSVPs,
      totalAttended,
    ] = await Promise.all([
      Meetup.countDocuments(),
      Meetup.countDocuments({ status: 'PUBLISHED' }),
      Meetup.countDocuments({ status: 'COMPLETED' }),
      MeetupRSVP.countDocuments(),
      MeetupRSVP.countDocuments({ rsvp_status: 'ATTENDED' }),
    ]);

    const recentMeetups = await Meetup.find()
      .sort({ date: -1 })
      .limit(5)
      .select('title date status total_rsvps total_attended')
      .lean();

    const [
      totalSpecials,
      openSpecials,
      totalSubmissions,
      approvedSubmissions,
      pendingSubmissions,
    ] = await Promise.all([
      SpecialActivity.countDocuments(),
      SpecialActivity.countDocuments({ status: 'OPEN' }),
      SpecialSubmission.countDocuments(),
      SpecialSubmission.countDocuments({ status: 'APPROVED' }),
      SpecialSubmission.countDocuments({ status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
    ]);

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const [thisMonthStats, lastMonthStats] = await Promise.all([
      Activity.aggregate([
        { $match: { month: currentMonth } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
            uniqueMembers: { $addToSet: '$member_id' },
          },
        },
      ]),
      Activity.aggregate([
        { $match: { month: lastMonthStr } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
            uniqueMembers: { $addToSet: '$member_id' },
          },
        },
      ]),
    ]);

    const thisMonth = thisMonthStats[0] || { total: 0, approved: 0, uniqueMembers: [] };
    const lastMonth = lastMonthStats[0] || { total: 0, approved: 0, uniqueMembers: [] };

    const calcChange = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    const monthOverMonth = {
      thisMonth: {
        total: thisMonth.total,
        approved: thisMonth.approved,
        activeMembers: thisMonth.uniqueMembers.length,
      },
      lastMonth: {
        total: lastMonth.total,
        approved: lastMonth.approved,
        activeMembers: lastMonth.uniqueMembers.length,
      },
      changes: {
        total: calcChange(thisMonth.total, lastMonth.total),
        approved: calcChange(thisMonth.approved, lastMonth.approved),
        activeMembers: calcChange(thisMonth.uniqueMembers.length, lastMonth.uniqueMembers.length),
      },
    };

    res.json({
      success: true,
      range,
      monthlyTrend,
      dailyActive,
      platformDistribution: platformDist,
      topMembers,
      streakLeaderboard: streakData,
      meetupStats: {
        total: totalMeetups,
        published: publishedMeetups,
        completed: completedMeetups,
        totalRSVPs,
        totalAttended,
        attendanceRate: totalRSVPs > 0 ? Math.round((totalAttended / totalRSVPs) * 100) : 0,
        recent: recentMeetups,
      },
      specialStats: {
        total: totalSpecials,
        open: openSpecials,
        totalSubmissions,
        approvedSubmissions,
        pendingSubmissions,
        approvalRate: totalSubmissions > 0 ? Math.round((approvedSubmissions / totalSubmissions) * 100) : 0,
      },
      monthOverMonth,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// EXPORT MONTHLY REPORT CSV
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
    res.setHeader('Content-Disposition', `attachment; filename="xfc-monthly-report-${currentYear}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// EXPORT: ALL MEMBERS CSV
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
      const score = await MonthlyScore.findOne({ member_id: m._id, month: currentMonth }).lean();

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
// EXPORT: MEETUP ATTENDANCE CSV
// ═══════════════════════════════════════════
const exportMeetupAttendanceCSV = async (req, res) => {
  try {
    const { meetup_id } = req.query;

    if (!meetup_id) {
      return res.status(400).json({ success: false, error: 'meetup_id is required' });
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
    csv += 'Name,Xiaomi ID,WhatsApp,Telegram,RSVP Status,Physical,X Status,Insta Status,Points Awarded\n';

    for (const r of rsvps) {
      const profile = await MemberProfile.findOne({ user_id: r.member_id }).lean();
      const attendance = await MeetupAttendance.findOne({ meetup_id, member_id: r.member_id }).lean();

      csv += [
        esc(profile?.full_name || r.member_id?.first_name || 'Unknown'),
        esc(profile?.xiaomi_id || ''),
        esc(profile?.whatsapp_number || ''),
        esc(r.member_id?.telegram_username ? '@' + r.member_id.telegram_username.replace('@', '') : ''),
        esc(r.rsvp_status),
        esc(attendance?.attendance_status || 'PENDING'),
        esc(r.x_status || 'NOT_SUBMITTED'),
        esc(r.instagram_status || 'NOT_SUBMITTED'),
        esc((attendance?.points_awarded || 0) + (r.points_awarded || 0)),
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
// EXPORT: ACTIVITY LOG CSV
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
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const today = formatDateIST();
    if (targetDate > today) {
      return res.status(400).json({ success: false, error: 'Cannot process future dates' });
    }

    const { processDay } = require('../jobs/midnightProcessor');
    const result = await processDay(targetDate);

    res.json({ success: result.success, date: targetDate, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

    res.json({ success: true, today, yesterday, last7Days });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: CREATE
// ═══════════════════════════════════════════
const createMeetup = async (req, res) => {
  try {
    const {
      title, description, banner_url, date, end_time, venue, address, map_url,
      points, max_attendees, status, location_lat, location_lng,
      location_radius_meters, submission_deadline,
    } = req.body;

    if (!title || !date || !venue) {
      return res.status(400).json({ success: false, error: 'Title, date, and venue are required' });
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
      location_lat: location_lat || null,
      location_lng: location_lng || null,
      location_radius_meters: location_radius_meters || 100,
      submission_deadline: submission_deadline ? new Date(submission_deadline) : null,
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

    const previous = { title: meetup.title, date: meetup.date, status: meetup.status };

    const allowedFields = [
      'title', 'description', 'banner_url', 'date', 'end_time',
      'venue', 'address', 'map_url', 'points', 'max_attendees', 'status',
      'location_lat', 'location_lng', 'location_radius_meters', 'submission_deadline',
    ];

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        if (field === 'date' || field === 'end_time' || field === 'submission_deadline') {
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
      new_value: { title: meetup.title, date: meetup.date, status: meetup.status },
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
    await MeetupAttendance.deleteMany({ meetup_id: id });
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
      Meetup.find(query).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).populate('created_by', 'name email').lean(),
      Meetup.countDocuments(query),
    ]);

    res.json({ success: true, total, page: parseInt(page), meetups });
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
        const attendance = await MeetupAttendance.findOne({ meetup_id: id, member_id: r.member_id }).lean();

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
          is_locked: r.is_locked,
          locked_at: r.locked_at,
          attendance_status: attendance?.attendance_status || 'PENDING',
          check_in_method: attendance?.check_in_method || '',
          check_in_at: attendance?.check_in_at || null,
          physical_points: attendance?.points_awarded || 0,
          x_link: r.x_link || '',
          x_post_type: r.x_post_type || '',
          x_status: r.x_status || 'NOT_SUBMITTED',
          x_submitted_at: r.x_submitted_at,
          x_rejection_reason: r.x_rejection_reason || '',
          instagram_link: r.instagram_link || '',
          instagram_post_type: r.instagram_post_type || '',
          instagram_status: r.instagram_status || 'NOT_SUBMITTED',
          instagram_submitted_at: r.instagram_submitted_at,
          instagram_rejection_reason: r.instagram_rejection_reason || '',
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
        location_locked: meetup.location_locked,
        attendance_weights: meetup.attendance_weights,
      },
      count: enriched.length,
      rsvps: enriched,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: LOCK LOCATION
// ═══════════════════════════════════════════
const lockLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, radius_meters } = req.body;

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    if (meetup.location_locked) {
      return res.status(400).json({ success: false, error: 'Location already locked' });
    }

    const lat = latitude ?? meetup.location_lat;
    const lng = longitude ?? meetup.location_lng;

    if (lat == null || lng == null) {
      return res.status(400).json({ success: false, error: 'Location coordinates (lat, lng) required' });
    }

    meetup.location_lat = lat;
    meetup.location_lng = lng;
    meetup.location_radius_meters = radius_meters || meetup.location_radius_meters || 100;
    meetup.location_locked = true;
    meetup.location_locked_at = new Date();
    meetup.location_locked_by = req.admin._id;
    await meetup.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'LOCK_MEETUP_LOCATION',
      target_type: 'MEETUP',
      target_id: id,
      new_value: { latitude: lat, longitude: lng, radius_meters: meetup.location_radius_meters },
    });

    res.json({
      success: true,
      message: 'Location locked. Members can now check in.',
      meetup: {
        id: meetup._id,
        location_locked: meetup.location_locked,
        location_locked_at: meetup.location_locked_at,
        location_lat: meetup.location_lat,
        location_lng: meetup.location_lng,
        location_radius_meters: meetup.location_radius_meters,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: UNLOCK LOCATION
// ═══════════════════════════════════════════
const unlockLocation = async (req, res) => {
  try {
    const { id } = req.params;

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    meetup.location_locked = false;
    meetup.location_locked_at = null;
    meetup.location_locked_by = null;
    await meetup.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UNLOCK_MEETUP_LOCATION',
      target_type: 'MEETUP',
      target_id: id,
    });

    res.json({ success: true, message: 'Location unlocked' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: CHECK-IN (Manual by Admin)
// ═══════════════════════════════════════════
const checkInMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { member_id, xiaomi_id, note } = req.body;

    if (!member_id && !xiaomi_id) {
      return res.status(400).json({ success: false, error: 'member_id or xiaomi_id is required' });
    }

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    if (!meetup.location_locked) {
      return res.status(400).json({ success: false, error: 'Location is not locked yet. Lock location first.' });
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

    const rsvp = await MeetupRSVP.findOne({ meetup_id: id, member_id: member._id });
    if (!rsvp || rsvp.rsvp_status !== 'INTERESTED') {
      return res.status(403).json({ success: false, error: 'Member has not RSVPed' });
    }

    let attendance = await MeetupAttendance.findOne({ meetup_id: id, member_id: member._id });

    if (attendance && attendance.attendance_status === 'PRESENT') {
      return res.status(400).json({ success: false, error: 'Already checked in' });
    }

    const physicalPoints = (meetup.points * (meetup.attendance_weights?.physical || 50)) / 100;

    if (attendance) {
      attendance.attendance_status = 'PRESENT';
      attendance.check_in_method = 'ADMIN_MANUAL';
      attendance.marked_by_admin = true;
      attendance.marked_by = req.admin._id;
      attendance.marked_at = new Date();
      attendance.admin_note = note || '';
      attendance.points_awarded = physicalPoints;
      attendance.check_in_at = new Date();
      await attendance.save();
    } else {
      attendance = await MeetupAttendance.create({
        meetup_id: id,
        member_id: member._id,
        attendance_status: 'PRESENT',
        check_in_method: 'ADMIN_MANUAL',
        marked_by_admin: true,
        marked_by: req.admin._id,
        marked_at: new Date(),
        admin_note: note || '',
        points_awarded: physicalPoints,
        check_in_at: new Date(),
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

    score.total_points += physicalPoints;
    score.meetup_points = (score.meetup_points || 0) + physicalPoints;
    await score.save();

    rsvp.checked_in_at = new Date();
    rsvp.checked_in_by = req.admin._id;
    await rsvp.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'MEETUP_CHECKIN_MANUAL',
      target_type: 'MEETUP',
      target_id: id,
      new_value: { member_id: member._id, points_awarded: physicalPoints, method: 'ADMIN_MANUAL' },
    });

    res.json({
      success: true,
      message: `Checked in — ${physicalPoints.toFixed(2)} points awarded (physical 50%)`,
      member: { id: member._id, first_name: member.first_name, telegram_username: member.telegram_username },
      attendance: {
        status: attendance.attendance_status,
        check_in_method: attendance.check_in_method,
        points_awarded: attendance.points_awarded,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: REVIEW X LINK
// ═══════════════════════════════════════════
const reviewXLink = async (req, res) => {
  try {
    const { id, rsvp_id } = req.params;
    const { action, reason } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const rsvp = await MeetupRSVP.findById(rsvp_id);
    if (!rsvp) {
      return res.status(404).json({ success: false, error: 'RSVP not found' });
    }

    if (rsvp.x_status === 'APPROVED') {
      return res.status(400).json({ success: false, error: 'Already approved' });
    }

    if (!rsvp.x_link) {
      return res.status(400).json({ success: false, error: 'No X link submitted' });
    }

    const xPoints = (meetup.points * (meetup.attendance_weights?.x_link || 25)) / 100;

    if (action === 'APPROVE') {
      rsvp.x_status = 'APPROVED';
      rsvp.x_reviewed_at = new Date();
      rsvp.x_reviewed_by = req.admin._id;
      rsvp.x_rejection_reason = '';

      const month = formatDateIST().substring(0, 7);
      let score = await MonthlyScore.findOne({ member_id: rsvp.member_id, month });
      if (!score) {
        score = await MonthlyScore.create({
          member_id: rsvp.member_id,
          month,
          total_points: 0,
          regular_points: 0,
          special_points: 0,
          meetup_points: 0,
          manual_adjustments: 0,
        });
      }
      score.total_points += xPoints;
      score.meetup_points = (score.meetup_points || 0) + xPoints;
      await score.save();
    } else {
      rsvp.x_status = 'REJECTED';
      rsvp.x_reviewed_at = new Date();
      rsvp.x_reviewed_by = req.admin._id;
      rsvp.x_rejection_reason = reason || 'Rejected by admin';
    }

    await rsvp.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: `MEETUP_X_LINK_${action}`,
      target_type: 'MEETUP_RSVP',
      target_id: rsvp._id,
      new_value: {
        meetup_id: id,
        member_id: rsvp.member_id,
        status: rsvp.x_status,
        points: action === 'APPROVE' ? xPoints : 0,
      },
    });

    res.json({
      success: true,
      message: `X link ${action.toLowerCase()}d`,
      x_status: rsvp.x_status,
      points_awarded: action === 'APPROVE' ? xPoints : 0,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: REVIEW INSTAGRAM LINK
// ═══════════════════════════════════════════
const reviewInstagramLink = async (req, res) => {
  try {
    const { id, rsvp_id } = req.params;
    const { action, reason } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const rsvp = await MeetupRSVP.findById(rsvp_id);
    if (!rsvp) {
      return res.status(404).json({ success: false, error: 'RSVP not found' });
    }

    if (rsvp.instagram_status === 'APPROVED') {
      return res.status(400).json({ success: false, error: 'Already approved' });
    }

    if (!rsvp.instagram_link) {
      return res.status(400).json({ success: false, error: 'No Instagram link submitted' });
    }

    const igPoints = (meetup.points * (meetup.attendance_weights?.instagram || 25)) / 100;

    if (action === 'APPROVE') {
      rsvp.instagram_status = 'APPROVED';
      rsvp.instagram_reviewed_at = new Date();
      rsvp.instagram_reviewed_by = req.admin._id;
      rsvp.instagram_rejection_reason = '';

      const month = formatDateIST().substring(0, 7);
      let score = await MonthlyScore.findOne({ member_id: rsvp.member_id, month });
      if (!score) {
        score = await MonthlyScore.create({
          member_id: rsvp.member_id,
          month,
          total_points: 0,
          regular_points: 0,
          special_points: 0,
          meetup_points: 0,
          manual_adjustments: 0,
        });
      }
      score.total_points += igPoints;
      score.meetup_points = (score.meetup_points || 0) + igPoints;
      await score.save();
    } else {
      rsvp.instagram_status = 'REJECTED';
      rsvp.instagram_reviewed_at = new Date();
      rsvp.instagram_reviewed_by = req.admin._id;
      rsvp.instagram_rejection_reason = reason || 'Rejected by admin';
    }

    await rsvp.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: `MEETUP_INSTAGRAM_${action}`,
      target_type: 'MEETUP_RSVP',
      target_id: rsvp._id,
      new_value: {
        meetup_id: id,
        member_id: rsvp.member_id,
        status: rsvp.instagram_status,
        points: action === 'APPROVE' ? igPoints : 0,
      },
    });

    res.json({
      success: true,
      message: `Instagram link ${action.toLowerCase()}d`,
      instagram_status: rsvp.instagram_status,
      points_awarded: action === 'APPROVE' ? igPoints : 0,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: EDIT MEMBER RSVP
// ═══════════════════════════════════════════
const editMemberRSVP = async (req, res) => {
  try {
    const { id, rsvp_id } = req.params;
    const { rsvp_status, bringing_guest, guest_count, is_locked, note } = req.body;

    const meetup = await Meetup.findById(id);
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const rsvp = await MeetupRSVP.findById(rsvp_id);
    if (!rsvp) {
      return res.status(404).json({ success: false, error: 'RSVP not found' });
    }

    const changes = {};
    const previous = {
      rsvp_status: rsvp.rsvp_status,
      bringing_guest: rsvp.bringing_guest,
      guest_count: rsvp.guest_count,
      is_locked: rsvp.is_locked,
    };

    if (rsvp_status !== undefined) {
      if (!['INTERESTED', 'NOT_GOING', 'ATTENDED'].includes(rsvp_status)) {
        return res.status(400).json({ success: false, error: 'Invalid rsvp_status' });
      }
      rsvp.rsvp_status = rsvp_status;
      changes.rsvp_status = rsvp_status;
    }

    if (bringing_guest !== undefined) {
      rsvp.bringing_guest = !!bringing_guest;
      changes.bringing_guest = !!bringing_guest;
    }

    if (guest_count !== undefined) {
      rsvp.guest_count = Math.max(0, Math.min(5, parseInt(guest_count) || 0));
      changes.guest_count = rsvp.guest_count;
    }

    if (is_locked !== undefined) {
      rsvp.is_locked = !!is_locked;
      if (is_locked) {
        rsvp.locked_at = new Date();
      } else {
        rsvp.locked_at = null;
      }
      changes.is_locked = !!is_locked;
    }

    rsvp.last_edited_by = req.admin._id;
    rsvp.last_edited_at = new Date();
    rsvp.edit_history.push({
      edited_by: req.admin._id,
      edited_at: new Date(),
      changes,
      note: note || '',
    });

    await rsvp.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'EDIT_MEMBER_RSVP',
      target_type: 'MEETUP_RSVP',
      target_id: rsvp._id,
      previous_value: previous,
      new_value: changes,
    });

    res.json({
      success: true,
      message: 'RSVP updated',
      rsvp: {
        id: rsvp._id,
        rsvp_status: rsvp.rsvp_status,
        bringing_guest: rsvp.bringing_guest,
        guest_count: rsvp.guest_count,
        is_locked: rsvp.is_locked,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEETUPS: DOWNLOAD ATTENDANCE PDF
// ═══════════════════════════════════════════
const downloadMeetupAttendancePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const meetup = await Meetup.findById(id).lean();
    if (!meetup) {
      return res.status(404).json({ success: false, error: 'Meetup not found' });
    }

    const rsvps = await MeetupRSVP.find({ meetup_id: id })
      .sort({ rsvp_status: 1, createdAt: 1 })
      .populate('member_id', 'first_name last_name telegram_username profile_photo_url')
      .lean();

    const weights = meetup.attendance_weights || { physical: 50, x_link: 25, instagram: 25 };

    const enriched = await Promise.all(
      rsvps.map(async (r) => {
        const profile = await MemberProfile.findOne({ user_id: r.member_id }).lean();
        const attendance = await MeetupAttendance.findOne({ meetup_id: id, member_id: r.member_id }).lean();

        const physicalPoints = attendance?.attendance_status === 'PRESENT' ? (meetup.points * weights.physical) / 100 : 0;
        const xPoints = r.x_status === 'APPROVED' ? (meetup.points * weights.x_link) / 100 : 0;
        const instaPoints = r.instagram_status === 'APPROVED' ? (meetup.points * weights.instagram) / 100 : 0;

        return {
          member_id: r.member_id?._id,
          member_name: profile?.full_name || r.member_id?.first_name || 'Unknown',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          whatsapp_number: profile?.whatsapp_number || '',
          telegram_username: r.member_id?.telegram_username || '',
          rsvp_status: r.rsvp_status,
          bringing_guest: r.bringing_guest,
          guest_count: r.guest_count,
          attendance_status: attendance?.attendance_status || 'PENDING',
          check_in_method: attendance?.check_in_method || '',
          physical_points: physicalPoints,
          x_status: r.x_status || 'NOT_SUBMITTED',
          x_link: r.x_link || '',
          x_points: xPoints,
          instagram_status: r.instagram_status || 'NOT_SUBMITTED',
          instagram_link: r.instagram_link || '',
          instagram_points: instaPoints,
        };
      })
    );

    const pdfBuffer = await generateMeetupAttendancePDF(meetup, enriched);

    const safeTitle = meetup.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `xfc-meetup-${safeTitle}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'DOWNLOAD_MEETUP_PDF',
      target_type: 'MEETUP',
      target_id: id,
      new_value: { filename, rsvp_count: enriched.length },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// BROADCAST NOTIFICATION
// ═══════════════════════════════════════════
const broadcastToMembers = async (req, res) => {
  try {
    const { title, message, target = 'ALL', member_ids = [] } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required' });
    }

    if (title.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Title must be at least 3 characters' });
    }

    if (message.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Message must be at least 5 characters' });
    }

    let query = { role: 'MEMBER' };

    if (target === 'ACTIVE') {
      query.status = 'ACTIVE';
    } else if (target === 'SPECIFIC') {
      if (!Array.isArray(member_ids) || member_ids.length === 0) {
        return res.status(400).json({ success: false, error: 'member_ids required for SPECIFIC target' });
      }
      query._id = { $in: member_ids };
    }

    const members = await User.find(query).select('_id telegram_id first_name');

    if (members.length === 0) {
      return res.status(404).json({ success: false, error: 'No members found for the selected target' });
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

    res.json({ success: true, message: `Broadcast sent to ${members.length} members`, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// GET BROADCAST HISTORY
// ═══════════════════════════════════════════
const getBroadcastHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const broadcasts = await Notification.find({ type: 'BROADCAST', is_deleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();

    const groupedMap = new Map();

    broadcasts.forEach((n) => {
      const minuteKey = new Date(n.createdAt).toISOString().substring(0, 16);
      const key = n.broadcast_id || `${n.title}|${n.message}|${minuteKey}`;

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          broadcast_id: n.broadcast_id || key,
          title: n.title,
          message: n.message,
          sent_at: n.createdAt,
          sent_by_admin: n.sent_by_admin,
          total_recipients: 0,
          telegram_sent: 0,
          telegram_failed: 0,
          read_count: 0,
        });
      }

      const group = groupedMap.get(key);
      group.total_recipients += 1;
      if (n.telegram_sent) group.telegram_sent += 1;
      else group.telegram_failed += 1;
      if (n.is_read) group.read_count += 1;
    });

    let history = Array.from(groupedMap.values());
    history.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

    const total = history.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    history = history.slice(skip, skip + parseInt(limit));

    const enrichedHistory = await Promise.all(
      history.map(async (h) => {
        let adminInfo = null;
        if (h.sent_by_admin) {
          adminInfo = await Admin.findById(h.sent_by_admin).select('name email').lean();
        }

        return {
          broadcast_id: h.broadcast_id,
          title: h.title,
          message: h.message,
          sent_at: h.sent_at,
          sent_by: adminInfo ? { name: adminInfo.name, email: adminInfo.email } : null,
          total_recipients: h.total_recipients,
          telegram_sent: h.telegram_sent,
          telegram_failed: h.telegram_failed,
          read_count: h.read_count,
          delivery_rate: h.total_recipients > 0 ? Math.round((h.telegram_sent / h.total_recipients) * 100) : 0,
        };
      })
    );

    res.json({ success: true, total, page: parseInt(page), history: enrichedHistory });
  } catch (error) {
    console.error('getBroadcastHistory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// DELETE BROADCAST
// ═══════════════════════════════════════════
const deleteBroadcast = async (req, res) => {
  try {
    const { broadcast_id, title, message, sent_at } = req.body;

    if (!broadcast_id && !title) {
      return res.status(400).json({ success: false, error: 'broadcast_id or title required' });
    }

    let query = { type: 'BROADCAST' };

    if (broadcast_id && broadcast_id.length === 36) {
      query.broadcast_id = broadcast_id;
    } else if (title && message && sent_at) {
      const d = new Date(sent_at);
      const start = new Date(d);
      start.setSeconds(0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 1);

      query.title = title;
      query.message = message;
      query.createdAt = { $gte: start, $lt: end };
    } else {
      return res.status(400).json({ success: false, error: 'Invalid broadcast identifier' });
    }

    const result = await Notification.updateMany(query, { $set: { is_deleted: true } });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'DELETE_BROADCAST',
      target_type: 'BROADCAST',
      target_id: broadcast_id || null,
      new_value: { deleted_count: result.modifiedCount },
    });

    res.json({
      success: true,
      message: `Broadcast deleted from ${result.modifiedCount} members' inboxes`,
      deleted_count: result.modifiedCount,
    });
  } catch (error) {
    console.error('deleteBroadcast error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// UPDATE BROADCAST
// ═══════════════════════════════════════════
const updateBroadcast = async (req, res) => {
  try {
    const { broadcast_id, title, message, sent_at, new_title, new_message } = req.body;

    if (!new_title || !new_message) {
      return res.status(400).json({ success: false, error: 'new_title and new_message are required' });
    }

    if (new_title.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Title must be at least 3 characters' });
    }

    if (new_message.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Message must be at least 5 characters' });
    }

    let query = { type: 'BROADCAST' };

    if (broadcast_id && broadcast_id.length === 36) {
      query.broadcast_id = broadcast_id;
    } else if (title && message && sent_at) {
      const d = new Date(sent_at);
      const start = new Date(d);
      start.setSeconds(0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 1);

      query.title = title;
      query.message = message;
      query.createdAt = { $gte: start, $lt: end };
    } else {
      return res.status(400).json({ success: false, error: 'Invalid broadcast identifier' });
    }

    const result = await Notification.updateMany(query, {
      $set: { title: new_title.trim(), message: new_message.trim() },
    });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UPDATE_BROADCAST',
      target_type: 'BROADCAST',
      target_id: broadcast_id || null,
      previous_value: { title, message },
      new_value: {
        title: new_title.trim(),
        message: new_message.trim(),
        updated_count: result.modifiedCount,
      },
    });

    res.json({
      success: true,
      message: `Broadcast updated for ${result.modifiedCount} members`,
      modified_count: result.modifiedCount,
    });
  } catch (error) {
    console.error('updateBroadcast error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// BADGE MANAGER
// ═══════════════════════════════════════════

const BADGES_CATALOG = {
  streak: [
    { code: 'WEEK_WARRIOR',      title: 'Week Warrior',       emoji: '🔥', streak_days: 7 },
    { code: 'FORTNIGHT_FIGHTER', title: 'Fortnight Fighter',  emoji: '⚡', streak_days: 14 },
    { code: 'MONTHLY_MASTER',    title: 'Monthly Master',     emoji: '💎', streak_days: 30 },
    { code: 'BIMONTHLY_BOSS',    title: 'Bimonthly Boss',     emoji: '👑', streak_days: 60 },
    { code: 'QUARTERLY_KING',    title: 'Quarterly King',     emoji: '🏆', streak_days: 90 },
    { code: 'CENTURY_CHAMPION',  title: 'Century Champion',   emoji: '🌟', streak_days: 100 },
    { code: 'HALF_YEAR_HERO',    title: 'Half-Year Hero',     emoji: '🎖️', streak_days: 180 },
    { code: 'YEARLY_LEGEND',     title: 'Yearly Legend',      emoji: '💫', streak_days: 365 },
  ],
  admin: [
    { code: 'FOUNDER',        title: 'Founder',         emoji: '🏛️', color: '#FFD700' },
    { code: 'SUPER_ADMIN',    title: 'Super Admin',     emoji: '👑', color: '#FF6900' },
    { code: 'ADMIN',          title: 'Admin',           emoji: '🛡️', color: '#3B82F6' },
    { code: 'VERIFIER',       title: 'Verifier',        emoji: '✅', color: '#10B981' },
    { code: 'REPORT_ADMIN',   title: 'Report Admin',    emoji: '📊', color: '#8B5CF6' },
    { code: 'SPECIAL_ADMIN',  title: 'Special Admin',   emoji: '⭐', color: '#F59E0B' },
    { code: 'MODERATOR',      title: 'Moderator',       emoji: '🛡️', color: '#EC4899' },
    { code: 'TEAM_MEMBER',    title: 'Team Member',     emoji: '🤝', color: '#06B6D4' },
  ],
};

const getBadgesCatalog = async (req, res) => {
  try {
    res.json({ success: true, catalog: BADGES_CATALOG });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const searchUsersForBadges = async (req, res) => {
  try {
    const { q = '', role = '', limit = 20 } = req.query;

    let query = {};
    if (role) query.role = role;

    if (q) {
      query.$or = [
        { telegram_id: { $regex: q, $options: 'i' } },
        { telegram_username: { $regex: q, $options: 'i' } },
        { first_name: { $regex: q, $options: 'i' } },
        { last_name: { $regex: q, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('telegram_id telegram_username first_name last_name profile_photo_url role status badges admin_badges');

    const enriched = await Promise.all(
      users.map(async (u) => {
        const profile = await MemberProfile.findOne({ user_id: u._id });
        return {
          id: u._id,
          telegram_id: u.telegram_id,
          telegram_username: u.telegram_username,
          first_name: u.first_name,
          last_name: u.last_name,
          profile_photo_url: u.profile_photo_url,
          role: u.role,
          status: u.status,
          full_name: profile?.full_name || `${u.first_name} ${u.last_name}`.trim() || 'Unknown',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          badges: u.badges || [],
          admin_badges: u.admin_badges || [],
        };
      })
    );

    res.json({ success: true, count: enriched.length, users: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const giveBadgeToUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { badge_code, type = 'streak', note = '' } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (type === 'admin') {
      const badgeDef = BADGES_CATALOG.admin.find((b) => b.code === badge_code);
      if (!badgeDef) {
        return res.status(400).json({ success: false, error: 'Invalid admin badge code' });
      }

      const alreadyHas = (user.admin_badges || []).some((b) => b.code === badge_code);
      if (alreadyHas) {
        return res.status(400).json({ success: false, error: 'User already has this badge' });
      }

      await User.findByIdAndUpdate(id, {
        $push: {
          admin_badges: {
            code: badgeDef.code,
            title: badgeDef.title,
            emoji: badgeDef.emoji,
            color: badgeDef.color,
            awarded_at: new Date(),
            awarded_by: req.admin._id,
            note: note || '',
          },
        },
      });

      await AuditLog.create({
        admin_id: req.admin._id,
        action: 'GIVE_ADMIN_BADGE',
        target_type: 'MEMBER',
        target_id: id,
        new_value: { badge_code, type, note },
      });

      return res.json({ success: true, message: `Admin badge "${badgeDef.title}" awarded` });
    } else {
      const badgeDef = BADGES_CATALOG.streak.find((b) => b.code === badge_code);
      if (!badgeDef) {
        return res.status(400).json({ success: false, error: 'Invalid streak badge code' });
      }

      const alreadyHas = (user.badges || []).some((b) => b.code === badge_code);
      if (alreadyHas) {
        return res.status(400).json({ success: false, error: 'User already has this badge' });
      }

      await User.findByIdAndUpdate(id, {
        $push: {
          badges: {
            code: badgeDef.code,
            title: badgeDef.title,
            emoji: badgeDef.emoji,
            streak_days: badgeDef.streak_days,
            earned_at: new Date(),
            awarded_by: req.admin._id,
          },
        },
      });

      await AuditLog.create({
        admin_id: req.admin._id,
        action: 'GIVE_STREAK_BADGE',
        target_type: 'MEMBER',
        target_id: id,
        new_value: { badge_code, type },
      });

      return res.json({ success: true, message: `Streak badge "${badgeDef.title}" awarded` });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const giveAllBadgesToUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { include_admin = false } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const newStreakBadges = BADGES_CATALOG.streak
      .filter((b) => !(user.badges || []).some((ub) => ub.code === b.code))
      .map((b) => ({
        code: b.code,
        title: b.title,
        emoji: b.emoji,
        streak_days: b.streak_days,
        earned_at: new Date(),
        awarded_by: req.admin._id,
      }));

    const newAdminBadges = include_admin
      ? BADGES_CATALOG.admin
          .filter((b) => !(user.admin_badges || []).some((ub) => ub.code === b.code))
          .map((b) => ({
            code: b.code,
            title: b.title,
            emoji: b.emoji,
            color: b.color,
            awarded_at: new Date(),
            awarded_by: req.admin._id,
            note: 'Bulk awarded',
          }))
      : [];

    if (newStreakBadges.length > 0) {
      await User.findByIdAndUpdate(id, { $push: { badges: { $each: newStreakBadges } } });
    }
    if (newAdminBadges.length > 0) {
      await User.findByIdAndUpdate(id, { $push: { admin_badges: { $each: newAdminBadges } } });
    }

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'GIVE_ALL_BADGES',
      target_type: 'MEMBER',
      target_id: id,
      new_value: {
        streak_count: newStreakBadges.length,
        admin_count: newAdminBadges.length,
      },
    });

    res.json({
      success: true,
      message: `Awarded ${newStreakBadges.length} streak + ${newAdminBadges.length} admin badges`,
      streak_added: newStreakBadges.length,
      admin_added: newAdminBadges.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const removeBadgeFromUser = async (req, res) => {
  try {
    const { id, badge_code } = req.params;
    const { type = 'streak' } = req.query;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (type === 'admin') {
      await User.findByIdAndUpdate(id, {
        $pull: { admin_badges: { code: badge_code } },
      });
    } else {
      await User.findByIdAndUpdate(id, {
        $pull: { badges: { code: badge_code } },
      });
    }

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'REMOVE_BADGE',
      target_type: 'MEMBER',
      target_id: id,
      new_value: { badge_code, type },
    });

    res.json({ success: true, message: 'Badge removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// AUTO-VERIFICATION — ADMIN CONTROLS
// ═══════════════════════════════════════════

const getAutoVerifySettings = async (req, res) => {
  try {
    const autoVerifyService = require('../services/autoVerify.service');
    const settings = await autoVerifyService.getAutoVerifySettings();
    const patterns = autoVerifyService.getPatternsInfo();

    const today = formatDateIST();
    const currentMonth = today.substring(0, 7);

    const [
      totalAutoApproved,
      todayAutoApproved,
      monthAutoApproved,
      totalPending,
      totalManualApproved,
    ] = await Promise.all([
      Activity.countDocuments({ auto_verified: true }),
      Activity.countDocuments({ auto_verified: true, date: today }),
      Activity.countDocuments({ auto_verified: true, month: currentMonth }),
      Activity.countDocuments({ status: 'PENDING' }),
      Activity.countDocuments({ status: 'APPROVED', auto_verified: false }),
    ]);

    res.json({
      success: true,
      settings,
      patterns,
      stats: {
        total_auto_approved: totalAutoApproved,
        today_auto_approved: todayAutoApproved,
        month_auto_approved: monthAutoApproved,
        total_pending: totalPending,
        total_manual_approved: totalManualApproved,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const toggleAutoVerify = async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean value',
      });
    }

    const autoVerifyService = require('../services/autoVerify.service');
    const TOGGLE_KEY = autoVerifyService.TOGGLE_KEY;

    await SystemSetting.findOneAndUpdate(
      { key: TOGGLE_KEY },
      { value: enabled, updated_at: new Date() },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'TOGGLE_AUTO_VERIFY',
      target_type: 'SYSTEM',
      target_id: null,
      new_value: { enabled },
    });

    res.json({
      success: true,
      message: `Auto-verification ${enabled ? 'ENABLED' : 'DISABLED'}`,
      enabled,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateAutoVerifyTiming = async (req, res) => {
  try {
    const { startTime, endTime } = req.body;
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        error: 'Time must be in HH:MM format (e.g., "20:00")',
      });
    }

    const autoVerifyService = require('../services/autoVerify.service');
    const START_TIME_KEY = autoVerifyService.START_TIME_KEY;
    const END_TIME_KEY = autoVerifyService.END_TIME_KEY;

    await Promise.all([
      SystemSetting.findOneAndUpdate(
        { key: START_TIME_KEY },
        { value: startTime, updated_at: new Date() },
        { upsert: true }
      ),
      SystemSetting.findOneAndUpdate(
        { key: END_TIME_KEY },
        { value: endTime, updated_at: new Date() },
        { upsert: true }
      ),
    ]);

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UPDATE_AUTO_VERIFY_TIMING',
      target_type: 'SYSTEM',
      target_id: null,
      new_value: { startTime, endTime },
    });

    res.json({
      success: true,
      message: `Timing updated: ${startTime} - ${endTime} IST`,
      startTime,
      endTime,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getAutoApprovedLog = async (req, res) => {
  try {
    const { page = 1, limit = 50, platform, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { auto_verified: true };
    if (platform) query.platform = platform;
    if (status) query.status = status;

    const [activities, total] = await Promise.all([
      Activity.find(query)
        .sort({ submitted_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('member_id', 'first_name last_name telegram_username profile_photo_url'),
      Activity.countDocuments(query),
    ]);

    const enriched = await Promise.all(
      activities.map(async (a) => {
        const profile = await MemberProfile.findOne({ user_id: a.member_id });
        return {
          id: a._id,
          activity_id: a.activity_id,
          member_id: a.member_id?._id,
          member_name: profile?.full_name || a.member_id?.first_name || 'Unknown',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          telegram_username: a.member_id?.telegram_username || '',
          platform: a.platform,
          activity_type: a.activity_type,
          url: a.url,
          status: a.status,
          submitted_at: a.submitted_at,
          verified_at: a.verified_at,
          auto_verify_reason: a.auto_verify_reason,
          points: a.points,
          rejection_reason: a.rejection_reason || '',
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

const overrideAutoApproved = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required (min 3 characters)',
      });
    }

    const activity = await Activity.findById(id);
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    if (!activity.auto_verified) {
      return res.status(400).json({
        success: false,
        error: 'This activity was not auto-approved. Use regular reject flow.',
      });
    }

    if (activity.status === 'REJECTED') {
      return res.status(400).json({
        success: false,
        error: 'Activity already rejected',
      });
    }

    activity.status = 'REJECTED';
    activity.rejection_reason = reason.trim();
    activity.verified_at = new Date();
    activity.verified_by = req.admin._id;
    activity.verified_by_system = false;
    await activity.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'OVERRIDE_AUTO_APPROVED',
      target_type: 'ACTIVITY',
      target_id: activity._id,
      new_value: {
        member_id: activity.member_id,
        reason: reason.trim(),
        previous_status: 'APPROVED',
      },
    });

    res.json({
      success: true,
      message: 'Auto-approved activity rejected',
      activity_id: activity._id,
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

  getBadgesCatalog,
  searchUsersForBadges,
  giveBadgeToUser,
  giveAllBadgesToUser,
  removeBadgeFromUser,

  // Auto-Verification
  getAutoVerifySettings,
  toggleAutoVerify,
  updateAutoVerifyTiming,
  getAutoApprovedLog,
  overrideAutoApproved,
};