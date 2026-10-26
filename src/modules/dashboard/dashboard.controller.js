const dashboardService = require('./dashboard.service');

const getOverview = async (req, res) => {
  try {
    const data = await dashboardService.getOverview(req.user.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب بيانات لوحة التحكم',
    });
  }
};

module.exports = {
  getOverview,
};
