const cron = require('node-cron');
const Activity = require('../models/Activity');
const DailySummary = require('../models/DailySummary');
const MonthlyScore = require('../models/MonthlyScore');
const SystemSetting = require('../models/SystemSetting');
const {
  formatDateIST,
  getYesterdayIST,
  getDaysInMonthFromString,
  calculateStreak,
} = require('../services/points.service');

// ═══════════════════════════════════════════
// Round to 2 decimals
// ═══════════════════════════════════════════
const round2 = (n) => Math.round(n * 100) / 100;

// ═══════════════════════════════════════════
// ✅ NEW: Analyze activities by platform
// ═══════════════════════════════════════════
const analyzeByPlatform = (activities) => {
  const counts = { X: 0, Instagram: 0, Facebook: 0, Other: 0 };

  activities.forEach((act) => {
    const p = (act.platform || '').trim();
    if (p === 'X' || p === 'Twitter') counts.X++;
    else if (p === 'Instagram') counts.Instagram++;
    else if (p === 'Facebook') counts.Facebook++;
    else counts.Other++;
  });

  return counts;
};

// ═══════════════════════════════════════════
// ✅ NEW: Calculate valid daily points
// Rule:
//   - Same old: 1 post = 1pt, 2 = 2pt, 3+ = 3.33pt
//   - NEW: Agar saare posts Instagram ke → 0 points
//          (min 1 non-Instagram post required — X ya Facebook)
// ═══════════════════════════════════════════
const calculateDailyPoints = (activities) => {
  const total = activities.length;

  if (total === 0) {
    return { points: 0, valid: false, reason: 'No activities', counts: null };
  }

  const counts = analyzeByPlatform(activities);

  // ❌ All Instagram → invalid
  if (counts.Instagram === total) {
    return {
      points: 0,
      valid: false,
      reason: 'All posts are Instagram — at least 1 non-Instagram required',
      counts,
    };
  }

  // ✅ Same old rule
  let points = 0;
  if (total === 1) points = 1;
  else if (total === 2) points = 2;
  else points = 3.33;

  return { points, valid: true, reason: '', counts };
};

/**
 * ═══════════════════════════════════════════════════════════
 * DAILY PROCESSING LOGIC
 * ═══════════════════════════════════════════════════════════
 */
