const crypto = require('crypto');
const Activity = require('../models/Activity');
const DailySummary = require('../models/DailySummary');
const MemberProfile = require('../models/MemberProfile');
const {
  getUrlHash,
  normalizeUrl,
  detectPlatform,
  isValidUrl
} = require('../services/url.service');
const { formatDateIST } = require('../services/points.service');
const { shouldAutoVerify } = require('../services/autoVerify.service');
const notificationService = require('../services/notification.service');

/**
 * POST /api/activities
 * Single activity submit karo
 */
const submitActivity = async (req, res) => {
  try {
    const { url, activity_type, platform } = req.body;

    // Profile complete check
    const profile = await MemberProfile.findOne({ user_id: req.user._id });
    if (!profile) {
      return res.status(403).json({
        success: false,
        error: 'Please complete your profile first'
      });
    }

    // URL validation
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL'
      });
    }

    const urlHash = getUrlHash(url);
    const normalizedUrl = normalizeUrl(url);
    const detectedPlatform = platform || detectPlatform(url);

    // Duplicate check
    const existing = await Activity.findOne({
      member_id: req.user._id,
      url_hash: urlHash,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: '⚠️ This activity link has already been submitted.',
      });
    }

    // ═══════════════════════════════════════════
    // AUTO-VERIFY CHECK
    // ═══════════════════════════════════════════
    const verifyResult = await shouldAutoVerify(detectedPlatform, url);
    const isAutoApproved = verifyResult.auto === true;

    const dateStr = formatDateIST();
    const monthStr = dateStr.substring(0, 7);

    // Activity create karo
    const activity = await Activity.create({
      activity_id: crypto.randomUUID(),
      member_id: req.user._id,
      date: dateStr,
      month: monthStr,
      platform: detectedPlatform,
      activity_type: activity_type || `${detectedPlatform} Post`,
      url,
      normalized_url: normalizedUrl,
      url_hash: urlHash,
      status: isAutoApproved ? 'APPROVED' : 'PENDING',
      verified_at: isAutoApproved ? new Date() : undefined,
      auto_verified: isAutoApproved,
      verified_by_system: isAutoApproved,
      auto_verify_reason: verifyResult.reason || '',
    });

    // ═══════════════════════════════════════════
    // DAILY SUMMARY UPDATE
    // ═══════════════════════════════════════════
    const dailyUpdate = {
      $inc: {
        total_submitted: 1,
      },
      $setOnInsert: { month: monthStr },
    };

    if (isAutoApproved) {
      dailyUpdate.$inc.approved = 1;
    }

    await DailySummary.findOneAndUpdate(
      { member_id: req.user._id, date: dateStr },
      dailyUpdate,
      { upsert: true }
    );

    // ═══════════════════════════════════════════
    // AUTO-APPROVE NOTIFICATION (fire & forget)
    // ═══════════════════════════════════════════
    if (isAutoApproved && req.user.telegram_id) {
      try {
        notificationService.sendNotification({
          memberId: req.user._id,
          telegramId: req.user.telegram_id,
          type: 'ACTIVITY_APPROVED',
          title: '🎉 Activity Auto-Approved!',
          message: `Your ${detectedPlatform} activity has been auto-approved.\n\nPoints will be added at midnight.\n\n${url}`,
          data: {
            activity_id: activity.activity_id,
            platform: detectedPlatform,
            auto_verified: true,
          },
          adminId: null,
        });
      } catch (notifErr) {
        console.error('Auto-approve notification failed:', notifErr.message);
      }
    }

    res.json({
      success: true,
      activity,
      auto_approved: isAutoApproved,
      auto_verify_reason: verifyResult.reason || '',
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: '⚠️ This activity link has already been submitted.',
      });
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/activities/bulk
 * Multiple activities ek saath submit karo
 */
