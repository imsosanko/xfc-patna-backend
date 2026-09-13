const mongoose = require('mongoose');
const MonthlyScore = require('../models/MonthlyScore');
const { getCurrentMonth, formatDateIST } = require('../services/points.service');

/**
 * GET /api/leaderboard
 * Month-wise leaderboard with ranking
 * Ranking priority: points > activities > active_days > earlier achievement
 */
const getLeaderboard = async (req, res) => {
  try {
    const { 
      month = getCurrentMonth(), 
      limit = 100,
      filter = 'month',  // 'today', 'week', 'month', 'all'
    } = req.query;

    let matchStage = {};
    
    if (filter === 'month') {
      matchStage = { month };
    } else if (filter === 'all') {
      matchStage = {};
    }
    // 'today' aur 'week' ke liye alag logic chahiye — abhi simple rakhte hain

    const scores = await MonthlyScore.aggregate([
      { $match: matchStage },
      { 
        $sort: { 
          total_points: -1, 
          verified_activities: -1, 
          active_days: -1, 
          first_activity_at: 1 
        } 
      },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'memberprofiles',
          localField: 'member_id',
          foreignField: 'user_id',
          as: 'profile',
        },
      },
      { 
        $unwind: { 
          path: '$profile', 
          preserveNullAndEmptyArrays: true 
        } 
      },
      {
        $lookup: {
          from: 'users',
          localField: 'member_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { 
        $unwind: { 
          path: '$user', 
          preserveNullAndEmptyArrays: true 
        } 
      },
      {
        $project: {
          member_id: 1,
          name: { $ifNull: ['$profile.full_name', 'Unknown'] },
          xiaomi_id: { $ifNull: ['$profile.xiaomi_id', ''] },
          profile_photo_url: { $ifNull: ['$user.profile_photo_url', ''] },
          points: '$total_points',
          regular_points: 1,
          special_points: 1,
          activities: '$verified_activities',
          active_days: 1,
          percentage: 1,
        },
      },
    ]);

    // Rank add karo
    const leaderboard = scores.map((s, i) => ({ 
      ...s, 
      rank: i + 1 
    }));

    // Logged-in member ka rank find karo
    let myRank = null;
    if (req.user) {
      const myEntry = leaderboard.find(
        e => e.member_id.toString() === req.user._id.toString()
      );
      if (myEntry) {
        myRank = myEntry.rank;
      } else {
        // Agar top 100 mein nahi, toh alag se count karo
        const myScore = await MonthlyScore.findOne({ 
          member_id: req.user._id, 
          month 
        });
        if (myScore) {
          const higherCount = await MonthlyScore.countDocuments({
            month,
            $or: [
              { total_points: { $gt: myScore.total_points } },
              { 
                total_points: myScore.total_points, 
                verified_activities: { $gt: myScore.verified_activities } 
              },
            ],
          });
          myRank = higherCount + 1;
        }
      }
    }

    res.json({ 
      success: true, 
      month,
      filter,
      myRank,
      leaderboard 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

module.exports = { getLeaderboard };