// ═══════════════════════════════════════════
// MIGRATION SCRIPT: Link Existing Admins to Users
// ═══════════════════════════════════════════
// 
// Location: backend/src/scripts/linkAdmins.js
// Usage:    node src/scripts/linkAdmins.js
// ═══════════════════════════════════════════

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const User = require('../models/User');

async function linkAdmins() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n✅ MongoDB Connected\n');
    console.log('━'.repeat(60));

    const admins = await Admin.find({}).sort({ createdAt: 1 });
    console.log(`\n📋 Total Admins Found: ${admins.length}\n`);
    console.log('━'.repeat(60));

    const linked = [];
    const alreadyLinked = [];
    const needManual = [];

    for (const admin of admins) {
      console.log(`\n🔍 Processing: ${admin.email}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);

      // Already linked?
      if (admin.user_id) {
        console.log(`   ✅ Already linked → ${admin.user_id}`);
        alreadyLinked.push(admin);
        continue;
      }

      // Try to find matching user
      const nameParts = admin.name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      let matchedUser = null;

      // Try 1: Full name match
      if (firstName && lastName) {
        const users = await User.find({
          first_name: { $regex: new RegExp(`^${firstName}$`, 'i') },
          last_name: { $regex: new RegExp(`^${lastName}$`, 'i') },
        });

        if (users.length === 1) {
          matchedUser = users[0];
          console.log(`   🎯 Auto-matched (full name): ${users[0].first_name} ${users[0].last_name}`);
        } else if (users.length > 1) {
          console.log(`   ⚠️  Multiple matches for "${firstName} ${lastName}" (${users.length} found)`);
        }
      }

      // Try 2: First name only (if unique)
      if (!matchedUser && firstName) {
        const users = await User.find({
          first_name: { $regex: new RegExp(`^${firstName}$`, 'i') },
        });

        if (users.length === 1) {
          matchedUser = users[0];
          console.log(`   🎯 Auto-matched (first name): ${users[0].first_name}`);
        }
      }

      // Link if matched
      if (matchedUser) {
        admin.user_id = matchedUser._id;
        await admin.save();

        matchedUser.role = admin.role;
        await matchedUser.save();

        console.log(`   ✅ LINKED!`);
        console.log(`   → User ID: ${matchedUser._id}`);
        console.log(`   → Telegram: @${matchedUser.telegram_username || 'N/A'} (${matchedUser.telegram_id})`);
        console.log(`   → User role set to: ${admin.role}`);

        linked.push({ admin, user: matchedUser });
      } else {
        console.log(`   ❌ No auto-match found — manual link needed`);
        needManual.push(admin);
      }
    }

    // FINAL SUMMARY
    console.log('\n\n' + '━'.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('━'.repeat(60));
    console.log(`\n✅ Newly Linked     : ${linked.length}`);
    console.log(`✅ Already Linked   : ${alreadyLinked.length}`);
    console.log(`⚠️  Need Manual Link: ${needManual.length}`);
    console.log(`📋 Total Admins     : ${admins.length}`);

    if (needManual.length > 0) {
      console.log('\n' + '━'.repeat(60));
      console.log('⚠️  MANUAL LINKING REQUIRED');
      console.log('━'.repeat(60));

      for (const admin of needManual) {
        console.log(`\n👤 ${admin.email}`);
        console.log(`   Name: ${admin.name}`);
        console.log(`   Role: ${admin.role}`);

        const nameParts = admin.name.trim().split(/\s+/);
        const firstName = nameParts[0];

        if (firstName) {
          const users = await User.find({
            first_name: { $regex: new RegExp(firstName, 'i') },
          }).limit(5);

          if (users.length > 0) {
            console.log(`   💡 Possible matches:`);
            users.forEach((u, i) => {
              console.log(`      ${i + 1}. ${u.first_name} ${u.last_name} (@${u.telegram_username || 'N/A'}) — ID: ${u._id}`);
            });
          }
        }
      }
    } else {
      console.log('\n🎉 All admins are linked successfully!\n');
    }

    console.log('━'.repeat(60) + '\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
  } finally {
    await mongoose.disconnect();
    console.log('📴 MongoDB Disconnected\n');
  }
}

linkAdmins();