const SpecialActivity = require('../models/SpecialActivity');
const SpecialSubmission = require('../models/SpecialSubmission');
const MonthlyScore = require('../models/MonthlyScore');
const MemberProfile = require('../models/MemberProfile');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const notificationService = require('../services/notification.service');
const {
  normalizeUrl,
  getUrlHash,
  detectPlatform,
  isValidUrl,
} = require('../services/url.service');
const { formatDateIST } = require('../services/points.service');

// ═══════════════════════════════════════════
// HELPER: Calculate points per item
// Total special_points ko items ke beech equally divide karo
// Sirf required items ke liye points count honge
// ═══════════════════════════════════════════
const calcItemPoints = (activity, totalItems) => {
  if (!totalItems || totalItems === 0) return 0;
  const totalRequired = activity.requirements.reduce(
    (sum, r) => sum + (r.required_count || 0),
    0
  );
  if (totalRequired === 0) return 0;

  // Points per individual URL = special_points / total required URLs
  return Math.round((activity.special_points / totalRequired) * 100) / 100;
};

// ═══════════════════════════════════════════
// HELPER: Recalculate overall submission status
// ═══════════════════════════════════════════
const recalcSubmissionStatus = (submission) => {
  const items = submission.items || [];
  if (items.length === 0) return 'NOT_STARTED';

  const allPending = items.every((i) => i.status === 'PENDING');
  const allApproved = items.every((i) => i.status === 'APPROVED');
  const anyApproved = items.some((i) => i.status === 'APPROVED');
  const anyRejected = items.some((i) => i.status === 'REJECTED');
  const allRejected = items.every((i) => i.status === 'REJECTED');

  if (allApproved) return 'APPROVED';
  if (allRejected) return 'REJECTED';
  if (anyApproved && anyRejected) return 'PARTIALLY_APPROVED';
  if (anyApproved) return 'PARTIALLY_APPROVED';
  if (allPending) return 'SUBMITTED';
  return 'UNDER_REVIEW';
};

// ═══════════════════════════════════════════
// ADMIN: CREATE SPECIAL ACTIVITY
// ═══════════════════════════════════════════
const createSpecialActivity = async (req, res) => {
  try {
    const {
      title,
      description,
      banner_url,
      start_date,
      end_date,
      instructions,
      special_points,
      approval_required,
      member_editing_allowed,
      count_toward_leaderboard,
      requirements,
    } = req.body;

    if (!title || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Title, start date, and end date are required',
      });
    }

    if (!Array.isArray(requirements) || requirements.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one requirement is needed',
      });
    }

    for (const req_item of requirements) {
      if (!req_item.platform || !req_item.activity_type || !req_item.required_count) {
        return res.status(400).json({
          success: false,
          error: 'Each requirement needs platform, activity type, and count',
        });
      }
    }

    const activity = await SpecialActivity.create({
      title: title.trim(),
      description: description || '',
      banner_url: banner_url || '',
      start_date: new Date(start_date),
      end_date: new Date(end_date),
      instructions: instructions || '',
      special_points: parseInt(special_points) || 0,
      approval_required: approval_required !== false,
      member_editing_allowed: member_editing_allowed === true,
      count_toward_leaderboard: count_toward_leaderboard !== false,
      requirements: requirements.map((r) => ({
        platform: r.platform,
        activity_type: r.activity_type,
        required_count: parseInt(r.required_count),
        is_required: r.is_required !== false,
      })),
      status: 'DRAFT',
      created_by: req.admin._id,
    });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'CREATE_SPECIAL_ACTIVITY',
      target_type: 'SPECIAL_ACTIVITY',
      target_id: activity._id,
      new_value: { title: activity.title },
    });

    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: LIST SPECIAL ACTIVITIES
