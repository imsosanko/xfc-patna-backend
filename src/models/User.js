const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  telegram_id: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  telegram_username: { 
    type: String, 
    default: '' 
  },
  first_name: { 
    type: String, 
    default: '' 
  },
  last_name: { 
    type: String, 
    default: '' 
  },
  profile_photo_url: { 
    type: String, 
    default: '' 
  },
  role: {
    type: String,
    enum: ['MEMBER', 'ADMIN', 'SUPER_ADMIN', 'VERIFIER', 'REPORT_ADMIN', 'SPECIAL_ADMIN'],
    default: 'MEMBER',
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'BLOCKED', 'SUSPENDED'],
    default: 'ACTIVE',
  },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);