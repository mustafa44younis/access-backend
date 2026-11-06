const paymentsService = require('./payments.service');

const getWalletAndSummary = async (req, res) => {
  try {
    const data = await paymentsService.getWalletAndSummary(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب ملخص المحفظة والبيانات المالية',
    });
  }
};

const depositEscrowForMilestone = async (req, res) => {
  try {
    const data = await paymentsService.depositEscrowForMilestone(req.user.id, req.body || {});
    return res.status(200).json({
      success: true,
      message: data.message,
      data: data.data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إيداع دفعة الضمان',
    });
  }
};

const previewEscrowDeposit = async (req, res) => {
  try {
    const data = await paymentsService.previewEscrowDeposit(req.user.id, req.query || {});
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء معاينة تفاصيل دفعة الضمان',
    });
  }
};

const getEscrowMilestones = async (req, res) => {
  try {
    const data = await paymentsService.getEscrowMilestones(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب دفعات المراحل قيد الضمان',
    });
  }
};

const topUpWallet = async (req, res) => {
  try {
    const data = await paymentsService.topUpWallet(req.user.id, req.body || {});
    return res.status(200).json({
      success: true,
      message: data.message,
      data: data.data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء شحن المحفظة',
    });
  }
};

const depositToWalletCard = async (req, res) => {
  try {
    const data = await paymentsService.depositToWalletCard(req.user.id, req.body || {});
    return res.status(200).json({
      success: true,
      message: data.message,
      data: data.data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'تعذر إتمام عملية الدفع عبر البطاقة',
      code: error.code || 'PAYMENT_FAILED',
      details: error.details || null,
    });
  }
};

const getTransactions = async (req, res) => {
  try {
    const data = await paymentsService.getTransactions(req.user.id, req.query || {});
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب سجل المعاملات المالية',
    });
  }
};

const getTransactionById = async (req, res) => {
  try {
    const data = await paymentsService.getTransactionById(req.user.id, req.params.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل المعاملة المالية',
    });
  }
};

const createWithdrawalRequest = async (req, res) => {
  try {
    const data = await paymentsService.createWithdrawalRequest(req.user.id, req.body || {});
    return res.status(201).json({
      success: true,
      message: data.message,
      data: data.data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تقديم طلب الاسترداد',
    });
  }
};

const getWithdrawalRequests = async (req, res) => {
  try {
    const data = await paymentsService.getWithdrawalRequests(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب سجل طلبات الاسترداد',
    });
  }
};

const createFinancialDispute = async (req, res) => {
  try {
    const data = await paymentsService.createFinancialDispute(req.user.id, req.body || {});
    return res.status(201).json({
      success: true,
      message: data.message,
      data: data.data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء فتح النزاع المالي',
    });
  }
};

const getFinancialDisputes = async (req, res) => {
  try {
    const data = await paymentsService.getFinancialDisputes(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب قائمة النزاعات المالية',
    });
  }
};

const getTaxInvoiceDetails = async (req, res) => {
  try {
    const data = await paymentsService.getTaxInvoiceDetails(req.user.id, req.params.invoiceNumber);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل الفاتورة الضريبية',
    });
  }
};

const submitBankTransferReceipt = async (req, res) => {
  try {
    const data = await paymentsService.submitBankTransferReceipt(req.user.id, req.body || {});
    return res.status(201).json({
      success: true,
      message: data.message,
      data: data.data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء رفع إيصال التحويل البنكي',
    });
  }
};

const getBankTransferStatus = async (req, res) => {
  try {
    const data = await paymentsService.getBankTransferStatus(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب حالة التحويل البنكي',
    });
  }
};

module.exports = {
  getWalletAndSummary,
  depositEscrowForMilestone,
  previewEscrowDeposit,
  getEscrowMilestones,
  topUpWallet,
  depositToWalletCard,
  getTransactions,
  getTransactionById,
  createWithdrawalRequest,
  getWithdrawalRequests,
  createFinancialDispute,
  getFinancialDisputes,
  getTaxInvoiceDetails,
  submitBankTransferReceipt,
  getBankTransferStatus,
};
