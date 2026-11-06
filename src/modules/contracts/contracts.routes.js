const express = require('express');
const router = express.Router();
const contractsController = require('./contracts.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

// حماية جميع مسارات العقود والاستشارات
router.use(protect);

// 1. مسارات الاستشارة الذكية والمحادثة والملخص الحي
router.get('/consultations', contractsController.getConsultations);
router.post('/consultations', contractsController.createConsultation);
router.get('/consultations/:id', contractsController.getConsultationDetails);
router.put('/consultations/:id/brief', contractsController.updateConsultationBrief);
router.post('/consultations/:id/messages', contractsController.addConsultationMessage);

// 2. مسارات حجز الاستشارة مع مستشار تقني بشري (مطابق للشاشة 2 يساراً)
router.get('/experts', contractsController.getExperts);
router.post('/experts/book', contractsController.bookExpertSession);
router.get('/experts/my-bookings', contractsController.getClientExpertBookings);

// 3. مسارات العقود المبدئية والاعتماد
router.get('/consultations/:consultationId/contract', contractsController.getContractByConsultationId);
router.get('/:contractId', contractsController.getContractById);
router.post('/:contractId/sign', contractsController.signContract);

module.exports = router;
