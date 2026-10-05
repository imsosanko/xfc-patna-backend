const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');

/**
 * anyAuth — Accepts either admin token OR member token.
 * Sets req.admin for admins, req.user for members.
 */
const anyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.split(' ')[1];

    // ── Try ADMIN token first ──
    try {
      const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
      const admin = await Admin.findById(decoded.id);
      if (admin && admin.is_active) {
        req.admin = admin;
        return next();
      }
    } catch {
      // Not an admin token — fall through
    }

    // ── Try MEMBER token (JWT_SECRET) ──
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id || decoded.userId);
      if (user) {
        req.user = user;
        return next();
      }
    } catch {
      // Not a member token either
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = { anyAuth };