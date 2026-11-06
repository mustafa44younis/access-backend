const contractsService = require('./contracts.service');

const getConsultations = async (req, res) => {
  try {
    const data = await contractsService.getConsultations(req.user.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب سجل جلسات الاستشارة',
    });
  }
};

const getConsultationDetails = async (req, res) => {
  try {
    const data = await contractsService.getConsultationDetails(req.user.id, req.params.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل جلسة الاستشارة',
    });
  }
};

const createConsultation = async (req, res) => {
  try {
    const data = await contractsService.createConsultation(req.user.id, req.body || {});

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء جلسة الاستشارة الذكية بنجاح',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إنشاء جلسة الاستشارة',
    });
  }
};

const updateConsultationBrief = async (req, res) => {
  try {
    const data = await contractsService.updateConsultationBrief(
      req.user.id,
      req.params.id,
      req.body || {}
    );

    return res.status(200).json({
      success: true,
      message: 'تم تحديث مسودة ملخص المشروع بنجاح',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تحديث مسودة الملخص',
    });
  }
};

const addConsultationMessage = async (req, res) => {
  try {
    const data = await contractsService.addConsultationMessage(
      req.user.id,
      req.params.id,
      req.body || {}
    );

    return res.status(200).json({
      success: true,
      message: 'تم إرسال الرسالة واستلام رد المساعد الذكي',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء معالجة رسالة الاستشارة',
    });
  }
};

const getContractByConsultationId = async (req, res) => {
  try {
    const data = await contractsService.getContractByConsultationId(
      req.user.id,
      req.params.consultationId
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب العقد المرتبط بجلسة الاستشارة',
    });
  }
};

const getContractById = async (req, res) => {
  try {
    const data = await contractsService.getContractById(req.user.id, req.params.contractId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل العقد',
    });
  }
};

const signContract = async (req, res) => {
  try {
    const result = await contractsService.signContract(
      req.user.id,
      req.params.contractId,
      req.body || {}
    );

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء توقيع واعتماد العقد',
    });
  }
};

const getExperts = async (req, res) => {
  try {
    const data = await contractsService.getExpertsWithSlots();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب قائمة المستشارين والخبراء',
    });
  }
};

const bookExpertSession = async (req, res) => {
  try {
    const result = await contractsService.bookExpertSession(req.user.id, req.body || {});

    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تأكيد حجز الاستشارة',
    });
  }
};

const getClientExpertBookings = async (req, res) => {
  try {
    const data = await contractsService.getClientExpertBookings(req.user.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب سجل حجوزات الاستشارات',
    });
  }
};

module.exports = {
  getConsultations,
  getConsultationDetails,
  createConsultation,
  updateConsultationBrief,
  addConsultationMessage,
  getContractByConsultationId,
  getContractById,
  signContract,
  getExperts,
  bookExpertSession,
  getClientExpertBookings,
};
