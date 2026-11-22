const Meetup = require('../models/Meetup');

// ═══════════════════════════════════════════
// AUTO STATUS SYNC (time ke hisaab se)
// PUBLISHED -> ONGOING -> COMPLETED
// DRAFT aur CANCELLED ko ye kabhi nahi chhuta
// ═══════════════════════════════════════════
const syncMeetupStatuses = async () => {
  const now = new Date();
  // end_time na ho to start ke 3 ghante baad COMPLETED maan lo
  const fallbackCutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  // 1) COMPLETED: end time nikal gaya
  await Meetup.updateMany(
    {
      status: { $in: ['PUBLISHED', 'ONGOING'] },
      $or: [
        { end_time: { $ne: null, $lte: now } },
        { end_time: null, date: { $lte: fallbackCutoff } },
      ],
    },
    { $set: { status: 'COMPLETED' } }
  );

  // 2) ONGOING: start ho gaya aur end nahi hua
  await Meetup.updateMany(
    {
      status: 'PUBLISHED',
      date: { $lte: now },
      $or: [{ end_time: null }, { end_time: { $gt: now } }],
    },
    { $set: { status: 'ONGOING' } }
  );
};

module.exports = { syncMeetupStatuses };