const processDay = async (dateStr) => {
  console.log('\n═══════════════════════════════════════════');
  console.log(`🕐 Processing day: ${dateStr}`);
  console.log('═══════════════════════════════════════════');

  try {
    // ═══════════════════════════════════════════
    // STEP 1: Idempotency check
    // ═══════════════════════════════════════════
    const lockKey = `processed_${dateStr}`;
    const alreadyProcessed = await SystemSetting.findOne({ key: lockKey });

    if (alreadyProcessed) {
      console.log(`⚠️  Already processed: ${dateStr}`);
      console.log(`   Skipping to avoid duplicate points.\n`);
      return { success: true, skipped: true, message: 'Already processed' };
    }

    const monthStr = dateStr.substring(0, 7);
    const totalDaysInMonth = getDaysInMonthFromString(monthStr);

    console.log(`📅 Month: ${monthStr} | Days in month: ${totalDaysInMonth}`);

    // ═══════════════════════════════════════════
    // STEP 2: Sab approved activities fetch karo
    // ═══════════════════════════════════════════
    const activities = await Activity.find({
      date: dateStr,
      status: 'APPROVED',
    }).lean();

    console.log(`📊 Approved activities found: ${activities.length}`);

    if (activities.length === 0) {
      console.log(`ℹ️  No approved activities for ${dateStr}. Skipping.`);
      await SystemSetting.create({ key: lockKey, value: true });
      return { success: true, processed: 0, message: 'No approved activities' };
    }

    // ═══════════════════════════════════════════
    // STEP 3: Member-wise group karo
    // ═══════════════════════════════════════════
    const memberMap = new Map();

    activities.forEach((act) => {
      const memberId = act.member_id.toString();
      if (!memberMap.has(memberId)) {
        memberMap.set(memberId, {
          member_id: act.member_id,
          activities: [],
          platforms: {},
        });
      }
      const entry = memberMap.get(memberId);
      entry.activities.push(act);
      entry.platforms[act.platform] = (entry.platforms[act.platform] || 0) + 1;
    });

    console.log(`👥 Active members today: ${memberMap.size}`);

    // ═══════════════════════════════════════════
    // STEP 4: Har member ke liye process karo
    // ═══════════════════════════════════════════
    let processedCount = 0;
    let invalidDays = 0;

    for (const [memberId, data] of memberMap.entries()) {
      // ✅ NEW: Apply new rule
      const dayResult = calculateDailyPoints(data.activities);

      if (!dayResult.valid) {
        invalidDays++;
        console.log(
          `⚠️  Member ${memberId}: ${dayResult.reason} | counts:`,
          dayResult.counts
        );
      }

      // Daily Summary update
      await DailySummary.findOneAndUpdate(
        { member_id: data.member_id, date: dateStr },
        {
          $set: {
            approved: data.activities.length,
            platform_counts: data.platforms,
            day_completed: true,
            processing_status: 'PROCESSED',
            daily_points: dayResult.points,
          },
          $setOnInsert: { month: monthStr },
        },
        { upsert: true }
      );

      // Monthly Score fetch/create
      let monthlyScore = await MonthlyScore.findOne({
        member_id: data.member_id,
        month: monthStr,
      });

      if (!monthlyScore) {
        monthlyScore = new MonthlyScore({
          member_id: data.member_id,
          month: monthStr,
          verified_activities: 0,
          active_days: 0,
          first_activity_at: data.activities[0].submitted_at,
        });
      }

      // Verified activities count
      const monthActivitiesCount = await Activity.countDocuments({
        member_id: data.member_id,
        month: monthStr,
        status: 'APPROVED',
      });
      monthlyScore.verified_activities = monthActivitiesCount;

      // Active days
      const activeDates = await Activity.distinct('date', {
        member_id: data.member_id,
        month: monthStr,
        status: 'APPROVED',
      });
      monthlyScore.active_days = activeDates.length;

      // ═══════════════════════════════════════════
      // ✅ NEW: Calculate regular_points using new rule
      // ═══════════════════════════════════════════
      const monthActivities = await Activity.find({
        member_id: data.member_id,
        month: monthStr,
        status: 'APPROVED',
      }).lean();

      // Group by date
      const dateActivitiesMap = {};
      monthActivities.forEach((a) => {
        if (!dateActivitiesMap[a.date]) dateActivitiesMap[a.date] = [];
        dateActivitiesMap[a.date].push(a);
      });

      // Sum daily points (skip invalid Instagram-only days)
      let regularPoints = 0;
      let validDaysCount = 0;

      Object.values(dateActivitiesMap).forEach((dayActivities) => {
        const result = calculateDailyPoints(dayActivities);
        if (result.valid) {
          validDaysCount++;
          regularPoints += result.points;
        }
      });

      regularPoints = round2(regularPoints);

      // ═══════════════════════════════════════════
      // BONUS LOGIC — Full month valid days pe 100
      // ═══════════════════════════════════════════
      let bonusPoints = 0;

      if (validDaysCount === totalDaysInMonth) {
        bonusPoints = round2(100 - regularPoints);
        if (bonusPoints < 0) bonusPoints = 0;
      }

      let totalRegularWithBonus = round2(regularPoints + bonusPoints);
      if (totalRegularWithBonus > 100) totalRegularWithBonus = 100;

      monthlyScore.regular_points = totalRegularWithBonus;
      monthlyScore.bonus_points = bonusPoints;

      // Total
      const totalPoints = round2(
        totalRegularWithBonus +
          (monthlyScore.special_points || 0) +
          (monthlyScore.meetup_points || 0) +
          (monthlyScore.manual_adjustments || 0)
      );
      monthlyScore.total_points = totalPoints;
      monthlyScore.percentage = Math.min(100, round2(totalPoints));

      // Streak
      const allDates = await Activity.distinct('date', {
        member_id: data.member_id,
        status: 'APPROVED',
      });
      const { current, longest } = calculateStreak(allDates);
      monthlyScore.current_streak = current;
      monthlyScore.longest_streak = Math.max(
        longest,
        monthlyScore.longest_streak || 0
      );

      monthlyScore.last_activity_at =
        data.activities[data.activities.length - 1].submitted_at;

      await monthlyScore.save();
      processedCount++;
    }

    // ═══════════════════════════════════════════
    // STEP 5: Idempotency lock
    // ═══════════════════════════════════════════
    await SystemSetting.create({
      key: lockKey,
      value: {
        processed_at: new Date(),
        members_processed: processedCount,
        activities_processed: activities.length,
        invalid_days: invalidDays,
      },
    });

    console.log(`✅ Processed ${processedCount} members`);
    console.log(`✅ Processed ${activities.length} activities`);
    console.log(`⚠️  Invalid days (all Instagram): ${invalidDays}`);
    console.log('═══════════════════════════════════════════\n');

    return {
      success: true,
      processed: processedCount,
      activities: activities.length,
      invalid_days: invalidDays,
      message: 'Day processed successfully',
    };
  } catch (error) {
    console.error(`❌ Processing error for ${dateStr}:`, error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
};

/**
 * ═══════════════════════════════════════════════════════════
 * CRON JOB — Runs at 12:00 AM IST Daily
 * ═══════════════════════════════════════════════════════════
 */
const startMidnightJob = () => {
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('\n🕛 MIDNIGHT CRON JOB TRIGGERED');
      console.log(`🇮🇳 IST Time: ${new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      })}`);

      const yesterday = getYesterdayIST();
      await processDay(yesterday);
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('✅ Midnight cron job scheduled (12:00 AM Asia/Kolkata)');
};

module.exports = { startMidnightJob, processDay };