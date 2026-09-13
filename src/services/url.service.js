const crypto = require('crypto');

/**
 * URL ko normalize karta hai — duplicate detection ke liye
 * - lowercase
 * - protocol remove (https://, http://)
 * - www remove
 * - trailing slash remove
 * - tracking params remove (utm_*, ref, s, t)
 */
const normalizeUrl = (url) => {
  try {
    let normalized = url.trim().toLowerCase();
    
    // Protocol hatao
    normalized = normalized.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/^www\./, '');
    
    // Trailing slash hatao
    normalized = normalized.replace(/\/$/, '');
    
    // Tracking params hatao
    const [base, query] = normalized.split('?');
    if (query) {
      const params = new URLSearchParams(query);
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 
        'utm_content', 'utm_term', 'ref', 's', 't'
      ];
      trackingParams.forEach(p => params.delete(p));
      
      const cleanQuery = params.toString();
      normalized = cleanQuery ? `${base}?${cleanQuery}` : base;
    }
    
    return normalized;
  } catch {
    return url.trim().toLowerCase();
  }
};

/**
 * URL ka SHA-256 hash banata hai
 * Ye hash database mein unique constraint ke liye use hoga
 */
const getUrlHash = (url) => {
  return crypto
    .createHash('sha256')
    .update(normalizeUrl(url))
    .digest('hex');
};

/**
 * URL se platform auto-detect karta hai
 */
const detectPlatform = (url) => {
  const lower = url.toLowerCase();
  
  if (lower.includes('x.com') || lower.includes('twitter.com')) return 'X';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('facebook.com')) return 'Facebook';
  
  return 'Other';
};

/**
 * URL valid hai ya nahi check karta hai
 */
const isValidUrl = (url) => {
  try {
    new URL(url.startsWith('http') ? url : `https://${url}`);
    return true;
  } catch {
    return false;
  }
};

module.exports = { 
  normalizeUrl, 
  getUrlHash, 
  detectPlatform, 
  isValidUrl 
};