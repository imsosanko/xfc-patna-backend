const jwt = require('jsonwebtoken');
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const { verifyTelegramInitData } = require('../services/telegram.service');

/**
 * POST /api/auth/telegram
 * Telegram WebApp authentication
 */
const telegramAuth = async (req, res) => {
  try {
    const { initData } = req.body;

    // ═══════════════════════════════════════════
    // 🔍 DEBUG LOGS
    // ═══════════════════════════════════════════
    console.log('🔍 === AUTH REQUEST ===');
    console.log('  initData received:', initData ? `${initData.length} chars` : 'EMPTY');
    console.log('  initData preview:', initData?.substring(0, 100));
    console.log('  Bot token loaded:', process.env.TELEGRAM_BOT_TOKEN ? 'YES' : 'NO');
    console.log('  Bot token (first 10 chars):', process.env.TELEGRAM_BOT_TOKEN?.substring(0, 10));
    console.log('======================');

    if (!initData) {
      return res.status(400).json({ 
        success: false,
        error: 'initData required' 
      });
    }

    // Telegram initData verify karo
    const tgUser = verifyTelegramInitData(initData);
    
    console.log('✅ Telegram user verified:', {
      id: tgUser.id,
      username: tgUser.username,
      first_name: tgUser.first_name,
    });

    // User find karo ya banao
    let user = await User.findOne({ telegram_id: tgUser.id.toString() });
    
    if (!user) {
      user = await User.create({
        telegram_id: tgUser.id.toString(),
        telegram_username: tgUser.username || '',
        first_name: tgUser.first_name || '',
        last_name: tgUser.last_name || '',
        profile_photo_url: tgUser.photo_url || '',
        role: 'MEMBER',
        status: 'ACTIVE',
      });
      console.log(`👤 New user created: ${user.first_name} (${user.telegram_id})`);
    } else {
      user.telegram_username = tgUser.username || user.telegram_username;
      user.first_name = tgUser.first_name || user.first_name;
      user.last_name = tgUser.last_name || user.last_name;
      user.profile_photo_url = tgUser.photo_url || user.profile_photo_url;
      await user.save();
      console.log(`👤 Existing user: ${user.first_name}`);
    }

    // Blocked check
    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      return res.status(403).json({ 
        success: false,
        error: 'Account blocked or suspended' 
      });
    }

    // Profile complete check
    const profile = await MemberProfile.findOne({ user_id: user._id });

    // JWT token generate karo
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Auth successful, token issued');
    console.log('======================');

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        role: user.role,
        status: user.status,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_photo_url: user.profile_photo_url,
        telegram_username: user.telegram_username,
      },
      isProfileComplete: !!profile,
    });
  } catch (error) {
    console.error('❌ Telegram auth error:', error.message);
    console.log('======================');
    res.status(401).json({ 
      success: false,
      error: error.message 
    });
  }
};

module.exports = { telegramAuth };