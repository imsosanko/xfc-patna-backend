const fs = require('fs');
const path = require('path');

const expectedFiles = [
  'src/config/db.js',
  'src/utils/constants.js',
  'src/utils/logger.js',
  'src/models/User.js',
  'src/models/MemberProfile.js',
  'src/models/Activity.js',
  'src/models/DailySummary.js',
  'src/models/MonthlyScore.js',
  'src/models/SpecialActivity.js',
  'src/models/SpecialSubmission.js',
  'src/models/SystemSetting.js',
  'src/models/AuditLog.js',
  'src/services/url.service.js',
  'src/services/telegram.service.js',
  'src/services/points.service.js',
  'src/controllers/auth.controller.js',
  'src/controllers/member.controller.js',
  'src/controllers/activity.controller.js',
  'src/controllers/leaderboard.controller.js',
  'src/middlewares/telegramAuth.js',
  'src/middlewares/errorHandler.js',
  'src/routes/auth.routes.js',
  'src/routes/member.routes.js',
  'src/routes/activity.routes.js',
  'src/routes/leaderboard.routes.js',
  'src/app.js',
  'server.js',
];

console.log('\n🔍 FILE VERIFICATION\n');
console.log('─'.repeat(70));

let problems = 0;

expectedFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ MISSING:   ${file}`);
    problems++;
    return;
  }
  
  const stats = fs.statSync(fullPath);
  const size = stats.size;
  
  if (size === 0) {
    console.log(`⚠️  EMPTY:     ${file} (0 bytes) ← PROBLEM`);
    problems++;
  } else if (size < 100) {
    console.log(`⚠️  TINY:      ${file} (${size} bytes) ← check karo`);
    problems++;
  } else {
    console.log(`✅ OK:        ${file} (${size} bytes)`);
  }
});

console.log('─'.repeat(70));
if (problems === 0) {
  console.log('✅ All files look good!\n');
} else {
  console.log(`❌ ${problems} file(s) have problems. Fix them first.\n`);
}