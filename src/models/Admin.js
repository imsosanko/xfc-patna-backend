const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    trim: true,
    index: true,
  },
  password_hash: { 
    type: String, 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['SUPER_ADMIN', 'ADMIN', 'VERIFIER', 'REPORT_ADMIN', 'SPECIAL_ADMIN'], 
    default: 'ADMIN' 
  },
  is_active: { 
    type: Boolean, 
    default: true 
  },
  last_login: Date,
}, { timestamps: true });

module.exports = mongoose.model('Admin', AdminSchema);
