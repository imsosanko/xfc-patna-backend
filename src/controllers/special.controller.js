const SpecialActivity = require('../models/SpecialActivity');
const SpecialSubmission = require('../models/SpecialSubmission');
const MonthlyScore = require('../models/MonthlyScore');
const MemberProfile = require('../models/MemberProfile');
const User = require('../models/User');
const Meetup = require('../models/Meetup');
const AuditLog = require('../models/AuditLog');
const notificationService = require('../services/notification.service');
const { normalizeUrl, getUrlHash, detectPlatform, isValidUrl } = require('../services/url.service');
const { formatDateIST } = require('../services/points.service');

// ═══════════════════════════════════════════
// HELPER: Calculate points per item
// ═══════════════════════════════════════════
const calcItemPoints = (activity, totalItems) => {
  if (!totalItems || totalItems === 0) return 0;
  
  // ✅ FIX: Distribute points evenly based on total submitted items (so total doesn't exceed special_points)
  return Math.round((activity.special_points / totalItems) * 100) / 100;
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
// HELPER: Check compliance with min total links
// ═══════════════════════════════════════════
const checkCompliance = (activity, submission) => {
  const requiredCount = activity.min_total_links || 1;
  const approvedCount = submission.items.filter((i) => i.status === 'APPROVED').length;

  if (approvedCount < requiredCount) {
    return {
      compliant: false,
      missing: [
        {
          platform: 'Any',
          activity_type: 'Any',
          required: requiredCount,
          approved: approvedCount,
          short_by: requiredCount - approvedCount,
        }
      ],
    };
  }

  return { compliant: true, missing: [] };
};

// ═══════════════════════════════════════════
// HELPER: Rollback leaderboard points for a submission
// ═══════════════════════════════════════════
const rollbackLeaderboardPoints = async (submission, activity, points) => {
  if (!activity || !activity.count_toward_leaderboard || points <= 0) return;
  const month = formatDateIST().substring(0, 7);
  await MonthlyScore.findOneAndUpdate(
    { member_id: submission.member_id, month },
    { $inc: { special_points: -points, total_points: -points } }
  );
};

// ═══════════════════════════════════════════
// ADMIN: CREATE SPECIAL ACTIVITY
// ═══════════════════════════════════════════
const createSpecialActivity = async (req, res) => {
  try {
    const {
      title, description, banner_url, start_date, end_date, instructions,
      special_points, min_total_links, approval_required, member_editing_allowed,
      count_toward_leaderboard, activity_type, linked_meetup_id,
    } = req.body;

    if (!title || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'Title, start date, and end date are required' });
    }

    const validTypes = ['NORMAL', 'MEETUP_LAUNCH_LINKED', 'MEETUP_LAUNCH_LABEL'];
    const finalType = validTypes.includes(activity_type) ? activity_type : 'NORMAL';

    let finalMeetupId = null;
    if (finalType === 'MEETUP_LAUNCH_LINKED') {
      if (!linked_meetup_id) return res.status(400).json({ success: false, error: 'Meetup must be selected for linked launch' });
      const meetupExists = await Meetup.findById(linked_meetup_id);
      if (!meetupExists) return res.status(404).json({ success: false, error: 'Selected meetup not found' });
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
      min_total_links: parseInt(min_total_links) || 1, // ✅ NEW
      approval_required: approval_required !== false,
      member_editing_allowed: member_editing_allowed === true,
      count_toward_leaderboard: count_toward_leaderboard !== false,
      activity_type: finalType,
      linked_meetup_id: finalMeetupId,
      requirements: [], // ✅ Requirements ab khali rahenge
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

// ... [listSpecialActivities, getSpecialActivity, updateSpecialActivity, updateSpecialStatus, deleteSpecialActivity SAME RAHENGE] ...
// (Main unko same rakh raha hoon, tum apna purana code hi rakhna unke liye)

const listSpecialActivities = async (req, res) => { /* ... */ };
const getSpecialActivity = async (req, res) => { /* ... */ };
const updateSpecialActivity = async (req, res) => { /* ... */ };
const updateSpecialStatus = async (req, res) => { /* ... */ };
const deleteSpecialActivity = async (req, res) => { /* ... */ };

// ═══════════════════════════════════════════
// ADMIN: VERIFY SUBMISSION ITEM
// ═══════════════════════════════════════════
const verifySubmissionItem = async (req, res) => {
  try {
    const { submissionId, itemIndex } = req.params;
    const { status, reason } = req.body;

    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

    const submission = await SpecialSubmission.findById(submissionId);
    if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });

    const activity = await SpecialActivity.findById(submission.special_activity_id);
    if (!activity) return res.status(404).json({ success: false, error: 'Special activity not found' });

    const itemIdx = parseInt(itemIndex);
    if (itemIdx < 0 || itemIdx >= submission.items.length) return res.status(400).json({ success: false, error: 'Invalid item index' });

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
      item.points = calcItemPoints(activity, submission.items.length); // Update calc logic
    } else {
      item.rejection_reason = '';
      item.points = 0;
    }

    submission.status = recalcSubmissionStatus(submission);
    const totalPoints = submission.items.filter((i) => i.status === 'APPROVED').reduce((sum, i) => sum + (i.points || 0), 0);
    const previousPoints = submission.points_awarded || 0;
    const pointsDelta = totalPoints - previousPoints;
    submission.points_awarded = totalPoints;

    if (pointsDelta !== 0 && activity.count_toward_leaderboard) {
      const month = formatDateIST().substring(0, 7);
      await MonthlyScore.findOneAndUpdate(
        { member_id: submission.member_id, month },
        { $inc: { special_points: pointsDelta, total_points: pointsDelta }, $setOnInsert: { member_id: submission.member_id, month } },
        { upsert: true }
      );
    }

    await submission.save();
    const compliance = checkCompliance(activity, submission);

    try {
      const member = await User.findById(submission.member_id);
      if (member && member.telegram_id) {
        // ... Notification logic same rahega
      }
    } catch (notifErr) {}

    await AuditLog.create({ /* ... */ });
    res.json({ success: true, submission, points_delta: pointsDelta, compliance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const bulkVerifyItems = async (req, res) => { /* ... Purana waisa hi rahega ... */ };

// ═══════════════════════════════════════════
// ADMIN: EDIT MEMBER SUBMISSION
// ═══════════════════════════════════════════
const editMemberSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { items, note } = req.body;

    const submission = await SpecialSubmission.findById(submissionId);
    if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });

    const activity = await SpecialActivity.findById(submission.special_activity_id);

    const previous = {
      items: submission.items.map((i) => ({ url: i.url, status: i.status })),
      points_awarded: submission.points_awarded || 0,
      is_locked: submission.is_locked,
    };

    if (Array.isArray(items)) {
      if (items.length === 0) {
        const previousPoints = submission.points_awarded || 0;
        submission.items = [];
        submission.status = 'NOT_STARTED';
        submission.points_awarded = 0;
        submission.is_locked = false;
        submission.locked_at = null;
        submission.submitted_at = null;
        await rollbackLeaderboardPoints(submission, activity, previousPoints);
      } else {
        submission.items = items.map((item) => ({
          platform: item.platform || 'Unknown',
          activity_type: item.activity_type || 'Post',
          topic: item.topic || '', // ✅ NEW
          post_date: item.post_date || '', // ✅ NEW
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
        submission.status = recalcSubmissionStatus(submission);
      }
    } else {
      submission.status = recalcSubmissionStatus(submission);
    }

    submission.last_edited_by = req.admin._id;
    submission.last_edited_at = new Date();
    submission.edit_history.push({ edited_by: req.admin._id, edited_at: new Date(), changes: { items }, note: note || '' });

    await submission.save();
    await AuditLog.create({ /* ... */ });
    res.json({ success: true, submission });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MEMBER: GET ACTIVE SPECIAL ACTIVITIES
// ═══════════════════════════════════════════
const getMemberSpecialActivities = async (req, res) => {
  // ... Purana waisa hi rahega ...
};

// ═══════════════════════════════════════════
// MEMBER: SUBMIT TO SPECIAL ACTIVITY
// ═══════════════════════════════════════════
const submitSpecialActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items to submit' });
    }

    const activity = await SpecialActivity.findById(id);
    if (!activity) return res.status(404).json({ success: false, error: 'Special activity not found' });

    if (activity.status !== 'OPEN') {
      return res.status(400).json({ success: false, error: 'Special activity is not open for submission' });
    }

    const now = new Date();
    if (now < activity.start_date) return res.status(400).json({ success: false, error: 'Submission has not started yet' });
    if (now > activity.end_date) return res.status(400).json({ success: false, error: 'Submission deadline has passed' });

    // ✅ Validate minimum total links
    if (items.length < activity.min_total_links) {
      return res.status(400).json({ 
        success: false, 
        error: `Minimum ${activity.min_total_links} links required. You submitted ${items.length}.` 
      });
    }

    let submission = await SpecialSubmission.findOne({ special_activity_id: id, member_id: req.user._id });

    const existingHasItems = submission && Array.isArray(submission.items) && submission.items.length > 0;
    if (submission && submission.is_locked && existingHasItems) {
      return res.status(403).json({ success: false, error: 'Your submission is locked. Contact admin to make changes.' });
    }

    const processedItems = [];
    const itemHashes = [];

    for (const item of items) {
      if (!item.url || !isValidUrl(item.url)) {
        return res.status(400).json({ success: false, error: `Invalid URL: ${item.url}` });
      }

      const platform = item.platform || detectPlatform(item.url);
      const normalizedUrl = normalizeUrl(item.url);
      const urlHash = getUrlHash(item.url);

      processedItems.push({
        platform,
        activity_type: item.activity_type || 'Post',
        topic: item.topic || '',           // ✅ NEW
        post_date: item.post_date || '',   // ✅ NEW
        url: item.url,
        normalized_url: normalizedUrl,
        url_hash: urlHash,
        status: 'PENDING',
        submitted_at: new Date(),
      });

      itemHashes.push(urlHash);
    }

    // Duplicate check
    const excludeSubmissionId = submission?._id;
    const duplicateQuery = { 'items.url_hash': { $in: itemHashes } };
    if (excludeSubmissionId) duplicateQuery._id = { $ne: excludeSubmissionId };

    const duplicateSubmission = await SpecialSubmission.findOne(duplicateQuery).populate('special_activity_id', 'title').lean();
    if (duplicateSubmission) {
      return res.status(409).json({ success: false, error: `Duplicate link detected.` });
    }

    // Internal duplicate
    const hashSet = new Set();
    for (const hash of itemHashes) {
      if (hashSet.has(hash)) return res.status(400).json({ success: false, error: 'Same URL submitted twice' });
      hashSet.add(hash);
    }

    let isNewSubmission = false;
    if (submission) {
      submission.items = processedItems;
      submission.status = 'SUBMITTED';
      submission.submitted_at = new Date();
      if (!activity.member_editing_allowed) {
        submission.is_locked = true;
        submission.locked_at = new Date();
      } else {
        submission.is_locked = false;
        submission.locked_at = null;
      }
    } else {
      isNewSubmission = true;
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

    if (isNewSubmission) {
      await SpecialActivity.findByIdAndUpdate(id, { $inc: { total_submissions: 1 } });
    }

    const compliance = checkCompliance(activity, submission);
    res.json({ success: true, submission, compliance });

  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, error: 'Submission already exists' });
    res.status(500).json({ success: false, error: error.message });
  }
};

// ... [getActivityLeaderboard, getActivityAnalytics, exportActivitySubmissions SAME RAHENGE] ...

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
  getActivityLeaderboard,
  getActivityAnalytics,
  exportActivitySubmissions,
};