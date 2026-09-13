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
 * Example: 30-day month → 3.333333...
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
 * ⚠️ UTC use nahi karna — server ka local time bhi galat ho sakta hai
 */
const formatDateIST = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);   // Returns: "2026-09-13"
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

module.exports = {
  getDaysInMonth,
  calculateDailyPoints,
  calculateMonthlyPoints,
  formatDateIST,
  getYesterdayIST,
  getCurrentMonth,
};