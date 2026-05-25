const verifyAdmin = (req, res, next) => {
    if (req.role !== 1) {
        return res.status(403).json({ message: 'Admin access only' });
    }

    next();
};

module.exports = verifyAdmin;