const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * JWT token verify karta hai aur req.user set karta hai
 * Har protected route pe lagega
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Token verify karo
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid or expired token' 
      });
    }

    // User find karo
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Blocked/Suspended check
    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      return res.status(403).json({ 
        success: false,
        error: `Account is ${user.status.toLowerCase()}` 
      });
    }

    // req.user attach karo
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Authentication failed' 
    });
  }
};

/**
 * Admin-only access check
 * protect ke baad lagega
 */
const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required' 
    });
  }

  if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ 
      success: false,
      error: 'Admin access required' 
    });
  }

  next();
};

module.exports = { protect, adminOnly };