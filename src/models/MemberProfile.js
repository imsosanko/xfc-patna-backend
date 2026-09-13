const mongoose = require('mongoose');

const MemberProfileSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  full_name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  xiaomi_id: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true, 
    trim: true 
  },
  whatsapp_number: { 
    type: String, 
    required: true, 
    trim: true 
  },
  instagram_url: { 
    type: String, 
    default: '' 
  },
  facebook_url: { 
    type: String, 
    default: '' 
  },
  x_twitter_url: { 
    type: String, 
    default: '' 
  },
}, { timestamps: true });

module.exports = mongoose.model('MemberProfile', MemberProfileSchema);