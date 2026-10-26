const express = require('express');
const router = express.Router();
const projectsController = require('./projects.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

router.use(protect);

router.get('/', projectsController.getProjects);
router.post('/', projectsController.createProject);
router.get('/:id', projectsController.getProjectById);

module.exports = router;
