require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');

async function debug() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n✅ MongoDB Connected\n');
    console.log('━'.repeat(60));

    // 1. Admins check
    console.log('\n📋 ADMINS:');
    const admins = await Admin.find({}).select('email name role user_id');
    admins.forEach((a) => {
      console.log(`   ${a.email}`);
      console.log(`     Name: ${a.name}`);
      console.log(`     Role: ${a.role}`);
      console.log(`     user_id: ${a.user_id || '❌ NULL'}`);
      console.log('');
    });

    // 2. Users count
    const userCount = await User.countDocuments();
    console.log(`\n📋 Total Users: ${userCount}`);

    // 3. MemberProfiles count
    const profileCount = await MemberProfile.countDocuments();
    console.log(`📋 Total MemberProfiles: ${profileCount}`);

    // 4. Sample MemberProfiles
    console.log('\n📋 Sample MemberProfiles (first 5):');
    const profiles = await MemberProfile.find({}).limit(5);
    profiles.forEach((p) => {
      console.log(`   ${p.full_name} | xiaomi_id: ${p.xiaomi_id} | telegram: ${p.telegram_username}`);
    });

    // 5. Test search - "15"
    console.log('\n📋 Search Test "15":');
    const regex = new RegExp('15', 'i');
    const matches = await MemberProfile.find({
      $or: [
        { full_name: regex },
        { xiaomi_id: regex },
        { telegram_username: regex },
      ],
    }).limit(10);
    console.log(`   Found: ${matches.length} matches`);
    matches.forEach((m) => {
      console.log(`     - ${m.full_name} | ${m.xiaomi_id}`);
    });

    console.log('\n━'.repeat(60));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

debug();