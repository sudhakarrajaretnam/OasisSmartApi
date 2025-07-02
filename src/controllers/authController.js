const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const  { UserBasicInfo } = require('../model/userLoginModel');

const login = asyncHandler(async (req, res) => {
    const { userName, password } = req.body;
    const user = await UserBasicInfo.findOne({userName});
    if (!user) {
        return res.status(401).json({message: 'Invalid email or password'});
    }
    const validcheck = await bcrypt.compare(password, user.password);            
    if (!validcheck) {
        res.status(401).json({message: 'Invalid email or password'});
    }
    const userInfo = {
        userId: user._id,
        role: 1,
        fullName: `${user.fullName}`
    };
    const accessToken = jwt.sign(
        { userInfo },
        process.env.ACCESS_TOKEN_SECRET, { expiresIn: process.env.ACCESS_EXPIRE }
    );
    const refreshToken = jwt.sign(
        {
            userId: userInfo.userId,
            role: 1
        },
        process.env.REFRESH_TOKEN_SECRET, { expiresIn: process.env.REFRESH_EXPIRE }
    );

    return res.cookie('jwt', refreshToken, {
        httpOnly: true,
        secure: process.env.SAME_SITE === 'none' ? true : false,
        sameSite: process.env.SAME_SITE,
        maxAge: 7 * 24 * 60 * 60 * 1000,
    }).status(200).json({
        accessToken,
        userInfo
    });
});

const refresh = (req, res) => {
    try {
        const cookies = req.cookies;
        if (!cookies?.jwt) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const refreshToken = cookies.jwt;
        jwt.verify(
            refreshToken,
            process.env.REFRESH_TOKEN_SECRET,
            asyncHandler(async (err, decoded) => {
                if (err) {
                    return res.status(403).json({ message: 'Forbidden' });
                } else {
                    const foundUser = await UserBasicInfo.findById(decoded.userId);
                    if (!foundUser) {
                        return res.status(401).json({ message: 'Unauthorized' });
                    } else {
                        const accessToken = jwt.sign(
                            {
                                userInfo : {
                                    userId: foundUser._id,
                                    role: decoded.role,
                                    fullName: `${foundUser.fullName}`
                                }
                            },
                            process.env.ACCESS_TOKEN_SECRET, 
                            { expiresIn: process.env.ACCESS_EXPIRE }
                        );
                        return res.json({ accessToken });
                    }
                }
            })
        );
    } catch (err) {
        return res.status(403).json({ message: 'Forbidden' });
    }
};

const logout = (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204);
    res.clearCookie('jwt', 
        { 
            httpOnly: true, 
            sameSite: process.env.SAME_SITE,
            secure: process.env.SAME_SITE === 'none' ? true : false, 
        }
    );
    return res.json({ message: 'Cookie cleared' });
};

const verify = (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) {
        return res.status(401).json({ message: 'Unauthorized' });
    } else {
        const refreshToken = cookies.jwt;
        jwt.verify(
            refreshToken,
            process.env.REFRESH_TOKEN_SECRET,
            asyncHandler(async (err, decoded) => {
                if (err) {
                    return res.status(403).json({ message: 'Forbidden' });
                } else {
                    const foundUser = await UserBasicInfo.findById(decoded.userId);
                    if (!foundUser) {
                        return res.status(401).json({ message: 'Unauthorized' });
                    } else {
                        //const obj = foundUser.toObject();
                        const obj =  {
                            userId: foundUser._id,
                            role: decoded.role,
                            fullName: `${foundUser.fullName}`
                        };
                        const accessToken = jwt.sign(
                            {
                                userInfo: obj
                            },
                            process.env.ACCESS_TOKEN_SECRET, { expiresIn: process.env.ACCESS_EXPIRE }
                        );
                        const refreshToken = jwt.sign(
                            { 
                                userId: obj.userId,
                                role: obj.role
                            },
                            process.env.REFRESH_TOKEN_SECRET, { expiresIn: process.env.REFRESH_EXPIRE }
                        );
                        return res.cookie('jwt', refreshToken, 
                            {
                                httpOnly: true,
                                secure: process.env.SAME_SITE === 'none' ? true : false,
                                sameSite: process.env.SAME_SITE,
                                maxAge: 7 * 24 * 60 * 60 * 1000,
                            }
                        ).status(200).json({ accessToken, userInfo: obj });
                    }
                }
            })
        );
    }
};
module.exports = {
    login,
    refresh,
    logout,
    verify
};