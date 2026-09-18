const express = require('express');
const router = express.Router();
const { telegramAuth } = require('../controllers/auth.controller');

/**
 * POST /api/auth/telegram
 * Telegram WebApp authentication
 * Body: { initData: "..." }
 */
router.post('/telegram', telegramAuth);

module.exports = router;