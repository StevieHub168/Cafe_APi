const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// Everything here is for admins only.
router.use(requireAuth, requireAdmin);

// GET /api/users - everyone who can sign in
router.get('/', UserController.list);

// PUT /api/users/:id/password - set a new password for a user
router.put('/:id/password', UserController.resetPassword);

module.exports = router;
