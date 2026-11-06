const express = require('express');
const router = express.Router();
const milestonesController = require('./milestones.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

router.use(protect);

router.get('/:id/review', milestonesController.getMilestoneReview);
router.post('/:id/request-changes', milestonesController.requestChanges);
router.post('/:id/approve', milestonesController.approveMilestone);
router.get('/projects/:projectId/final-delivery', milestonesController.getFinalDelivery);
router.post('/projects/:projectId/final-signoff', milestonesController.finalSignoff);

module.exports = router;
