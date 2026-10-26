const milestonesService = require('./milestones.service');

const getMilestoneReview = async (req, res) => {
  try {
    const data = await milestonesService.getMilestoneReview(req.user.id, req.params.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب بيانات مراجعة المخرجات',
    });
  }
};

const requestChanges = async (req, res) => {
  try {
    const { notes } = req.body;
    if (!notes || notes.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'يرجى كتابة الملاحظات المطلوبة للتعديل',
      });
    }

    const data = await milestonesService.requestChanges(req.user.id, req.params.id, { notes });

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إرسال طلب التعديل',
    });
  }
};

const approveMilestone = async (req, res) => {
  try {
    const data = await milestonesService.approveMilestone(req.user.id, req.params.id);

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء اعتماد المرحلة',
    });
  }
};

const getFinalDelivery = async (req, res) => {
  try {
    const data = await milestonesService.getFinalDelivery(req.user.id, req.params.projectId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل التسليم النهائي',
    });
  }
};

const finalSignoff = async (req, res) => {
  try {
    const data = await milestonesService.finalSignoff(req.user.id, req.params.projectId);

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء اعتماد التسليم النهائي',
    });
  }
};

module.exports = {
  getMilestoneReview,
  requestChanges,
  approveMilestone,
  getFinalDelivery,
  finalSignoff,
};
