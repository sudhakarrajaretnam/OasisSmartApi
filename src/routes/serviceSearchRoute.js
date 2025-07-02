const express = require('express');
const verifyJWT = require('../middleware/verifyJWT');
const { RequestService, RequestCompleted } = require('../model/serviceModel');
const { Customer } = require('../model/userLoginModel');
const router = express.Router();

router.get('/requestcount', verifyJWT, async (req, res) => {
    try {
        const counts = await RequestService.aggregate([
            {
                $facet: {
                    totalRequests: [{ $count: "count" }],
                    assigned: [{ $match: { status: "assigned" } }, { $count: "count" }],
                    pending: [{ $match: { status: "pending" } }, { $count: "count" }]
                }
            }
        ]);
        const totalCount = await RequestCompleted.estimatedDocumentCount();
        const result = {
            totalRequests: counts[0].totalRequests[0]?.count || 0,
            assigned: counts[0].assigned[0]?.count || 0,
            pending: counts[0].pending[0]?.count || 0,
            completed: totalCount
        }
        res.json(result);
    } catch (error) {
        console.error('Request count error:', error);
        res.status(500).json({ message: 'Error getting request count', error });
    }
});

router.get('/searchService', verifyJWT, async (req, res) => {
    try {
        let { status, startDate, endDate, page, limit, isGetTotal } = req.query;
        const filter = {};
        status = status || 'all';
        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10; // Default limit to 10 items per page
        const skip = (page - 1) * limit;

        if (startDate && endDate) {
            filter.selectDate = { 
                $gte: new Date(startDate), 
                $lte: new Date(endDate) 
            };
        }

        let Model = RequestService;
        if (status === 'completed') {
            Model = RequestCompleted;
        }
        if (status !== 'all') {
            filter.status = status;
        }
        let totalCount = 0;
        if (isGetTotal) {
            totalCount = await Model.countDocuments(filter);
        }
        const results = await Model.find(filter)
            .populate({
                path: 'customer',
                select: 'fullName address mobile'
            })
            .populate({
                path: 'service',
                select: 'serviceName imagePath'
            })
            .populate({
                path: 'staff',
                select: 'employeeName'
            })
            .select('orderId selectDate selectTime price status customer service staff comments notes createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        const responseData = results.map(req => ({
            _id: req._id,
            orderId: req.orderId,
            customerName: req.customer?.fullName || 'N/A',
            customerId: req.customer?._id || '',
            customerAddress: req.customer?.address || 'N/A',
            customerMobile: req.customer?.mobile || 'N/A',
            selectDate: req.selectDate,
            selectTime: req.selectTime,
            price: req.price,
            status: req.status,
            serviceName: req.service?.serviceName || 'N/A',
            staffName: req.staff?.employeeName || 'Not Assigned',
            staffId: req.staff?._id || '',
            imagePath: req.service?.imagePath || '',
            comments: req.comments || '',
            notes: req.notes || '',
            createdAt: req.createdAt,
        }));
        const result = {
            success: true, data: responseData
        }
        if (isGetTotal) {
            result.pagination = {
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: page,
                pageSize: limit
            }
        }
        res.json(result);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Error searching services', error });
    }
});

const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

router.post('/findService', verifyJWT, async (req, res) => {
    try {
        const { searchBy, searchValue, startDate, endDate } = req.body;
        const orderId = searchBy === 'orderId' ? searchValue : null;
        const fullName = searchBy === 'customerName' ? searchValue : null;
        const mobile = searchBy === 'customerMobile' ? searchValue : null;

        const matchConditions = [];
        if (orderId) {
            matchConditions.push({ orderId: Number(orderId) });
        }
        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate) dateFilter.$gte = new Date(startDate);
            if (endDate) dateFilter.$lte = new Date(endDate);
            matchConditions.push({ createdAt: dateFilter });
        }
        let customerIds = [];
        if (fullName || mobile) {
            const customerQuery = {};
            if (fullName) {
                const escapedName = escapeRegex(fullName);
                customerQuery.fullName = new RegExp('^' + escapedName, 'i');
              }
            if (mobile) {
                const escapedMobile = escapeRegex(mobile);
                customerQuery.mobile = {
                    $regex: new RegExp(`(\\+\\d{1,4})?${escapedMobile}`),
                    $options: 'i'
                };
            }
      
            const customers = await Customer.find(customerQuery).select('_id');
            customerIds = customers.map(c => c._id);
      
            if (customerIds.length) {
                matchConditions.push({ customer: { $in: customerIds } });
            } else {
                return res.status(200).json({success: true, data: []});
            }
        }
        const finalMatch = matchConditions.length ? { $and: matchConditions } : {};
        const buildAggregation = (tableLabel) => ([
            { $match: finalMatch },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            { $unwind: '$customer' },
            {
                $lookup: {
                    from: 'servicestaffs',
                    localField: 'staff',
                    foreignField: '_id',
                    as: 'staff'
                }
            },
            {
                $addFields: {
                    staff: { $arrayElemAt: ['$staff', 0] }
                }
            },
            {
                $addFields: {
                    table: tableLabel
                }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 100 }
        ]);
        const [userPurchases, completedPurchases] = await Promise.all([
            RequestService.aggregate(buildAggregation('live')),
            RequestCompleted.aggregate(buildAggregation('completed'))
        ]);
        const combined = [...userPurchases, ...completedPurchases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
        const mapped = combined.map(req => ({
            _id: req._id,
            orderId: req.orderId,
            customerName: req.customer?.fullName || 'N/A',
            customerId: req.customer?._id || '',
            customerAddress: req.customer?.address || 'N/A',
            customerMobile: req.customer?.mobile || 'N/A',
            selectDate: req.selectDate,
            selectTime: req.selectTime,
            price: req.price,
            status: req.status,
            serviceName: req.service?.serviceName || 'N/A',
            staffName: req.staff?.employeeName || 'Not Assigned',
            staffId: req.staff?._id || '',
            imagePath: req.service?.imagePath || '',
            comments: req.comments || '',
            notes: req.notes || '',
            createdAt: req.createdAt,
        }));
        const result = {
            success: true, data: mapped
        }
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/deleteServiceInTable/:_id', verifyJWT, async (req, res) => {
    const { _id } = req.params;
    const {table} = req.query;
    try {
        const modal = table === 'live' ? RequestService : table === 'completed' ? RequestCompleted : null;
        if (!modal) {
            return res.status(400).json({ message: 'Invalid table name' });
        }
        const request = await modal.findById(_id);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        await modal.deleteOne({ _id });
        res.status(200).json({ message: 'Request deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
    
});

// router.get('/test', async (req, res) => {
//     res.json({ message: 'Service search route works' });
// });

module.exports = router;