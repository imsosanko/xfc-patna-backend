const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const adminProtect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    } catch {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid or expired token' 
      });
    }

    const admin = await Admin.findById(decoded.id);
    
    if (!admin) {
      return res.status(401).json({ 
        success: false,
        error: 'Admin not found' 
      });
    }

    if (!admin.is_active) {
      return res.status(403).json({ 
        success: false,
        error: 'Admin account is inactive' 
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

const superAdminOnly = (req, res, next) => {
  if (req.admin.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ 
      success: false,
      error: 'Super admin access required' 
    });
  }
  next();
};

module.exports = { adminProtect, superAdminOnly };