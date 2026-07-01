const express = require('express');
const { authenticate, requireSuperAdmin } = require('../../middleware/auth');
const adminRoutes = require('./users');
const providersRoutes = require('./providers');
const browserProfilesRoutes = require('./browserProfiles');
const platformRoutes = require('./platform');

const router = express.Router();
router.use(authenticate);
router.use(requireSuperAdmin);

router.use('/users', adminRoutes);
router.use('/providers', providersRoutes);
router.use('/browser-profiles', browserProfilesRoutes);
router.use('/', platformRoutes);

module.exports = router;
