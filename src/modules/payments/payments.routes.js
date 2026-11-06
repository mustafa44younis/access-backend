const express = require('express');
const router = express.Router();
const paymentsController = require('./payments.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

// حماية جميع مسارات المدفوعات والضمان
router.use(protect);

// 1. ملخص المحفظة ورصيد الضمان وإجمالي المصروفات (الشاشة 3)
router.get('/wallet', paymentsController.getWalletAndSummary);

// 2. جدول دفعات المراحل قيد الضمان في المحفظة (جدول منتصف الشاشة 3)
router.get('/escrow-milestones', paymentsController.getEscrowMilestones);

// 3. معاينة تفاصيل حجز دفعة الضمان قبل التأكيد (نافذة يمين الشاشة 3)
router.get('/escrow/preview', paymentsController.previewEscrowDeposit);

// 4. تأكيد حجز وإيداع دفعة مرحلة البداية بحساب الضمان (المرحلة 3 في شريط التقدم)
router.post('/escrow/deposit', paymentsController.depositEscrowForMilestone);

// 5. شحن المحفظة السريع عبر البطاقة الائتمانية / مدى (نافذة وسط الشاشة 3)
router.post('/wallet/deposit-card', paymentsController.depositToWalletCard);
router.post('/wallet/topup', paymentsController.topUpWallet);

// 6. طلب استرداد الرصيد المتاح إلى الحساب البنكي (نافذة يسار الشاشة 4)
router.post('/withdraw', paymentsController.createWithdrawalRequest);
router.get('/withdrawals', paymentsController.getWithdrawalRequests);

// 7. فتح تذكرة نزاع مالي وتدخل الإدارة لفض النزاع (نافذة وسط الشاشة 4)
router.post('/disputes', paymentsController.createFinancialDispute);
router.get('/disputes', paymentsController.getFinancialDisputes);

// 8. سجل المعاملات المالية والفواتير
router.get('/transactions', paymentsController.getTransactions);
router.get('/transactions/:id', paymentsController.getTransactionById);

// 9. معاينة الفاتورة الضريبية المبسطة ZATCA المعتمدة (نافذة يمين الشاشة 4)
router.get('/invoices/:invoiceNumber', paymentsController.getTaxInvoiceDetails);

// 10. رفع وتدقيق إيصال التحويل البنكي المحاسبي (نافذة يمين الشاشة 5)
router.post('/bank-transfers/receipt', paymentsController.submitBankTransferReceipt);
router.get('/bank-transfers/status', paymentsController.getBankTransferStatus);

module.exports = router;
