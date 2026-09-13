const mongoose = require('mongoose');

const SpecialSubmissionSchema = new mongoose.Schema({
  special_activity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SpecialActivity',
    required: true,
    index: true,
  },
  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // Member ke saare submitted links
  items: [{
    platform: String,
    activity_type: String,
    url: String,
    normalized_url: String,
    url_hash: String,
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    rejection_reason: String,
  }],
  
  status: {
    type: String,
    enum: [
      'NOT_STARTED', 
      'IN_PROGRESS', 
      'SUBMITTED', 
      'UNDER_REVIEW', 
      'APPROVED', 
      'PARTIALLY_APPROVED', 
      'REJECTED', 
      'COMPLETED'
    ],
    default: 'NOT_STARTED',
  },
  
  points_awarded: { 
    type: Number, 
    default: 0 
  },
}, { timestamps: true });

SpecialSubmissionSchema.index(
  { special_activity_id: 1, member_id: 1 }, 
  { unique: true }
);

module.exports = mongoose.model('SpecialSubmission', SpecialSubmissionSchema);