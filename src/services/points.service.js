const { MONTHLY_TARGET } = require('../utils/constants');

// ═══════════════════════════════════════════
// STREAK MILESTONES
// ═══════════════════════════════════════════
const STREAK_MILESTONES = [
  { days: 7,   badge: 'WEEK_WARRIOR',       emoji: '🔥', title: 'Week Warrior',        description: '7-day streak' },
  { days: 14,  badge: 'FORTNIGHT_FIGHTER',  emoji: '⚡', title: 'Fortnight Fighter',   description: '14-day streak' },
  { days: 30,  badge: 'MONTHLY_MASTER',     emoji: '💎', title: 'Monthly Master',      description: '30-day streak' },
  { days: 60,  badge: 'BIMONTHLY_BOSS',     emoji: '👑', title: 'Bimonthly Boss',      description: '60-day streak' },
  { days: 90,  badge: 'QUARTERLY_KING',     emoji: '🏆', title: 'Quarterly King',      description: '90-day streak' },
  { days: 100, badge: 'CENTURY_CHAMPION',   emoji: '🌟', title: 'Century Champion',    description: '100-day streak' },
  { days: 180, badge: 'HALF_YEAR_HERO',     emoji: '🎖️', title: 'Half-Year Hero',      description: '180-day (6 month) streak' },
  { days: 365, badge: 'YEARLY_LEGEND',      emoji: '💫', title: 'Yearly Legend',       description: '365-day (1 year) streak' },
];

const MILESTONE_DAYS = STREAK_MILESTONES.map((m) => m.days);

/**
 * Given month mein kitne din hain (28/29/30/31)
 */
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

/**
 * Ek din ke kitne points milte hain
 */
const calculateDailyPoints = (totalDaysInMonth) => {
  return MONTHLY_TARGET / totalDaysInMonth;
};

/**
 * Monthly points calculate karo based on active days
 */
const calculateMonthlyPoints = (activeDays, totalDaysInMonth) => {
  const dailyPoints = calculateDailyPoints(totalDaysInMonth);
  const points = activeDays * dailyPoints;
  const percentage = (points / MONTHLY_TARGET) * 100;

  return {
    points: Math.round(points * 100) / 100,
    percentage: Math.round(percentage * 100) / 100,
  };
};

/**
 * Date ko IST mein YYYY-MM-DD format mein
 */
const formatDateIST = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
};

/**
 * Kal ki date IST mein
 */
const getYesterdayIST = () => {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return formatDateIST(now);
};

/**
 * Current month string (YYYY-MM)
 */
const getCurrentMonth = () => {
  return formatDateIST().substring(0, 7);
};

/**
 * Given month ke total days
 */
const getDaysInMonthFromString = (monthStr) => {
  const [year, month] = monthStr.split('-').map(Number);
  return getDaysInMonth(year, month);
};

/**
 * Streak calculate karo — consecutive days with approved activities
 */
const calculateStreak = (dates) => {
  if (!dates || dates.length === 0) {
    return { current: 0, longest: 0 };
  }

  const uniqueDates = [...new Set(dates)].sort().reverse();

  let current = 1;
  let longest = 1;
  let tempStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);

    const diffDays = Math.round((prev - curr) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
    } else {
      tempStreak = 1;
    }

    if (tempStreak > longest) longest = tempStreak;
  }

  const today = formatDateIST();
  const yesterday = getYesterdayIST();

  if (uniqueDates[0] === today || uniqueDates[0] === yesterday) {
    current = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prev = new Date(uniqueDates[i - 1]);
      const curr = new Date(uniqueDates[i]);
      const diffDays = Math.round((prev - curr) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        current++;
      } else {
        break;
      }
    }
  } else {
    current = 0;
  }

  return { current, longest };
};

// ═══════════════════════════════════════════
// STREAK MILESTONE HELPERS
// ═══════════════════════════════════════════

/**
 * Given streak count ke liye exact milestone (agar hai toh)
 */
const getStreakMilestone = (streakCount) => {
  return STREAK_MILESTONES.find((m) => m.days === streakCount) || null;
};

/**
 * Next milestone (streak ke aage)
 */
const getNextMilestone = (currentStreak) => {
  const next = STREAK_MILESTONES.find((m) => m.days > currentStreak);
  if (!next) return null;

  return {
    ...next,
    daysAway: next.days - currentStreak,
  };
};

/**
 * Last achieved milestone (streak ke peeche)
 */
const getLastMilestone = (currentStreak) => {
  const achieved = STREAK_MILESTONES.filter((m) => m.days <= currentStreak);
  if (achieved.length === 0) return null;
  return achieved[achieved.length - 1];
};

/**
 * Saare earned badges (longest streak ke hisaab se)
 */
const getEarnedMilestones = (longestStreak) => {
  return STREAK_MILESTONES.filter((m) => m.days <= longestStreak);
};

module.exports = {
  getDaysInMonth,
  calculateDailyPoints,
  calculateMonthlyPoints,
  formatDateIST,
  getYesterdayIST,
  getCurrentMonth,
  getDaysInMonthFromString,
  calculateStreak,
  // Milestones
  STREAK_MILESTONES,
  MILESTONE_DAYS,
  getStreakMilestone,
  getNextMilestone,
  getLastMilestone,
  getEarnedMilestones,
};