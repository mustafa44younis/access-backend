const projectsService = require('./projects.service');

const getProjects = async (req, res) => {
  try {
    const { status } = req.query;
    const data = await projectsService.getProjects(req.user.id, status);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب المشاريع',
    });
  }
};

const getProjectById = async (req, res) => {
  try {
    const data = await projectsService.getProjectById(req.user.id, req.params.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل المشروع',
    });
  }
};

const createProject = async (req, res) => {
  try {
    const data = await projectsService.createProject(req.user.id, req.body);

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء المشروع بنجاح',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إنشاء المشروع',
    });
  }
};

module.exports = {
  getProjects,
  getProjectById,
  createProject,
};
