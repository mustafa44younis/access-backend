const teamService = require('./team.service');

const getSpecialists = async (req, res) => {
  try {
    const data = await teamService.getSpecialists(req.query || {});
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب قائمة المستقلين والخبراء',
    });
  }
};

const getSpecialistById = async (req, res) => {
  try {
    const data = await teamService.getSpecialistById(req.params.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل المستقل',
    });
  }
};

const getMyProjectTeam = async (req, res) => {
  try {
    const data = await teamService.getMyProjectTeam(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب أعضاء فريقك',
    });
  }
};

module.exports = {
  getSpecialists,
  getSpecialistById,
  getMyProjectTeam,
};
