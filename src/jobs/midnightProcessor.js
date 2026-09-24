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
// HELPER: Round to 2 decimals
// ═══════════════════════════════════════════
const round2 = (n) => Math.round(n * 100) / 100;

// ═══════════════════════════════════════════
// HELPER: Daily points based on post count
// 1 post   → 1 pt
// 2 posts  → 2 pts
// 3+ posts → 3.33 pts (max cap per day)
// ═══════════════════════════════════════════
const calculateDailyPoints = (postCount) => {
  if (!postCount || postCount <= 0) return 0;
  if (postCount === 1) return 1;
  if (postCount === 2) return 2;
  return 3.33;
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
      return {
        success: true,
        skipped: true,
        message: 'Already processed',
      };
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
    });

    console.log(`📊 Approved activities found: ${activities.length}`);

    if (activities.length === 0) {
      console.log(`ℹ️  No approved activities for ${dateStr}. Skipping.`);
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

      // Daily Summary update
      await DailySummary.findOneAndUpdate(
        { member_id: data.member_id, date: dateStr },
        {
          $set: {
            approved: approvedCount,
            platform_counts: data.platforms,
            day_completed: true,
            processing_status: 'PROCESSED',
            daily_points: calculateDailyPoints(approvedCount),
          },
          $setOnInsert: {
            month: monthStr,
          },
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
      // Calculate regular_points from daily post counts
      // Rule: 1 post = 1pt | 2 posts = 2pts | 3+ posts = 3.33pts (daily cap)
      // ═══════════════════════════════════════════
      const monthActivities = await Activity.find({
        member_id: data.member_id,
        month: monthStr,
        status: 'APPROVED',
      })
        .select('date')
        .lean();

      // Group by date
      const dateCountMap = {};
      monthActivities.forEach((a) => {
        dateCountMap[a.date] = (dateCountMap[a.date] || 0) + 1;
      });

      // Sum daily points
      let regularPoints = 0;
      Object.values(dateCountMap).forEach((count) => {
        regularPoints += calculateDailyPoints(count);
      });
      regularPoints = round2(regularPoints);

      // ═══════════════════════════════════════════
      // BONUS LOGIC
      // ═══════════════════════════════════════════
      // Agar member ne poora month (har din) kam se kam 1 post kiya
      // toh total 100 points guarantee karo
      // Warna sirf earned points
      const totalActiveDates = Object.keys(dateCountMap).length;
      let bonusPoints = 0;

      if (totalActiveDates === totalDaysInMonth) {
        // Full month active → 100 points guaranteed
        bonusPoints = round2(100 - regularPoints);
        if (bonusPoints < 0) bonusPoints = 0; // safety
      }

      // Cap regular + bonus at 100 (31-day month mein 103.23 → 100)
      let totalRegularWithBonus = round2(regularPoints + bonusPoints);
      if (totalRegularWithBonus > 100) {
        totalRegularWithBonus = 100;
      }

      monthlyScore.regular_points = totalRegularWithBonus;
      // Bonus ko alag store karo (audit ke liye)
      monthlyScore.bonus_points = bonusPoints;

      // Total = regular (with bonus) + special + meetup + manual
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
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('\n🕛 MIDNIGHT CRON JOB TRIGGERED');
      console.log(`📅 Time: ${new Date().toISOString()}`);
      console.log(
        `🇮🇳 IST Time: ${new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
        })}`
      );

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