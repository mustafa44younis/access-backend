const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

router.use(protect);

router.get('/overview', dashboardController.getOverview);

module.exports = router;
