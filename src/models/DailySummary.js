const mongoose = require('mongoose');

const DailySummarySchema = new mongoose.Schema({
  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: { 
    type: String, 
    required: true 
  },   // YYYY-MM-DD
  month: { 
    type: String, 
    required: true 
  },
  total_submitted: { 
    type: Number, 
    default: 0 
  },
  approved: { 
    type: Number, 
    default: 0 
  },
  rejected: { 
    type: Number, 
    default: 0 
  },
  duplicates: { 
    type: Number, 
    default: 0 
  },
  platform_counts: { 
    type: Map, 
    of: Number, 
    default: {} 
  },
  day_completed: { 
    type: Boolean, 
    default: false 
  },
  daily_points: { 
    type: Number, 
    default: 0 
  },
  processing_status: {
    type: String,
    enum: ['PENDING', 'PROCESSED'],
    default: 'PENDING',
  },
}, { timestamps: true });

DailySummarySchema.index({ member_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailySummary', DailySummarySchema);