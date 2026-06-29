const express = require('express');
const { authenticate, requireSuperAdmin } = require('../../middleware/auth');
const adminRoutes = require('./users');
const providersRoutes = require('./providers');

const router = express.Router();
router.use(authenticate);
router.use(requireSuperAdmin);

router.use('/users', adminRoutes);
router.use('/providers', providersRoutes);

module.exports = router;
