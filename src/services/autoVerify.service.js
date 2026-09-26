// ═══════════════════════════════════════════
// AUTO-VERIFICATION SERVICE
// ═══════════════════════════════════════════
// Checks if an activity URL should be auto-approved
// based on:
//   1. Global toggle (SystemSetting)
//   2. Time window (8 PM - 11:59 PM IST by default)
//   3. Strict URL patterns per platform
// ═══════════════════════════════════════════

const SystemSetting = require('../models/SystemSetting');

// ═══════════════════════════════════════════
// SETTING KEYS
// ═══════════════════════════════════════════
const TOGGLE_KEY = 'auto_verification_enabled';
const START_TIME_KEY = 'auto_verification_start_time'; // "20:00"
const END_TIME_KEY = 'auto_verification_end_time';     // "23:59"

// ═══════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════
const DEFAULT_START = '20:00';  // 8:00 PM IST
const DEFAULT_END = '23:59';    // 11:59 PM IST

// ═══════════════════════════════════════════
// TRACKING PARAMETERS TO STRIP
// ═══════════════════════════════════════════
const TRACKING_PARAMS = [
  // Common
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  // X (Twitter)
  's', 't', 'ref_src', 'ref_url', 'src',
  // Instagram
  'stkn', 'igsh', 'igshid', 'img_index',
  // Facebook
  'mibextid', 'rdid', 'fbclid', 'sfnsn', 'extid', '_rdr',
];

// ═══════════════════════════════════════════
// NORMALIZE URL
// ═══════════════════════════════════════════
const normalizeUrl = (rawUrl) => {
  try {
    let url = rawUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const parsed = new URL(url);

    TRACKING_PARAMS.forEach((param) => {
      parsed.searchParams.delete(param);
    });

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    const search = parsed.searchParams.toString();
    return `${hostname}${pathname}${search ? '?' + search : ''}`;
  } catch (err) {
    return null;
  }
};

// ═══════════════════════════════════════════
// PLATFORM MATCHERS
// ═══════════════════════════════════════════

const matchX = (normalized) => {
  const patterns = [
    /^(x|twitter|mobile\.twitter)\.com\/[^/]+\/status\/\d+/,
    /^(x|twitter|mobile\.twitter)\.com\/i\/status\/\d+/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      return { matched: true, reason: 'X status post pattern matched' };
    }
  }
  return { matched: false, reason: 'X URL is not a valid post/status link' };
};

const matchInstagram = (normalized) => {
  if (/^instagram\.com\/stories\//.test(normalized)) {
    return { matched: false, reason: 'Instagram stories expire — manual review' };
  }

  const patterns = [
    /^instagram\.com\/p\/[A-Za-z0-9_-]+/,
    /^instagram\.com\/reel\/[A-Za-z0-9_-]+/,
    /^instagram\.com\/reels\/[A-Za-z0-9_-]+/,
    /^instagram\.com\/tv\/[A-Za-z0-9_-]+/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      return { matched: true, reason: 'Instagram post/reel pattern matched' };
    }
  }
  return { matched: false, reason: 'Instagram URL is not a valid post/reel' };
};

const matchFacebook = (normalized) => {
  if (/^fb\.watch\/[A-Za-z0-9_-]+/.test(normalized)) {
    return { matched: true, reason: 'Facebook fb.watch link' };
  }

  const patterns = [
    /^facebook\.com\/[^/]+\/posts\/\d+/,
    /^facebook\.com\/[^/]+\/videos\/\d+/,
    /^facebook\.com\/[^/]+\/photos\/\d+/,
    /^facebook\.com\/reel\/\d+/,
    /^facebook\.com\/watch\/?\?v=\d+/,
    /^facebook\.com\/photo\.php\?fbid=\d+/,
    /^facebook\.com\/share\/p\/[A-Za-z0-9_-]+/,
    /^facebook\.com\/share\/v\/\d+/,
    /^facebook\.com\/share\/r\/\d+/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      return { matched: true, reason: 'Facebook post/video pattern matched' };
    }
  }
  return { matched: false, reason: 'Facebook URL is not a valid post/video' };
};

const matchPattern = (platform, rawUrl) => {
  const normalized = normalizeUrl(rawUrl);

  if (!normalized) {
    return { matched: false, reason: 'Invalid URL format' };
  }

  switch (platform) {
    case 'X':
      return matchX(normalized);
    case 'Instagram':
      return matchInstagram(normalized);
    case 'Facebook':
      return matchFacebook(normalized);
    default:
      return { matched: false, reason: 'Unknown platform' };
  }
};

// ═══════════════════════════════════════════
// GET CURRENT IST TIME (HOURS + MINUTES)
// ═══════════════════════════════════════════
const getCurrentISTTime = () => {
  const now = new Date();
  const istString = now.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [hours, minutes] = istString.split(':').map(Number);
  return { hours, minutes };
};

// ═══════════════════════════════════════════
// CONVERT "HH:MM" → MINUTES SINCE MIDNIGHT
// ═══════════════════════════════════════════
const timeToMinutes = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

