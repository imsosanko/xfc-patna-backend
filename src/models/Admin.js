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
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN'],
    default: 'ADMIN',
    index: true,
  },
  permissions: {
    type: [String],
    default: [],
  },
  is_active: {
    type: Boolean,
    default: true,
  },
  last_login: Date,
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  password_changed_at: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('Admin', AdminSchema);