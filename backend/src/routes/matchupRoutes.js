const express = require('express');
const matchupController = require('../controllers/matchupController');

const router = express.Router();

router.get('/analyze', matchupController.analyze);

module.exports = router;
