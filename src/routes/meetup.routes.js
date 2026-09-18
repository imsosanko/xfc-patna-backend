const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/telegramAuth');
const {
  getMeetups,
  getMeetupDetail,
  submitRSVP,
  cancelRSVP,
} = require('../controllers/meetup.controller');

/**
 * GET /api/meetups
 * Meetups list
 */
router.get('/', protect, getMeetups);

/**
 * GET /api/meetups/:id
 * Meetup detail
 */
router.get('/:id', protect, getMeetupDetail);

/**
 * POST /api/meetups/:id/rsvp
 * RSVP create/update
 */
router.post('/:id/rsvp', protect, submitRSVP);

/**
 * DELETE /api/meetups/:id/rsvp
 * Cancel RSVP
 */
router.delete('/:id/rsvp', protect, cancelRSVP);

module.exports = router;