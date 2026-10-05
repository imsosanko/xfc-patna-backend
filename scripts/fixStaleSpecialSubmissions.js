require('dotenv').config();
const mongoose = require('mongoose');
const SpecialSubmission = require('../src/models/SpecialSubmission');
const SpecialActivity = require('../src/models/SpecialActivity');
const MonthlyScore = require('../src/models/MonthlyScore');
const { formatDateIST } = require('../src/services/points.service');

(async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error('❌ MONGODB_URI not found in .env');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅ Connected to DB');

    const stale = await SpecialSubmission.find({
      'items.0': { $exists: false },
      is_locked: true,
    });

    console.log(`🔍 Found ${stale.length} stale submissions`);

    if (stale.length === 0) {
      console.log('✨ Nothing to fix. Exiting.');
      process.exit(0);
    }

    for (const sub of stale) {
      const previousPoints = sub.points_awarded || 0;

      sub.is_locked = false;
      sub.locked_at = null;
      sub.submitted_at = null;
      sub.status = 'NOT_STARTED';
      sub.points_awarded = 0;
      await sub.save();

      if (previousPoints > 0) {
        const activity = await SpecialActivity.findById(sub.special_activity_id);
        if (activity && activity.count_toward_leaderboard) {
          const month = formatDateIST().substring(0, 7);
          await MonthlyScore.findOneAndUpdate(
            { member_id: sub.member_id, month },
            {
              $inc: {
                special_points: -previousPoints,
                total_points: -previousPoints,
              },
            }
          );
          console.log(`  ↩️  Rolled back ${previousPoints} pts`);
        }
      }

      console.log(`  ✅ Fixed submission ${sub._id}`);
    }

    console.log('\n🎉 DONE. All stale submissions fixed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
})();