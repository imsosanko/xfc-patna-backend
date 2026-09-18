const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  admin_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  action: { 
    type: String, 
    required: true 
  },
  target_type: String,
  target_id: String,
  previous_value: mongoose.Schema.Types.Mixed,
  new_value: mongoose.Schema.Types.Mixed,
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);