const mongoose = require('mongoose');

const PopupMessageSchema = new mongoose.Schema({
  // Basic content
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },

  // Type: what kind of popup
  type: {
    type: String,
    enum: ['CUSTOM', 'SPECIAL_ACTIVITY', 'MEETUP', 'RULE_UPDATE'],
    default: 'CUSTOM',
    index: true,
  },

  // Visual
  icon: {
    type: String,
    default: 'megaphone',
  },
  image_url: {
    type: String,
    default: '',
  },

  // CTA button
  button_text: {
    type: String,
    default: 'Got It 👍',
    maxlength: 40,
  },
  button_link: {
    type: String,
    default: '',
  },

  // Priority (1-10, higher = shown first)
  priority: {
    type: Number,
    default: 5,
    min: 1,
    max: 10,
    index: true,
  },

  // Active toggle
  is_active: {
    type: Boolean,
    default: false,
    index: true,
  },

  // Frequency: how often member sees it
  frequency: {
    type: String,
    enum: [
      'ALWAYS',           // Every app open
      'ONCE_ONLY',        // Just once
      'ONCE_PER_DAY',     // Once every calendar day
      'EVERY_4_HOURS',    // Every 4 hours
      'EVERY_6_HOURS',    // Every 6 hours
      'EVERY_12_HOURS',   // Every 12 hours
    ],
    default: 'ONCE_PER_DAY',
    index: true,
  },

  // Schedule
  starts_at: {
    type: Date,
    default: Date.now,
  },
  ends_at: {
    type: Date,
    default: null,   // null = no expiry
  },

  // Track who saw it (with timestamp for frequency logic)
  seen_history: [{
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    seen_at: {
      type: Date,
      default: Date.now,
    },
  }],

  // Who created it
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
}, { timestamps: true });

// Index for fast active popup lookup
PopupMessageSchema.index({
  is_active: 1,
  starts_at: 1,
  ends_at: 1,
  priority: -1,
});

module.exports = mongoose.model('PopupMessage', PopupMessageSchema);