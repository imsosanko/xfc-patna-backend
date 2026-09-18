const cron = require('node-cron');
const Activity = require('../models/Activity');
const DailySummary = require('../models/DailySummary');
const MonthlyScore = require('../models/MonthlyScore');
const SystemSetting = require('../models/SystemSetting');
const {
  formatDateIST,
  getYesterdayIST,
  getDaysInMonthFromString,
  calculateMonthlyPoints,
  calculateStreak,
} = require('../services/points.service');

/**
 * ═══════════════════════════════════════════════════════════
 * DAILY PROCESSING LOGIC
 * ═══════════════════════════════════════════════════════════
 * Ye function given date ka data process karta hai:
 * 1. Duplicate check karta hai (idempotency)
 * 2. Sab approved activities fetch karta hai
 * 3. Daily summary banata hai
 * 4. Monthly score update karta hai
 * 5. Streak update karta hai
 * 6. Leaderboard rank update karta hai
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
      return {
        success: true,
        skipped: true,
        message: 'Already processed',
      };
    }

    const monthStr = dateStr.substring(0, 7); // YYYY-MM
    const totalDaysInMonth = getDaysInMonthFromString(monthStr);

    console.log(`📅 Month: ${monthStr} | Days in month: ${totalDaysInMonth}`);

    // ═══════════════════════════════════════════
    // STEP 2: Sab approved activities fetch karo
    // ═══════════════════════════════════════════
    const activities = await Activity.find({
      date: dateStr,
      status: 'APPROVED',
    });

    console.log(`📊 Approved activities found: ${activities.length}`);

    if (activities.length === 0) {
      console.log(`ℹ️  No approved activities for ${dateStr}. Skipping.`);
      // Lock set karo taaki dobara process na ho
      await SystemSetting.create({ key: lockKey, value: true });
      return {
        success: true,
        processed: 0,
        message: 'No approved activities',
      };
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

    for (const [memberId, data] of memberMap.entries()) {
      const approvedCount = data.activities.length;

      // Daily Summary update karo
      await DailySummary.findOneAndUpdate(
        { member_id: data.member_id, date: dateStr },
        {
          $set: {
            approved: approvedCount,
            platform_counts: data.platforms,
            day_completed: true,
            processing_status: 'PROCESSED',
          },
          $setOnInsert: {
            month: monthStr,
          },
        },
        { upsert: true }
      );

      // Monthly Score update karo
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

      // Verified activities count update karo
      const monthActivitiesCount = await Activity.countDocuments({
        member_id: data.member_id,
        month: monthStr,
        status: 'APPROVED',
      });
      monthlyScore.verified_activities = monthActivitiesCount;

      // Active days count karo (unique dates with approved activities)
      const activeDates = await Activity.distinct('date', {
        member_id: data.member_id,
        month: monthStr,
        status: 'APPROVED',
      });
      monthlyScore.active_days = activeDates.length;

      // Points calculate karo
      const { points, percentage } = calculateMonthlyPoints(
        activeDates.length,
        totalDaysInMonth
      );
      monthlyScore.regular_points = points;
      monthlyScore.total_points = points + (monthlyScore.special_points || 0);
      monthlyScore.percentage = percentage;

      // Streak calculate karo
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

      // Last activity timestamp
      monthlyScore.last_activity_at = data.activities[data.activities.length - 1].submitted_at;

      await monthlyScore.save();
      processedCount++;
    }

    // ═══════════════════════════════════════════
    // STEP 5: Idempotency lock set karo
    // ═══════════════════════════════════════════
    await SystemSetting.create({
      key: lockKey,
      value: {
        processed_at: new Date(),
        members_processed: processedCount,
        activities_processed: activities.length,
      },
    });

    console.log(`✅ Processed ${processedCount} members`);
    console.log(`✅ Processed ${activities.length} activities`);
    console.log('═══════════════════════════════════════════\n');

    return {
      success: true,
      processed: processedCount,
      activities: activities.length,
      message: 'Day processed successfully',
    };
  } catch (error) {
    console.error(`❌ Processing error for ${dateStr}:`, error.message);
    console.error(error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * ═══════════════════════════════════════════════════════════
 * CRON JOB — Runs at 12:00 AM IST Daily
 * ═══════════════════════════════════════════════════════════
 */
const startMidnightJob = () => {
  // Cron expression: '0 0 * * *' = Every day at 12:00 AM
  // timezone: 'Asia/Kolkata'
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('\n🕛 MIDNIGHT CRON JOB TRIGGERED');
      console.log(`📅 Time: ${new Date().toISOString()}`);
      console.log(`🇮🇳 IST Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

      const yesterday = getYesterdayIST();
      await processDay(yesterday);
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  console.log('✅ Midnight cron job scheduled (12:00 AM Asia/Kolkata)');
};

module.exports = { startMidnightJob, processDay };