const express = require('express');
const router = express.Router();
const UploadController = require('../controllers/uploadController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/image', requireAuth, UploadController.uploadImage);
router.delete('/:name', requireAuth, UploadController.discardImage);

module.exports = router;
