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
      status: 'PENDING',
    });

    // Daily summary update
    await DailySummary.findOneAndUpdate(
      { member_id: req.user._id, date: dateStr },
      {
        $inc: { total_submitted: 1 },
        $setOnInsert: { month: monthStr },
      },
      { upsert: true }
    );

    res.json({ 
      success: true, 
      activity 
    });
  } catch (error) {
    // Duplicate key error (race condition case)
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
 * Multiple activities ek saath submit karo (no fixed limit)
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

    // Max 100 links per request (abuse prevention)
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
      errors: [],
      submittedActivities: [],
    };

    const dateStr = formatDateIST();
    const monthStr = dateStr.substring(0, 7);

    for (const item of activities) {
      // URL validation
      if (!item.url || !isValidUrl(item.url)) {
        results.invalid++;
        continue;
      }

      const urlHash = getUrlHash(item.url);
      const normalizedUrl = normalizeUrl(item.url);
      const detectedPlatform = detectPlatform(item.url);

      // Duplicate check
      const exists = await Activity.findOne({ 
        member_id: req.user._id, 
        url_hash: urlHash 
      });
      
      if (exists) {
        results.duplicates++;
        continue;
      }

      try {
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
          status: 'PENDING',
        });
        
        results.submitted++;
        results.submittedActivities.push({
          id: created.activity_id,
          url: created.url,
          platform: created.platform,
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

    // Daily summary update
    if (results.submitted > 0) {
      await DailySummary.findOneAndUpdate(
        { member_id: req.user._id, date: dateStr },
        {
          $inc: { total_submitted: results.submitted },
          $setOnInsert: { month: monthStr },
        },
        { upsert: true }
      );
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
 * Member ki apni activities (date/month/status filter ke saath)
 */
const getMyActivities = async (req, res) => {
  try {
    const { date, month, status, limit = 50, page = 1 } = req.query;
    
    const filter = { member_id: req.user._id };
    if (date) filter.date = date;
    if (month) filter.month = month;
    if (status) filter.status = status; // ← NEW

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