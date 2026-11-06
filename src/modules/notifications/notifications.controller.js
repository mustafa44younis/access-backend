const notificationsService = require('./notifications.service');

const getNotifications = async (req, res) => {
  try {
    const data = await notificationsService.getUserNotifications(req.user.id, req.query);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب الإشعارات',
    });
  }
};

const markAsRead = async (req, res) => {
  try {
    const data = await notificationsService.markNotificationAsRead(req.user.id, req.params.id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تحديث حالة الإشعار',
    });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const data = await notificationsService.markAllNotificationsAsRead(req.user.id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تحديث الإشعارات',
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};

