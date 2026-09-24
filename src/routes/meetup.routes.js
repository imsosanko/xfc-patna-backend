const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const {
  getMeetups,
  getMeetupDetail,
  submitRSVP,
  submitXLink,
  submitInstagramLink,
  selfCheckIn,
  cancelRSVP,
} = require('../controllers/meetup.controller');

// ═══════════════════════════════════════════
// MEETUPS LIST & DETAIL
// ═══════════════════════════════════════════

// GET /api/meetups — Meetups list
router.get('/', protect, getMeetups);

// GET /api/meetups/:id — Meetup detail
router.get('/:id', protect, getMeetupDetail);

// ═══════════════════════════════════════════
// RSVP
// ═══════════════════════════════════════════

// POST /api/meetups/:id/rsvp — RSVP create (locked after)
router.post('/:id/rsvp', protect, submitRSVP);

// DELETE /api/meetups/:id/rsvp — Cancel RSVP (only if not locked)
router.delete('/:id/rsvp', protect, cancelRSVP);

// ═══════════════════════════════════════════
// X (TWITTER) LINK SUBMISSION
// ═══════════════════════════════════════════

// POST /api/meetups/:id/x-link — Submit X link
router.post('/:id/x-link', protect, submitXLink);

// ═══════════════════════════════════════════
// INSTAGRAM LINK SUBMISSION
// ═══════════════════════════════════════════

// POST /api/meetups/:id/instagram-link — Submit Instagram link
router.post('/:id/instagram-link', protect, submitInstagramLink);

// ═══════════════════════════════════════════
// GPS SELF CHECK-IN
// ═══════════════════════════════════════════

// POST /api/meetups/:id/check-in — Member GPS check-in
router.post('/:id/check-in', protect, selfCheckIn);

module.exports = router;