// ═══════════════════════════════════════════
// CHECK IF CURRENT TIME IS IN AUTO-VERIFY WINDOW
// ═══════════════════════════════════════════
const isWithinTimeWindow = async () => {
  try {
    const startSetting = await SystemSetting.findOne({ key: START_TIME_KEY });
    const endSetting = await SystemSetting.findOne({ key: END_TIME_KEY });

    const startTime = startSetting?.value || DEFAULT_START;
    const endTime = endSetting?.value || DEFAULT_END;

    const current = getCurrentISTTime();
    const currentMins = current.hours * 60 + current.minutes;

    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

    // Same-day window (e.g., 20:00 → 23:59)
    if (startMins <= endMins) {
      return currentMins >= startMins && currentMins <= endMins;
    }

    // Cross-midnight window (e.g., 22:00 → 02:00) — future-proof
    return currentMins >= startMins || currentMins <= endMins;
  } catch (err) {
    console.error('Time window check error:', err.message);
    return false;
  }
};

// ═══════════════════════════════════════════
// CHECK GLOBAL TOGGLE
// ═══════════════════════════════════════════
const isAutoVerificationEnabled = async () => {
  try {
    const setting = await SystemSetting.findOne({ key: TOGGLE_KEY });
    if (!setting) return false;
    return setting.value === true;
  } catch (err) {
    console.error('Auto-verify toggle check error:', err.message);
    return false;
  }
};

// ═══════════════════════════════════════════
// MAIN VERIFY FUNCTION
// ═══════════════════════════════════════════
const shouldAutoVerify = async (platform, url) => {
  try {
    // Check 1: Global toggle
    const enabled = await isAutoVerificationEnabled();
    if (!enabled) {
      return { auto: false, reason: 'Auto-verification is disabled' };
    }

    // Check 2: Time window
    const inWindow = await isWithinTimeWindow();
    if (!inWindow) {
      const startSetting = await SystemSetting.findOne({ key: START_TIME_KEY });
      const endSetting = await SystemSetting.findOne({ key: END_TIME_KEY });
      const startTime = startSetting?.value || DEFAULT_START;
      const endTime = endSetting?.value || DEFAULT_END;

      return {
        auto: false,
        reason: `Outside auto-verify window (${startTime}–${endTime} IST)`,
      };
    }

    // Check 3: URL pattern
    const result = matchPattern(platform, url);
    if (!result.matched) {
      return { auto: false, reason: result.reason };
    }

    // All checks passed
    return { auto: true, reason: result.reason };
  } catch (err) {
    console.error('Auto-verify check error:', err.message);
    return { auto: false, reason: 'System error — manual review' };
  }
};

// ═══════════════════════════════════════════
// GET PATTERNS INFO (for admin view)
// ═══════════════════════════════════════════
const getPatternsInfo = () => {
  return {
    X: {
      valid: ['/status/<digits>', '/i/status/<digits>'],
      invalid: ['Profile only', 'Search, Hashtag, Homepage'],
    },
    Instagram: {
      valid: ['/p/<code>', '/reel/<code>', '/reels/<code>', '/tv/<code>'],
      invalid: ['Stories (/stories/username)', 'Profile only'],
    },
    Facebook: {
      valid: [
        '/posts/<digits>',
        '/videos/<digits>',
        '/photos/<digits>',
        '/reel/<digits>',
        '/watch/?v=<digits>',
        '/photo.php?fbid=<digits>',
        '/share/p/, /share/v/, /share/r/',
        'fb.watch/<code>',
      ],
      invalid: ['Profile only', 'Groups, Pages, Homepage'],
    },
  };
};

// ═══════════════════════════════════════════
// GET CURRENT SETTINGS (for admin view)
// ═══════════════════════════════════════════
const getAutoVerifySettings = async () => {
  try {
    const [toggle, start, end] = await Promise.all([
      SystemSetting.findOne({ key: TOGGLE_KEY }),
      SystemSetting.findOne({ key: START_TIME_KEY }),
      SystemSetting.findOne({ key: END_TIME_KEY }),
    ]);

    return {
      enabled: toggle?.value === true,
      startTime: start?.value || DEFAULT_START,
      endTime: end?.value || DEFAULT_END,
      currentISTTime: (() => {
        const { hours, minutes } = getCurrentISTTime();
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      })(),
    };
  } catch (err) {
    console.error('Get auto-verify settings error:', err.message);
    return {
      enabled: false,
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
      currentISTTime: '--:--',
    };
  }
};

module.exports = {
  shouldAutoVerify,
  isAutoVerificationEnabled,
  isWithinTimeWindow,
  normalizeUrl,
  matchPattern,
  getPatternsInfo,
  getAutoVerifySettings,
  getCurrentISTTime,
  TOGGLE_KEY,
  START_TIME_KEY,
  END_TIME_KEY,
  DEFAULT_START,
  DEFAULT_END,
};