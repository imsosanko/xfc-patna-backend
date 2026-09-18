const express = require('express');
const router = express.Router();
const { handleUpdate, setWebhook } = require('../services/telegramBot.service');

// ═══════════════════════════════════════════
// TELEGRAM WEBHOOK
// ═══════════════════════════════════════════
router.post('/webhook', async (req, res) => {
  try {
    res.sendStatus(200);
    await handleUpdate(req.body);
  } catch (error) {
    console.error('Webhook error:', error.message);
  }
});

// ═══════════════════════════════════════════
// MANUAL WEBHOOK SETUP
// ═══════════════════════════════════════════
router.post('/set-webhook', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const success = await setWebhook(url);

    res.json({
      success,
      message: success ? 'Webhook set successfully' : 'Failed to set webhook',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;