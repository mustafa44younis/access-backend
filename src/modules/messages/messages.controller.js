const messagesService = require('./messages.service');

const getUserConversations = async (req, res) => {
  try {
    const data = await messagesService.getUserConversations(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب قائمة المحادثات',
    });
  }
};

const getConversationDetails = async (req, res) => {
  try {
    const data = await messagesService.getConversationDetails(req.user.id, req.params.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل المحادثة',
    });
  }
};

const getConversationMessages = async (req, res) => {
  try {
    const data = await messagesService.getConversationMessages(
      req.user.id,
      req.params.id,
      req.query || {}
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب رسائل المحادثة',
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const data = await messagesService.sendMessage(
      req.user.id,
      req.params.id,
      req.body || {}
    );
    return res.status(201).json({
      success: true,
      message: 'تم إرسال الرسالة بنجاح',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إرسال الرسالة',
    });
  }
};

const markConversationAsRead = async (req, res) => {
  try {
    const data = await messagesService.markConversationAsRead(req.user.id, req.params.id);
    return res.status(200).json({
      success: true,
      message: data.message,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تحديث حالة القراءة',
    });
  }
};

const getOrCreateProjectConversation = async (req, res) => {
  try {
    const data = await messagesService.getOrCreateProjectConversation(
      req.user.id,
      req.params.projectId
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب أو إنشاء محادثة المشروع',
    });
  }
};

const searchConversationMessages = async (req, res) => {
  try {
    const data = await messagesService.searchConversationMessages(
      req.user.id,
      req.params.id,
      req.query || {}
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء البحث في الرسائل',
    });
  }
};

const getConversationProjectContext = async (req, res) => {
  try {
    const data = await messagesService.getConversationProjectContext(
      req.user.id,
      req.params.id
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب سياق المشروع للمحادثة',
    });
  }
};

const getProjectSharedFiles = async (req, res) => {
  try {
    const data = await messagesService.getProjectSharedFiles(
      req.user.id,
      req.params.projectId,
      req.query || {}
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب ملفات المشروع المشتركة',
    });
  }
};

const uploadProjectSharedFile = async (req, res) => {
  try {
    const data = await messagesService.uploadProjectSharedFile(
      req.user.id,
      req.params.projectId,
      req.body || {}
    );
    return res.status(201).json({
      success: true,
      message: 'تم إضافة الملف إلى مستودع المشروع بنجاح',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إضافة الملف للمستودع',
    });
  }
};

const getFilePreviewDetails = async (req, res) => {
  try {
    const data = await messagesService.getFilePreviewDetails(
      req.user.id,
      req.params.fileId
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل معاينة الملف',
    });
  }
};

const requestChatIntervention = async (req, res) => {
  try {
    const data = await messagesService.requestChatIntervention(
      req.user.id,
      req.params.id,
      req.body || {}
    );
    return res.status(201).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تقديم طلب تدخل الإدارة',
    });
  }
};

const retryFailedMessage = async (req, res) => {
  try {
    const data = await messagesService.retryFailedMessage(
      req.user.id,
      req.params.messageId
    );
    return res.status(200).json({
      success: true,
      message: 'تمت إعادة إرسال الرسالة بنجاح',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إعادة إرسال الرسالة',
    });
  }
};

const getConversationPresence = async (req, res) => {
  try {
    const data = await messagesService.getConversationPresence(
      req.user.id,
      req.params.id
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب حالة التواجد',
    });
  }
};

module.exports = {
  getUserConversations,
  getConversationDetails,
  getConversationMessages,
  sendMessage,
  markConversationAsRead,
  getOrCreateProjectConversation,
  searchConversationMessages,
  getConversationProjectContext,
  getProjectSharedFiles,
  uploadProjectSharedFile,
  getFilePreviewDetails,
  requestChatIntervention,
  retryFailedMessage,
  getConversationPresence,
};
