const SpecialActivity = require('../models/SpecialActivity');
const SpecialSubmission = require('../models/SpecialSubmission');
const MonthlyScore = require('../models/MonthlyScore');
const MemberProfile = require('../models/MemberProfile');
const {
  normalizeUrl,
  getUrlHash,
  detectPlatform,
  isValidUrl,
} = require('../services/url.service');
const { formatDateIST } = require('../services/points.service');

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
        const submissionCount = await SpecialSubmission.countDocuments({
          special_activity_id: act._id,
        });
        const approvedCount = await SpecialSubmission.countDocuments({
          special_activity_id: act._id,
          status: 'APPROVED',
        });
        return {
          ...act.toObject(),
          submissionCount,
          approvedCount,
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
      .populate('created_by', 'name email');

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Special activity not found',
      });
    }

    const submissions = await SpecialSubmission.find({
      special_activity_id: id,
    }).populate('member_id', 'first_name last_name telegram_username');

    const enrichedSubmissions = await Promise.all(
      submissions.map(async (sub) => {
        const profile = await MemberProfile.findOne({ user_id: sub.member_id });
        return {
          ...sub.toObject(),
          member_name: profile?.full_name || sub.member_id?.first_name || 'Unknown',
          xiaomi_id: profile?.xiaomi_id || 'N/A',
          telegram_username: sub.member_id?.telegram_username || '',
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

    activity.status = status;
    await activity.save();

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

    if (activity.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        error: 'Only draft activities can be deleted',
      });
    }

    await SpecialSubmission.deleteMany({ special_activity_id: id });
    await SpecialActivity.findByIdAndDelete(id);

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

    if (!['APPROVED', 'REJECTED'].includes(status)) {
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

    const itemIdx = parseInt(itemIndex);
    if (itemIdx < 0 || itemIdx >= submission.items.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid item index',
      });
    }

    submission.items[itemIdx].status = status;
    if (status === 'REJECTED') {
      submission.items[itemIdx].rejection_reason = reason || 'Rejected';
    }

    const allApproved = submission.items.every((i) => i.status === 'APPROVED');
    const anyApproved = submission.items.some((i) => i.status === 'APPROVED');
    const anyRejected = submission.items.some((i) => i.status === 'REJECTED');

    if (allApproved) {
      submission.status = 'APPROVED';

      const activity = await SpecialActivity.findById(submission.special_activity_id);
      if (activity && activity.count_toward_leaderboard) {
        submission.points_awarded = activity.special_points;

        const month = formatDateIST().substring(0, 7);
        await MonthlyScore.findOneAndUpdate(
          { member_id: submission.member_id, month },
          {
            $inc: {
              special_points: activity.special_points,
              total_points: activity.special_points,
            },
          },
          { upsert: true }
        );
      }
    } else if (anyRejected && !anyApproved) {
      submission.status = 'REJECTED';
    } else if (anyApproved) {
      submission.status = 'PARTIALLY_APPROVED';
    } else {
      submission.status = 'UNDER_REVIEW';
    }

    await submission.save();

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
      });
    }

    let submission = await SpecialSubmission.findOne({
      special_activity_id: id,
      member_id: req.user._id,
    });

    if (submission) {
      if (!activity.member_editing_allowed) {
        return res.status(400).json({
          success: false,
          error: 'Editing not allowed for this activity',
        });
      }
      submission.items = processedItems;
      submission.status = 'SUBMITTED';
    } else {
      submission = new SpecialSubmission({
        special_activity_id: id,
        member_id: req.user._id,
        items: processedItems,
        status: 'SUBMITTED',
      });
    }

    await submission.save();

    res.json({ success: true, submission });
  } catch (error) {
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
  getMemberSpecialActivities,
  submitSpecialActivity,
};