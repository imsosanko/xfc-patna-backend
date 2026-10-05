const SpecialActivity = require('../models/SpecialActivity');
const SpecialSubmission = require('../models/SpecialSubmission');
const MonthlyScore = require('../models/MonthlyScore');
const MemberProfile = require('../models/MemberProfile');
const User = require('../models/User');
const Meetup = require('../models/Meetup');
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
// ═══════════════════════════════════════════
const calcItemPoints = (activity, totalItems) => {
  if (!totalItems || totalItems === 0) return 0;
  const totalRequired = activity.requirements.reduce(
    (sum, r) => sum + (r.required_count || 0),
    0
  );
  if (totalRequired === 0) return 0;
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
// HELPER: Check compliance with min requirements
// ═══════════════════════════════════════════
const checkCompliance = (activity, submission) => {
  const requiredReqs = activity.requirements.filter((r) => r.is_required);
  const missing = [];

  requiredReqs.forEach((req) => {
    const approvedCount = submission.items.filter(
      (item) =>
        item.platform === req.platform &&
        item.activity_type === req.activity_type &&
        item.status === 'APPROVED'
    ).length;

    if (approvedCount < req.required_count) {
      missing.push({
        platform: req.platform,
        activity_type: req.activity_type,
        required: req.required_count,
        approved: approvedCount,
        short_by: req.required_count - approvedCount,
      });
    }
  });

  return {
    compliant: missing.length === 0,
    missing,
  };
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
      activity_type,
      linked_meetup_id,
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

    const validTypes = ['NORMAL', 'MEETUP_LAUNCH_LINKED', 'MEETUP_LAUNCH_LABEL'];
    const finalType = validTypes.includes(activity_type) ? activity_type : 'NORMAL';

    let finalMeetupId = null;
    if (finalType === 'MEETUP_LAUNCH_LINKED') {
      if (!linked_meetup_id) {
        return res.status(400).json({
          success: false,
          error: 'Meetup must be selected for linked launch',
        });
      }
      const meetupExists = await Meetup.findById(linked_meetup_id);
      if (!meetupExists) {
        return res.status(404).json({
          success: false,
          error: 'Selected meetup not found',
        });
      }
      finalMeetupId = linked_meetup_id;
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
      activity_type: finalType,
      linked_meetup_id: finalMeetupId,
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
      new_value: { title: activity.title, activity_type: finalType },
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
      .populate('created_by', 'name email')
      .populate('linked_meetup_id', 'title date venue banner_url');

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
// ADMIN: GET SPECIAL ACTIVITY DETAILS
// ═══════════════════════════════════════════
const getSpecialActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await SpecialActivity.findById(id)
      .populate('created_by', 'name email')
      .populate('linked_meetup_id', 'title date venue banner_url');

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
        const compliance = checkCompliance(activity, sub);

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

          is_compliant: compliance.compliant,
          missing_requirements: compliance.missing,
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

    if (updates.activity_type) {
      const validTypes = ['NORMAL', 'MEETUP_LAUNCH_LINKED', 'MEETUP_LAUNCH_LABEL'];
      if (!validTypes.includes(updates.activity_type)) {
        delete updates.activity_type;
      }
    }

    if (updates.activity_type === 'MEETUP_LAUNCH_LINKED' && updates.linked_meetup_id) {
      const meetupExists = await Meetup.findById(updates.linked_meetup_id);
      if (!meetupExists) {
        return res.status(404).json({
          success: false,
          error: 'Selected meetup not found',
        });
      }
    }

    if (
      updates.activity_type &&
      updates.activity_type !== 'MEETUP_LAUNCH_LINKED'
    ) {
      updates.linked_meetup_id = null;
    }

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

    // ✅ Admin full control — koi date restriction nahi
    const previousStatus = activity.status;
    activity.status = status;
    await activity.save();

    // Notify members when publishing (OPEN)
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
// ADMIN: VERIFY SUBMISSION ITEM
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

    submission.status = recalcSubmissionStatus(submission);

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

    const compliance = checkCompliance(activity, submission);

    try {
      const member = await User.findById(submission.member_id);
      if (member && member.telegram_id) {
        const statusEmoji =
          status === 'APPROVED' ? '✅' : status === 'REJECTED' ? '❌' : '⏳';
        const statusText =
          status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Pending';

        let complianceNote = '';
        if (!compliance.compliant && status === 'APPROVED') {
          const missingList = compliance.missing
            .map((m) => `${m.platform} (${m.approved}/${m.required})`)
            .join(', ');
          complianceNote = `\n\n⚠️ *Still missing required items:*\n${missingList}`;
        }

        const message = `${statusEmoji} *Special Activity — ${statusText}*\n\n*${activity.title}*\n\n📌 Item: ${item.platform} ${item.activity_type}\n🔗 ${item.url}\n${
          status === 'REJECTED' ? `\n❌ Reason: ${item.rejection_reason}` : ''
        }${
          status === 'APPROVED' ? `\n\n+${item.points} points awarded!` : ''
        }${complianceNote}`;

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
      compliance,
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

    const compliance = checkCompliance(activity, submission);

    await AuditLog.create({
      admin_id: req.admin._id,
      action: `SPECIAL_BULK_${status}`,
      target_type: 'SPECIAL_SUBMISSION',
      target_id: submission._id,
      new_value: { status, points_delta: pointsDelta },
    });

    res.json({
      success: true,
      submission,
      points_delta: pointsDelta,
      compliance,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ADMIN: EDIT MEMBER SUBMISSION
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
    // ✅ Always visible — DRAFT chhod ke sab status dikhe
    const activities = await SpecialActivity.find({
      status: { $in: ['OPEN', 'PAUSED', 'CLOSED', 'LOCKED'] },
    })
      .sort({ createdAt: -1 })
      .select('-created_by')
      .populate('linked_meetup_id', 'title date venue banner_url status');

    const enriched = await Promise.all(
      activities.map(async (act) => {
        const submission = await SpecialSubmission.findOne({
          special_activity_id: act._id,
          member_id: req.user._id,
        });

        let compliance = null;
        if (submission) {
          compliance = checkCompliance(act, submission);
        }

        return {
          ...act.toObject(),
          mySubmission: submission || null,
          myCompliance: compliance,
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

// ✅ Status check
if (activity.status !== 'OPEN') {
  if (activity.status === 'PAUSED') {
    return res.status(400).json({
      success: false,
      error: 'Submission is temporarily paused by admin',
    });
  }
  if (activity.status === 'CLOSED') {
    return res.status(400).json({
      success: false,
      error: 'Submission is closed',
    });
  }
  if (activity.status === 'LOCKED') {
    return res.status(400).json({
      success: false,
      error: 'Submission is locked',
    });
  }
  return res.status(400).json({
    success: false,
    error: 'Special activity is not open for submission',
  });
}

const now = new Date();

// ✅ Start date se pehle block
if (now < activity.start_date) {
  const startStr = new Date(activity.start_date).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  return res.status(400).json({
    success: false,
    error: `Submission opens on ${startStr}. Come back then!`,
  });
}

// ✅ End date ke baad block
if (now > activity.end_date) {
  return res.status(400).json({
    success: false,
    error: 'Submission deadline has passed',
  });
}

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

    const processedItems = [];
    const itemHashes = [];

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

      itemHashes.push(urlHash);
    }

    // GLOBAL DUPLICATE DETECTION
    const excludeSubmissionId = submission?._id;

    const duplicateQuery = {
      'items.url_hash': { $in: itemHashes },
    };

    if (excludeSubmissionId) {
      duplicateQuery._id = { $ne: excludeSubmissionId };
    }

    const duplicateSubmission = await SpecialSubmission.findOne(duplicateQuery)
      .populate('special_activity_id', 'title')
      .populate('member_id', 'first_name last_name')
      .lean();

    if (duplicateSubmission) {
      const dupHashes = new Set(
        duplicateSubmission.items
          .filter((i) => itemHashes.includes(i.url_hash))
          .map((i) => i.url_hash)
      );

      const dupItem = processedItems.find((p) => dupHashes.has(p.url_hash));
      const activityTitle = duplicateSubmission.special_activity_id?.title || 'another activity';

      return res.status(409).json({
        success: false,
        error: `Duplicate link detected: "${dupItem?.url}" was already submitted in "${activityTitle}". Each link can only be submitted once.`,
        duplicate_url: dupItem?.url,
      });
    }

    // INTERNAL DUPLICATE CHECK
    const hashSet = new Set();
    for (const hash of itemHashes) {
      if (hashSet.has(hash)) {
        return res.status(400).json({
          success: false,
          error: 'Same URL submitted twice in this submission',
        });
      }
      hashSet.add(hash);
    }

    // UPSERT SUBMISSION
    if (submission) {
      submission.items = processedItems;
      submission.status = 'SUBMITTED';
      submission.submitted_at = new Date();

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

    await SpecialActivity.findByIdAndUpdate(id, {
      $inc: { total_submissions: submission.isNew ? 1 : 0 },
    });

    const compliance = checkCompliance(activity, submission);

    res.json({
      success: true,
      submission,
      compliance,
    });
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

// ═══════════════════════════════════════════
// ✅ PHASE 2: ACTIVITY LEADERBOARD
// ═══════════════════════════════════════════
const getActivityLeaderboard = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const activity = await SpecialActivity.findById(id).lean();
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    const leaderboard = await SpecialSubmission.aggregate([
      { $match: { special_activity_id: activity._id } },
      {
        $project: {
          member_id: 1,
          points_awarded: 1,
          status: 1,
          approved_count: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.status', 'APPROVED'] },
              },
            },
          },
          rejected_count: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.status', 'REJECTED'] },
              },
            },
          },
          total_items: { $size: '$items' },
          submitted_at: 1,
        },
      },
      {
        $match: {
          $or: [
            { approved_count: { $gt: 0 } },
            { points_awarded: { $gt: 0 } },
          ],
        },
      },
      {
        $sort: { points_awarded: -1, approved_count: -1, submitted_at: 1 },
      },
      { $limit: limit },
    ]);

    const enriched = await Promise.all(
      leaderboard.map(async (entry, idx) => {
        const user = await User.findById(entry.member_id)
          .select('first_name last_name telegram_username profile_photo_url badges admin_badges')
          .lean();
        const profile = await MemberProfile.findOne({ user_id: entry.member_id }).lean();

        return {
          rank: idx + 1,
          member_id: entry.member_id,
          name: profile?.full_name || user?.first_name || 'Unknown',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          telegram_username: user?.telegram_username || '',
          photo_url: user?.profile_photo_url || '',
          badges: (user?.badges || []).slice(0, 3),
          admin_badges: (user?.admin_badges || []).slice(0, 3),
          points: Math.round((entry.points_awarded || 0) * 100) / 100,
          approved_count: entry.approved_count || 0,
          total_items: entry.total_items || 0,
          status: entry.status,
          submitted_at: entry.submitted_at,
        };
      })
    );

    let myRank = null;
    let myEntry = null;
    if (req.user) {
      const idx = enriched.findIndex(
        (e) => String(e.member_id) === String(req.user._id)
      );
      if (idx >= 0) {
        myRank = idx + 1;
        myEntry = enriched[idx];
      }
    }

    res.json({
      success: true,
      activity: {
        _id: activity._id,
        title: activity.title,
        banner_url: activity.banner_url,
        special_points: activity.special_points,
        activity_type: activity.activity_type,
      },
      total_ranked: enriched.length,
      leaderboard: enriched,
      my_rank: myRank,
      my_entry: myEntry,
    });
  } catch (error) {
    console.error('getActivityLeaderboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ✅ PHASE 2: ACTIVITY ANALYTICS
// ═══════════════════════════════════════════
const getActivityAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    const activity = await SpecialActivity.findById(id).lean();
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    const submissions = await SpecialSubmission.find({
      special_activity_id: id,
    }).lean();

    const totalSubmissions = submissions.length;
    const uniqueMembers = new Set(submissions.map((s) => String(s.member_id))).size;

    let totalItems = 0;
    let approvedItems = 0;
    let rejectedItems = 0;
    let pendingItems = 0;
    let totalPointsAwarded = 0;

    const statusBreakdown = {
      NOT_STARTED: 0,
      SUBMITTED: 0,
      UNDER_REVIEW: 0,
      APPROVED: 0,
      PARTIALLY_APPROVED: 0,
      REJECTED: 0,
      COMPLETED: 0,
    };

    const platformStats = {};

    submissions.forEach((sub) => {
      statusBreakdown[sub.status] = (statusBreakdown[sub.status] || 0) + 1;
      totalPointsAwarded += sub.points_awarded || 0;

      (sub.items || []).forEach((item) => {
        totalItems++;
        if (item.status === 'APPROVED') approvedItems++;
        else if (item.status === 'REJECTED') rejectedItems++;
        else pendingItems++;

        const key = `${item.platform}-${item.activity_type}`;
        if (!platformStats[key]) {
          platformStats[key] = {
            platform: item.platform,
            activity_type: item.activity_type,
            total: 0,
            approved: 0,
            rejected: 0,
            pending: 0,
          };
        }
        platformStats[key].total++;
        if (item.status === 'APPROVED') platformStats[key].approved++;
        else if (item.status === 'REJECTED') platformStats[key].rejected++;
        else platformStats[key].pending++;
      });
    });

    const approvalRate = totalItems > 0 ? Math.round((approvedItems / totalItems) * 100) : 0;
    const completionRate = totalSubmissions > 0
      ? Math.round(((statusBreakdown.APPROVED + statusBreakdown.COMPLETED) / totalSubmissions) * 100)
      : 0;
    const avgPointsPerSubmission = totalSubmissions > 0
      ? Math.round((totalPointsAwarded / totalSubmissions) * 100) / 100
      : 0;
    const avgItemsPerSubmission = totalSubmissions > 0
      ? Math.round((totalItems / totalSubmissions) * 100) / 100
      : 0;

    const dailyTrend = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const count = submissions.filter((s) => {
        if (!s.submitted_at) return false;
        const subDate = new Date(s.submitted_at).toLocaleDateString('en-CA', {
          timeZone: 'Asia/Kolkata',
        });
        return subDate === dateStr;
      }).length;
      dailyTrend.push({ date: dateStr, count });
    }

    res.json({
      success: true,
      activity: {
        _id: activity._id,
        title: activity.title,
        status: activity.status,
        special_points: activity.special_points,
        start_date: activity.start_date,
        end_date: activity.end_date,
      },
      overview: {
        total_submissions: totalSubmissions,
        unique_members: uniqueMembers,
        total_items: totalItems,
        approved_items: approvedItems,
        rejected_items: rejectedItems,
        pending_items: pendingItems,
        total_points_awarded: Math.round(totalPointsAwarded * 100) / 100,
        approval_rate: approvalRate,
        completion_rate: completionRate,
        avg_points_per_submission: avgPointsPerSubmission,
        avg_items_per_submission: avgItemsPerSubmission,
      },
      status_breakdown: statusBreakdown,
      platform_stats: Object.values(platformStats).sort((a, b) => b.total - a.total),
      daily_trend: dailyTrend,
    });
  } catch (error) {
    console.error('getActivityAnalytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// ✅ PHASE 2: EXPORT ACTIVITY SUBMISSIONS
// ═══════════════════════════════════════════
const exportActivitySubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv', status: statusFilter } = req.query;

    const activity = await SpecialActivity.findById(id).lean();
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    const query = { special_activity_id: id };
    if (statusFilter) query.status = statusFilter;

    const submissions = await SpecialSubmission.find(query)
      .sort({ points_awarded: -1, createdAt: 1 })
      .populate('member_id', 'first_name last_name telegram_username')
      .lean();

    const headers = [
      'Rank', 'Member', 'Xiaomi ID', 'Telegram', 'Status', 'Points Awarded',
      'Approved Items', 'Rejected Items', 'Pending Items', 'Submitted At', 'Item Details',
    ];

    const rows = [];
    for (let idx = 0; idx < submissions.length; idx++) {
      const sub = submissions[idx];
      const profile = await MemberProfile.findOne({ user_id: sub.member_id?._id }).lean();

      const approved = sub.items.filter((i) => i.status === 'APPROVED').length;
      const rejected = sub.items.filter((i) => i.status === 'REJECTED').length;
      const pending = sub.items.filter((i) => i.status === 'PENDING').length;

      const itemDetails = (sub.items || [])
        .map((item) =>
          `${item.platform} ${item.activity_type}: ${item.status}${item.points ? ` (+${item.points})` : ''} — ${item.url}${item.rejection_reason ? ` [${item.rejection_reason}]` : ''}`
        )
        .join(' | ');

      rows.push([
        idx + 1,
        profile?.full_name || sub.member_id?.first_name || 'Unknown',
        profile?.xiaomi_id || 'N/A',
        sub.member_id?.telegram_username ? '@' + sub.member_id.telegram_username.replace('@', '') : '',
        sub.status,
        sub.points_awarded || 0,
        approved,
        rejected,
        pending,
        sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
        itemDetails,
      ]);
    }

    const { generateExport } = require('../services/exportHelper.service');

    const { buffer, contentType, extension } = await generateExport(format, {
      title: `Special Activity — ${activity.title}`,
      headers,
      rows,
      sheetName: 'Submissions',
    });

    const safeTitle = activity.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `xfc-special-${safeTitle}-${Date.now()}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('exportActivitySubmissions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════
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

  // ✅ PHASE 2
  getActivityLeaderboard,
  getActivityAnalytics,
  exportActivitySubmissions,
};