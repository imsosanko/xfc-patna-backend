const jwt = require('jsonwebtoken');
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const { verifyTelegramInitData } = require('../services/telegram.service');

/**
 * POST /api/auth/telegram
 * Frontend se initData aayega, verify karenge, user create/find karenge, JWT denge
 */
const telegramAuth = async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ 
        success: false,
        error: 'initData required' 
      });
    }

    // Telegram initData verify karo
    const tgUser = verifyTelegramInitData(initData);

    // User find karo ya banao (upsert logic)
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
      // Existing user ka Telegram data update karo (naam/photo change ho sakta hai)
      user.telegram_username = tgUser.username || user.telegram_username;
      user.first_name = tgUser.first_name || user.first_name;
      user.last_name = tgUser.last_name || user.last_name;
      user.profile_photo_url = tgUser.photo_url || user.profile_photo_url;
      await user.save();
    }

    // Blocked check
    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      return res.status(403).json({ 
        success: false,
        error: 'Account blocked or suspended' 
      });
    }

    // Profile complete hai ya nahi
    const profile = await MemberProfile.findOne({ user_id: user._id });

    // JWT token generate karo
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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
    res.status(401).json({ 
      success: false,
      error: error.message 
    });
  }
};

module.exports = { telegramAuth };