const crypto = require('crypto');

/**
 * Telegram WebApp initData ko verify karta hai
 * HMAC-SHA256 algorithm use karta hai
 * 
 * @param {string} initData - Frontend se aaya initData string
 * @returns {Object} - Verified Telegram user object
 * @throws {Error} - Agar verification fail ho
 */
const verifyTelegramInitData = (initData) => {
  if (!initData) {
    throw new Error('initData is required');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  
  if (!hash) {
    throw new Error('hash is missing in initData');
  }
  
  params.delete('hash');

  // Data check string banao — alphabetically sorted
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Secret key generate karo
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN)
    .digest();

  // Calculated hash banao
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Hash compare karo
  if (calculatedHash !== hash) {
    throw new Error('Invalid Telegram authentication');
  }

  // User data parse karo
  const userData = params.get('user');
  if (!userData) {
    throw new Error('User data missing');
  }
  
  const user = JSON.parse(userData);
  
  // Auth date check — 24 hours se purana nahi hona chahiye
  const authDate = parseInt(params.get('auth_date')) * 1000;
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  if (now - authDate > oneDayMs) {
    throw new Error('Auth data expired');
  }

  return user;
};

module.exports = { verifyTelegramInitData };