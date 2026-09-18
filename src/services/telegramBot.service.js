const { Bot } = require('node-telegram-bot-api');

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://xfc-patna.vercel.app';
const XFC_GROUP_URL = process.env.XFC_GROUP_URL || 'https://t.me/XFCPatna';
const XIAOMI_CIRCLE_URL = process.env.XIAOMI_CIRCLE_URL || 'https://t.me/XiaomiCircle';

let bot = null;

// ═══════════════════════════════════════════
// INITIALIZE BOT
// ═══════════════════════════════════════════
const initBot = () => {
  if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set');
    return null;
  }

  try {
    bot = new Bot(BOT_TOKEN);
    console.log('✅ Telegram Bot initialized');

    registerHandlers(bot);

    return bot;
  } catch (error) {
    console.error('❌ Failed to initialize bot:', error.message);
    return null;
  }
};

// ═══════════════════════════════════════════
// REGISTER HANDLERS
// ═══════════════════════════════════════════
const registerHandlers = (botInstance) => {

  // ─── /start ───
  botInstance.command('start', async (ctx) => {
    const name = ctx.from?.first_name || 'Member';

    const message = `
🎉 *Welcome to XFC Patna Alerts, ${name}!*

This bot shares official alerts, activity updates, and event schedules for XFC Patna members.

📋 *How to Use:*
1️⃣ First, join our Telegram group
2️⃣ Then launch the XFC Patna Mini App
3️⃣ Submit daily activities and earn points

⚠️ *Important:* You must join the group before using the Mini App.
`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📢 Join XFC Patna Group',
            url: XFC_GROUP_URL,
          },
        ],
        [
          {
            text: '🚀 Launch XFC Patna App',
            web_app: { url: MINI_APP_URL },
          },
        ],
        [
          {
            text: '❓ Help',
            callback_data: 'help',
          },
        ],
      ],
    };

    try {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error('Error in /start:', error.message);
    }
  });

  // ─── /help ───
  botInstance.command('help', async (ctx) => {
    const message = `
❓ *XFC Patna Bot — Help*

📌 *Available Commands:*

/start — Start the bot + Main menu
/help — Show this help message
/xiaomi — Join Xiaomi Community Circle

📱 *Mini App Features:*
• Submit daily activities (X, Instagram, Facebook)
• Earn points (100-point monthly system)
• Check your leaderboard rank
• Participate in special activities
• Manage your profile

🔗 *Important Links:*
• XFC Group: ${XFC_GROUP_URL}
• Xiaomi Circle: ${XIAOMI_CIRCLE_URL}

💬 *Support:*
If you have any issue, contact the admin.
`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🚀 Launch App',
            web_app: { url: MINI_APP_URL },
          },
        ],
      ],
    };

    try {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      console.error('Error in /help:', error.message);
    }
  });

  // ─── /xiaomi ───
  botInstance.command('xiaomi', async (ctx) => {
    const message = `
🌟 *Join Xiaomi Community Circle*

Xiaomi Community Circle is an official platform where Xiaomi fans connect, get exclusive updates, and participate in events.

🎁 *Benefits:*
• Exclusive Xiaomi updates
• Beta program access
• Special events & giveaways
• Fan community access

👇 *Click the button below to join:*
`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🌟 Join Xiaomi Circle',
            url: XIAOMI_CIRCLE_URL,
          },
        ],
        [
          {
            text: '📢 Join XFC Group',
            url: XFC_GROUP_URL,
          },
        ],
      ],
    };

    try {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      console.error('Error in /xiaomi:', error.message);
    }
  });

  // ─── Callback Query (Help button) ───
  botInstance.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery?.data;

    if (data === 'help') {
      const message = `
❓ *XFC Patna Bot — Help*

📌 *Commands:*
/start — Start
/help — Help
/xiaomi — Xiaomi Circle

📱 *Mini App Features:*
• Submit daily activities
• Earn points
• Check leaderboard
• Special activities
`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '🚀 Launch App',
              web_app: { url: MINI_APP_URL },
            },
          ],
        ],
      };

      try {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch (error) {
        console.error('Error in callback_query:', error.message);
      }
    }

    try {
      await ctx.answerCallbackQuery();
    } catch (error) {
      console.error('Error answering callback:', error.message);
    }
  });

  // ─── Fallback for unknown messages ───
  botInstance.on('message', async (ctx) => {
    const text = ctx.message?.text || '';

    if (
      text.startsWith('/start') ||
      text.startsWith('/help') ||
      text.startsWith('/xiaomi')
    ) {
      return;
    }

    if (text.startsWith('/')) {
      await ctx.reply('❓ Unknown command. Use /help to see available commands.');
      return;
    }

    const name = ctx.from?.first_name || 'Member';
    await ctx.reply(`Hi ${name}! Use /start to begin.`);
  });
};

// ═══════════════════════════════════════════
// GET BOT INSTANCE
// ═══════════════════════════════════════════
const getBot = () => {
  if (!bot) {
    return initBot();
  }
  return bot;
};

// ═══════════════════════════════════════════
// SET WEBHOOK
// ═══════════════════════════════════════════
const setWebhook = async (webhookUrl) => {
  const botInstance = getBot();
  if (!botInstance) return false;

  try {
    await botInstance.api.setWebhook({
      url: `${webhookUrl}/api/telegram/webhook`,
    });
    console.log(`✅ Webhook set: ${webhookUrl}/api/telegram/webhook`);
    return true;
  } catch (error) {
    console.error('❌ Error setting webhook:', error.message);
    return false;
  }
};

// ═══════════════════════════════════════════
// HANDLE UPDATE
// ═══════════════════════════════════════════
const handleUpdate = async (update) => {
  const botInstance = getBot();
  if (!botInstance) return;

  try {
    await botInstance.handleUpdate(update);
  } catch (error) {
    console.error('Error handling update:', error.message);
  }
};

module.exports = {
  initBot,
  getBot,
  handleUpdate,
  setWebhook,
};