const mongoose = require('mongoose');

const SystemSettingSchema = new mongoose.Schema({
  key: { 
    type: String, 
    unique: true, 
    required: true 
  },
  value: mongoose.Schema.Types.Mixed,
  updated_at: { 
    type: Date, 
    default: Date.now 
  },
});

module.exports = mongoose.model('SystemSetting', SystemSettingSchema);