// ═══════════════════════════════════════════
const listSpecialActivities = async (req, res) => {
  try {
    const { status } = req.query;

    const query = {};
    if (status) query.status = status;

    const activities = await SpecialActivity.find(query)
      .sort({ createdAt: -1 })
      .populate('created_by', 'name email');

    const enriched = await Promise.all(
      activities.map(async (act) => {
        const [submissionCount, approvedCount, pendingCount] = await Promise.all([
          SpecialSubmission.countDocuments({ special_activity_id: act._id }),
          SpecialSubmission.countDocuments({
            special_activity_id: act._id,
            status: 'APPROVED',
          }),
          SpecialSubmission.countDocuments({
            special_activity_id: act._id,
            status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
          }),
        ]);

        return {
          ...act.toObject(),
          submissionCount,
          approvedCount,
          pendingCount,
        };
      })
    );

    res.json({ success: true, activities: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: GET SPECIAL ACTIVITY DETAILS (with submissions)
// ═══════════════════════════════════════════
const getSpecialActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await SpecialActivity.findById(id).populate(
      'created_by',
      'name email'
    );

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Special activity not found',
      });
    }

    const submissions = await SpecialSubmission.find({
      special_activity_id: id,
    })
      .sort({ createdAt: 1 })
      .populate('member_id', 'first_name last_name telegram_username profile_photo_url');

    const enrichedSubmissions = await Promise.all(
      submissions.map(async (sub) => {
        const profile = await MemberProfile.findOne({ user_id: sub.member_id });
        return {
          id: sub._id,
          member_id: sub.member_id?._id,
          member_name: profile?.full_name || sub.member_id?.first_name || 'Unknown',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          telegram_username: sub.member_id?.telegram_username || '',
          profile_photo_url: sub.member_id?.profile_photo_url || '',

          items: sub.items,
          status: sub.status,
          points_awarded: sub.points_awarded,
          is_locked: sub.is_locked,
          locked_at: sub.locked_at,
          submitted_at: sub.submitted_at,
          last_edited_by: sub.last_edited_by,
          last_edited_at: sub.last_edited_at,
          created_at: sub.createdAt,
        };
      })
    );

    res.json({
      success: true,
      activity,
      submissions: enrichedSubmissions,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: UPDATE SPECIAL ACTIVITY
// ═══════════════════════════════════════════
const updateSpecialActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.status;

    const activity = await SpecialActivity.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Special activity not found',
      });
    }

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UPDATE_SPECIAL_ACTIVITY',
      target_type: 'SPECIAL_ACTIVITY',
      target_id: id,
      new_value: updates,
    });

    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: UPDATE STATUS
// ═══════════════════════════════════════════
const updateSpecialStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['DRAFT', 'LOCKED', 'OPEN', 'PAUSED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
      });
    }

    const activity = await SpecialActivity.findById(id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Special activity not found',
      });
    }

    if (status === 'OPEN') {
      const now = new Date();
      if (now < activity.start_date) {
        return res.status(400).json({
          success: false,
          error: 'Cannot open before start date',
        });
      }
      if (now > activity.end_date) {
        return res.status(400).json({
          success: false,
          error: 'Cannot open after end date',
        });
      }
    }

    const previousStatus = activity.status;
    activity.status = status;
    await activity.save();

    // Notify members on OPEN
    if (status === 'OPEN' && previousStatus !== 'OPEN') {
      try {
        const members = await User.find({
          role: 'MEMBER',
          status: 'ACTIVE',
          'notification_preferences.broadcasts': { $ne: false },
        }).select('_id telegram_id first_name');

        const template = notificationService.formatSpecialCampaign({
          campaign: activity,
        });

        for (const member of members) {
          if (!member.telegram_id) continue;
          await notificationService.sendNotification({
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
        console.error('Special campaign notification failed:', notifErr.message);
      }
    }

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UPDATE_SPECIAL_STATUS',
      target_type: 'SPECIAL_ACTIVITY',
      target_id: id,
      previous_value: { status: previousStatus },
      new_value: { status },
    });

    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: DELETE SPECIAL ACTIVITY
// ═══════════════════════════════════════════
const deleteSpecialActivity = async (req, res) => {
  try {
    const { id } = req.params;

    const activity = await SpecialActivity.findById(id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Special activity not found',
      });
    }

    await SpecialSubmission.deleteMany({ special_activity_id: id });
    await SpecialActivity.findByIdAndDelete(id);

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'DELETE_SPECIAL_ACTIVITY',
      target_type: 'SPECIAL_ACTIVITY',
      target_id: id,
      previous_value: { title: activity.title },
    });

    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: VERIFY SUBMISSION ITEM (Meetup-style)
