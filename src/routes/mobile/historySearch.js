const express = require('express');
//const { Category, BuyingItems, UserPurchase } = require("../../model/buyModel");
//const { Customer } = require('../../model/userLoginModel');
const {  UserPurchase } = require("../../model/buyModel");
const { default: mongoose } = require('mongoose');
const { RequestService } = require('../../model/serviceModel');

const router = express.Router();
router.get('/orderHistory/:customerId', async (req, res) => {
    const { page = 1, limit } = req.query; // Default to page 1, limit 50
    try {
        // const orders = await UserPurchase.find({ customer: req.params.customerId })
        // //.populate('items.buyItem')
        // .select('-__v -items -customer -updatedAt')
        // .sort({ date: -1 })
        // .skip((page - 1) * limit)
        // .limit(parseInt(limit));

        // const orders = Array.from({ length: 20 }, (_, i) => ({
        //     _id: page + 1,
        //     createdAt: new Date(),
        //     status: 'pending',
        //     totalPrice: 600 * (page + 1),
        // }));
        const customerId = new mongoose.Types.ObjectId(req.params.customerId);
        const orders = await UserPurchase.aggregate([
            { 
                $match: { customer: customerId }
            },
            {
                $unionWith: {
                    coll: 'purchasecompleteds', // Ensure this is the correct collection name in MongoDB
                    pipeline: [
                        { $match: { customer: customerId } }
                    ]
                }
            },
            {
                $addFields: { toalItems: { $size: "$items" } }
            },
            {
                $project: {
                    __v: 0,
                    items: 0,
                    customer: 0,
                    updatedAt: 0
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
        ]);


        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/serviceHistory/:customerId', async (req, res) => {
    const { page = 1, limit = 50 } = req.query; // Default to page 1, limit 50
    try {
        const customerId = new mongoose.Types.ObjectId(req.params.customerId);
        
        const services = await RequestService.aggregate([
            {
                $match: { customer: customerId }
            },
            {
                $unionWith: {
                    coll: 'servicecompleteds', // Ensure this is the correct collection name in MongoDB
                    pipeline: [
                        { $match: { customer: customerId } }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'servicesitems',
                    let: { serviceId: '$service' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$_id', '$$serviceId'] }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                serviceName: 1,
                                noOfPersons: 1,
                                imagePath: 1
                            }
                        }
                    ],
                    as: 'serviceDetails'
                }
            },
            {
                $unwind: { path: '$serviceDetails', preserveNullAndEmptyArrays: true }
            },
            {
                $project: {
                    __v: 0,
                    customer: 0,
                    updatedAt: 0,
                    service: 0,
                    comments: 0
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
        ]);

        return res.status(200).json({ success: true, data: services });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
module.exports = router;