const submitBulk = async (req, res) => {
  try {
    const { activities } = req.body;

    // Profile check
    const profile = await MemberProfile.findOne({ user_id: req.user._id });
    if (!profile) {
      return res.status(403).json({
        success: false,
        error: 'Please complete your profile first'
      });
    }

    if (!Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No activities provided'
      });
    }

    if (activities.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 links allowed per request'
      });
    }

    const results = {
      submitted: 0,
      duplicates: 0,
      invalid: 0,
      auto_approved: 0,
      pending: 0,
      errors: [],
      submittedActivities: [],
    };

    const dateStr = formatDateIST();
    const monthStr = dateStr.substring(0, 7);

    for (const item of activities) {
      if (!item.url || !isValidUrl(item.url)) {
        results.invalid++;
        continue;
      }

      const urlHash = getUrlHash(item.url);
      const normalizedUrl = normalizeUrl(item.url);
      const detectedPlatform = detectPlatform(item.url);

      const exists = await Activity.findOne({
        member_id: req.user._id,
        url_hash: urlHash
      });

      if (exists) {
        results.duplicates++;
        continue;
      }

      try {
        const verifyResult = await shouldAutoVerify(detectedPlatform, item.url);
        const isAutoApproved = verifyResult.auto === true;

        const created = await Activity.create({
          activity_id: crypto.randomUUID(),
          member_id: req.user._id,
          date: dateStr,
          month: monthStr,
          platform: detectedPlatform,
          activity_type: item.activity_type || `${detectedPlatform} Post`,
          url: item.url,
          normalized_url: normalizedUrl,
          url_hash: urlHash,
          status: isAutoApproved ? 'APPROVED' : 'PENDING',
          verified_at: isAutoApproved ? new Date() : undefined,
          auto_verified: isAutoApproved,
          verified_by_system: isAutoApproved,
          auto_verify_reason: verifyResult.reason || '',
        });

        results.submitted++;
        if (isAutoApproved) {
          results.auto_approved++;
        } else {
          results.pending++;
        }

        results.submittedActivities.push({
          id: created.activity_id,
          url: created.url,
          platform: created.platform,
          auto_approved: isAutoApproved,
          reason: verifyResult.reason || '',
        });
      } catch (e) {
        if (e.code === 11000) {
          results.duplicates++;
        } else {
          results.errors.push({
            url: item.url,
            error: e.message
          });
        }
      }
    }

    // ═══════════════════════════════════════════
    // DAILY SUMMARY UPDATE (bulk)
    // ═══════════════════════════════════════════
    if (results.submitted > 0) {
      const dailyUpdate = {
        $inc: {
          total_submitted: results.submitted,
        },
        $setOnInsert: { month: monthStr },
      };

      if (results.auto_approved > 0) {
        dailyUpdate.$inc.approved = results.auto_approved;
      }

      await DailySummary.findOneAndUpdate(
        { member_id: req.user._id, date: dateStr },
        dailyUpdate,
        { upsert: true }
      );
    }

    // ═══════════════════════════════════════════
    // BULK AUTO-APPROVE NOTIFICATION
    // ═══════════════════════════════════════════
    if (results.auto_approved > 0 && req.user.telegram_id) {
      try {
        let message = `🎉 ${results.auto_approved} ${results.auto_approved === 1 ? 'activity' : 'activities'} auto-approved!\n\nPoints will be added at midnight.`;
        if (results.pending > 0) {
          message += `\n\n⚠️ ${results.pending} ${results.pending === 1 ? 'activity' : 'activities'} pending manual review.`;
        }

        notificationService.sendNotification({
          memberId: req.user._id,
          telegramId: req.user.telegram_id,
          type: 'ACTIVITY_APPROVED',
          title: `🎉 ${results.auto_approved} ${results.auto_approved === 1 ? 'Activity' : 'Activities'} Auto-Approved!`,
          message,
          data: {
            auto_approved_count: results.auto_approved,
            pending_count: results.pending,
          },
          adminId: null,
        });
      } catch (notifErr) {
        console.error('Bulk auto-approve notification failed:', notifErr.message);
      }
    }

    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * GET /api/activities
 * Member ki apni activities
 */
const getMyActivities = async (req, res) => {
  try {
    const { date, month, status, limit = 50, page = 1 } = req.query;

    const filter = { member_id: req.user._id };
    if (date) filter.date = date;
    if (month) filter.month = month;
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [activities, total] = await Promise.all([
      Activity.find(filter)
        .sort({ submitted_at: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      Activity.countDocuments(filter),
    ]);

    res.json({
      success: true,
      count: activities.length,
      total,
      page: parseInt(page),
      activities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  submitActivity,
  submitBulk,
  getMyActivities
};