// ═══════════════════════════════════════════
const verifySubmissionItem = async (req, res) => {
  try {
    const { submissionId, itemIndex } = req.params;
    const { status, reason } = req.body;

    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
      });
    }

    const submission = await SpecialSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    const activity = await SpecialActivity.findById(submission.special_activity_id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Special activity not found',
      });
    }

    const itemIdx = parseInt(itemIndex);
    if (itemIdx < 0 || itemIdx >= submission.items.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid item index',
      });
    }

    const item = submission.items[itemIdx];
    const previousStatus = item.status;

    // ═══════════════════════════════════════════
    // UPDATE ITEM STATUS
    // ═══════════════════════════════════════════
    item.status = status;
    item.reviewed_at = new Date();
    item.reviewed_by = req.admin._id;

    if (status === 'REJECTED') {
      item.rejection_reason = reason || 'Rejected by admin';
      item.points = 0;
    } else if (status === 'APPROVED') {
      item.rejection_reason = '';
      item.points = calcItemPoints(activity, submission.items.length);
    } else {
      item.rejection_reason = '';
      item.points = 0;
    }

    // ═══════════════════════════════════════════
    // RECALCULATE OVERALL STATUS
    // ═══════════════════════════════════════════
    submission.status = recalcSubmissionStatus(submission);

    // ═══════════════════════════════════════════
    // POINTS CALCULATION
    // Total approved items ke points sum karo
    // ═══════════════════════════════════════════
    const totalPoints = submission.items
      .filter((i) => i.status === 'APPROVED')
      .reduce((sum, i) => sum + (i.points || 0), 0);

    const previousPoints = submission.points_awarded || 0;
    const pointsDelta = totalPoints - previousPoints;

    submission.points_awarded = totalPoints;

    // ═══════════════════════════════════════════
    // UPDATE MONTHLY SCORE
    // Sirf delta add karo (agar points change hue)
    // ═══════════════════════════════════════════
    if (pointsDelta !== 0 && activity.count_toward_leaderboard) {
      const month = formatDateIST().substring(0, 7);

      await MonthlyScore.findOneAndUpdate(
        { member_id: submission.member_id, month },
        {
          $inc: {
            special_points: pointsDelta,
            total_points: pointsDelta,
          },
          $setOnInsert: {
            member_id: submission.member_id,
            month,
          },
        },
        { upsert: true }
      );
    }

    await submission.save();

    // ═══════════════════════════════════════════
    // NOTIFY MEMBER
    // ═══════════════════════════════════════════
    try {
      const member = await User.findById(submission.member_id);
      if (member && member.telegram_id) {
        const statusEmoji =
          status === 'APPROVED' ? '✅' : status === 'REJECTED' ? '❌' : '⏳';
        const statusText =
          status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Pending';

        const message = `${statusEmoji} *Special Activity — ${statusText}*\n\n*${activity.title}*\n\n📌 Item: ${item.platform} ${item.activity_type}\n🔗 ${item.url}\n${
          status === 'REJECTED' ? `\n❌ Reason: ${item.rejection_reason}` : ''
        }${
          status === 'APPROVED' ? `\n\n+${item.points} points awarded!` : ''
        }`;

        await notificationService.sendNotification({
          memberId: member._id,
          telegramId: member.telegram_id,
          type: status === 'APPROVED' ? 'ACTIVITY_APPROVED' : 'ACTIVITY_REJECTED',
          title: `Special Activity ${statusText}`,
          message,
          data: {
            special_activity_id: activity._id,
            item_index: itemIdx,
            status,
          },
          adminId: req.admin._id,
        });
      }
    } catch (notifErr) {
      console.error('Special review notification failed:', notifErr.message);
    }

    await AuditLog.create({
      admin_id: req.admin._id,
      action: `SPECIAL_ITEM_${status}`,
      target_type: 'SPECIAL_SUBMISSION',
      target_id: submission._id,
      previous_value: { status: previousStatus },
      new_value: {
        item_index: itemIdx,
        status,
        reason: reason || '',
        points_delta: pointsDelta,
      },
    });

    res.json({
      success: true,
      submission,
      points_delta: pointsDelta,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: BULK VERIFY ITEMS
// ═══════════════════════════════════════════
const bulkVerifyItems = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { status, reason } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const submission = await SpecialSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    const activity = await SpecialActivity.findById(submission.special_activity_id);
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Special activity not found' });
    }

    const itemPoints = calcItemPoints(activity, submission.items.length);

    // Update all pending items
    submission.items.forEach((item) => {
      if (item.status === 'PENDING') {
        item.status = status;
        item.reviewed_at = new Date();
        item.reviewed_by = req.admin._id;

        if (status === 'APPROVED') {
          item.points = itemPoints;
          item.rejection_reason = '';
        } else {
          item.points = 0;
          item.rejection_reason = reason || 'Bulk rejected';
        }
      }
    });

    submission.status = recalcSubmissionStatus(submission);

    // Points recalc
    const totalPoints = submission.items
      .filter((i) => i.status === 'APPROVED')
      .reduce((sum, i) => sum + (i.points || 0), 0);

    const previousPoints = submission.points_awarded || 0;
    const pointsDelta = totalPoints - previousPoints;
    submission.points_awarded = totalPoints;

    if (pointsDelta !== 0 && activity.count_toward_leaderboard) {
      const month = formatDateIST().substring(0, 7);
      await MonthlyScore.findOneAndUpdate(
        { member_id: submission.member_id, month },
        {
          $inc: { special_points: pointsDelta, total_points: pointsDelta },
          $setOnInsert: { member_id: submission.member_id, month },
        },
        { upsert: true }
      );
    }

    await submission.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: `SPECIAL_BULK_${status}`,
      target_type: 'SPECIAL_SUBMISSION',
      target_id: submission._id,
      new_value: { status, points_delta: pointsDelta },
    });

    res.json({ success: true, submission, points_delta: pointsDelta });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: EDIT MEMBER SUBMISSION (Override)
