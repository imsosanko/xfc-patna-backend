const { MONTHLY_TARGET } = require('../utils/constants');

/**
 * Given month mein kitne din hain (28/29/30/31)
 */
const getDaysInMonth = (year, month) => {
  // month: 1-12
  return new Date(year, month, 0).getDate();
};

/**
 * Ek din ke kitne points milte hain
 * 100 / total_days_in_month
 */
const calculateDailyPoints = (totalDaysInMonth) => {
  return MONTHLY_TARGET / totalDaysInMonth;
};

/**
 * Monthly points calculate karo based on active days
 * High precision rakho, display pe round karo
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
 * Date ko IST (Asia/Kolkata) mein YYYY-MM-DD format mein return karta hai
 */
const formatDateIST = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
};

/**
 * Kal ki date IST mein (midnight processing ke liye)
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
 * Given month (YYYY-MM) ke total days count karo
 */
const getDaysInMonthFromString = (monthStr) => {
  const [year, month] = monthStr.split('-').map(Number);
  return getDaysInMonth(year, month);
};

/**
 * Streak calculate karo — consecutive days with approved activities
 * @param {Array} dates - Array of "YYYY-MM-DD" strings (sorted desc)
 * @returns {Object} - { current, longest }
 */
const calculateStreak = (dates) => {
  if (!dates || dates.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Unique dates nikalo, descending order mein
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

  // Current streak check — aaj ya kal se start hona chahiye
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
    current = 0; // Streak broken
  }

  return { current, longest };
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
};