const express = require('express');
const verifyJWT = require('../middleware/verifyJWT');
const verifyAdmin = require('../middleware/verifyAdmin');
const { Customer } = require('../model/userLoginModel');

const router = express.Router();

router.get('/count', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const totalCustomers = await Customer.countDocuments();
        res.status(200).json({ totalCustomers });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving customer count', error });
    }
});

module.exports = router;