// ═══════════════════════════════════════════
const editMemberSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { items, note } = req.body;

    const submission = await SpecialSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    const previous = {
      items: submission.items.map((i) => ({
        url: i.url,
        status: i.status,
      })),
    };

    if (Array.isArray(items)) {
      submission.items = items.map((item) => ({
        platform: item.platform || 'Unknown',
        activity_type: item.activity_type || 'Post',
        url: item.url,
        normalized_url: item.normalized_url || item.url,
        url_hash: item.url_hash || '',
        status: item.status || 'PENDING',
        rejection_reason: item.rejection_reason || '',
        points: item.points || 0,
        submitted_at: item.submitted_at || submission.createdAt,
        reviewed_at: item.reviewed_at || null,
        reviewed_by: item.reviewed_by || null,
      }));
    }

    submission.status = recalcSubmissionStatus(submission);
    submission.last_edited_by = req.admin._id;
    submission.last_edited_at = new Date();
    submission.edit_history.push({
      edited_by: req.admin._id,
      edited_at: new Date(),
      changes: { items },
      note: note || '',
    });

    await submission.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'EDIT_SPECIAL_SUBMISSION',
      target_type: 'SPECIAL_SUBMISSION',
      target_id: submission._id,
      previous_value: previous,
      new_value: { items, note },
    });

    res.json({ success: true, submission });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEMBER: GET ACTIVE SPECIAL ACTIVITIES
// ═══════════════════════════════════════════
const getMemberSpecialActivities = async (req, res) => {
  try {
    const activities = await SpecialActivity.find({ status: 'OPEN' })
      .sort({ createdAt: -1 })
      .select('-created_by');

    const enriched = await Promise.all(
      activities.map(async (act) => {
        const submission = await SpecialSubmission.findOne({
          special_activity_id: act._id,
          member_id: req.user._id,
        });
        return {
          ...act.toObject(),
          mySubmission: submission || null,
        };
      })
    );

    res.json({ success: true, activities: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEMBER: SUBMIT TO SPECIAL ACTIVITY
// ═══════════════════════════════════════════
const submitSpecialActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items to submit',
      });
    }

    const activity = await SpecialActivity.findById(id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Special activity not found',
      });
    }

    if (activity.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        error: 'Special activity is not open',
      });
    }

    const now = new Date();
    if (now > activity.end_date) {
      return res.status(400).json({
        success: false,
        error: 'Submission deadline has passed',
      });
    }

    // ═══════════════════════════════════════════
    // CHECK EXISTING SUBMISSION
    // ═══════════════════════════════════════════
    let submission = await SpecialSubmission.findOne({
      special_activity_id: id,
      member_id: req.user._id,
    });

    if (submission && submission.is_locked) {
      return res.status(403).json({
        success: false,
        error: 'Your submission is locked. Contact admin to make changes.',
      });
    }

    // ═══════════════════════════════════════════
    // VALIDATE AND PROCESS ITEMS
    // ═══════════════════════════════════════════
    const processedItems = [];
    for (const item of items) {
      if (!item.url || !isValidUrl(item.url)) {
        return res.status(400).json({
          success: false,
          error: `Invalid URL: ${item.url}`,
        });
      }

      const platform = item.platform || detectPlatform(item.url);
      const normalizedUrl = normalizeUrl(item.url);
      const urlHash = getUrlHash(item.url);

      processedItems.push({
        platform,
        activity_type: item.activity_type || 'Post',
        url: item.url,
        normalized_url: normalizedUrl,
        url_hash: urlHash,
        status: 'PENDING',
        submitted_at: new Date(),
      });
    }

    // ═══════════════════════════════════════════
    // UPSERT SUBMISSION
    // ═══════════════════════════════════════════
    if (submission) {
      submission.items = processedItems;
      submission.status = 'SUBMITTED';
      submission.submitted_at = new Date();

      // Lock if member editing not allowed
      if (!activity.member_editing_allowed) {
        submission.is_locked = true;
        submission.locked_at = new Date();
      }
    } else {
      submission = new SpecialSubmission({
        special_activity_id: id,
        member_id: req.user._id,
        items: processedItems,
        status: 'SUBMITTED',
        submitted_at: new Date(),
        is_locked: !activity.member_editing_allowed,
        locked_at: !activity.member_editing_allowed ? new Date() : null,
      });
    }

    await submission.save();

    // Update activity stats
    await SpecialActivity.findByIdAndUpdate(id, {
      $inc: { total_submissions: submission.isNew ? 1 : 0 },
    });

    res.json({ success: true, submission });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Submission already exists',
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
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
};