const jwt = require('jsonwebtoken');

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({message: 'Unauthorized'})
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        (err, decoded) => {
            if (err) return res.status(403).json({message: 'Forbidden'});
            req.user = decoded.userInfo.username;
            req.userId = decoded.userInfo.userId;
            req.role = decoded.userInfo.role;
            req.roles = decoded.userInfo.roles ?? decoded.userInfo.role;
            req.fullName = decoded.userInfo.fullName;
            next();
        }
    )
}

module.exports = verifyJWT;