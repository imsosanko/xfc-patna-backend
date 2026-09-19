const Notification = require('../models/Notification');

// ═══════════════════════════════════════════
// GET MY NOTIFICATIONS
// GET /api/member/notifications
// ═══════════════════════════════════════════
const getMyNotifications = async (req, res) => {
  try {
    const { unread_only, limit = 30, page = 1 } = req.query;

    const query = { member_id: req.user._id };
    if (unread_only === 'true') query.is_read = false;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ member_id: req.user._id, is_read: false }),
    ]);

    res.json({
      success: true,
      total,
      unread_count: unreadCount,
      page: parseInt(page),
      count: notifications.length,
      notifications: notifications.map((n) => ({
        id: n._id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        is_read: n.is_read,
        created_at: n.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// GET UNREAD COUNT (fast — bell badge)
// GET /api/member/notifications/unread-count
// ═══════════════════════════════════════════
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      member_id: req.user._id,
      is_read: false,
    });

    res.json({ success: true, unread_count: count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MARK ONE AS READ
// PATCH /api/member/notifications/:id/read
// ═══════════════════════════════════════════
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOne({
      _id: id,
      member_id: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    notification.is_read = true;
    notification.read_at = new Date();
    await notification.save();

    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// MARK ALL AS READ
// PATCH /api/member/notifications/read-all
// ═══════════════════════════════════════════
const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { member_id: req.user._id, is_read: false },
      { $set: { is_read: true, read_at: new Date() } }
    );

    res.json({
      success: true,
      modified: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// DELETE NOTIFICATION
// DELETE /api/member/notifications/:id
// ═══════════════════════════════════════════
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Notification.deleteOne({
      _id: id,
      member_id: req.user._id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};