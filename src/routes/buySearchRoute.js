const express = require('express');
const verifyJWT = require('../middleware/verifyJWT');
const { UserPurchase, PurchaseCompleted } = require('../model/buyModel');
const { ServiceStaff } = require('../model/staffModel');
const { Customer } = require('../model/userLoginModel');
const router = express.Router();

router.get('/buycount', verifyJWT, async (req, res) => {
    try {
        const counts = await UserPurchase.aggregate([
            {
                $facet: {
                    totalRequests: [{ $count: "count" }],
                    approved: [{ $match: { status: "approved" } }, { $count: "count" }],
                    pending: [{ $match: { status: "pending" } }, { $count: "count" }]
                }
            }
        ]);
        const totalCount = await PurchaseCompleted.estimatedDocumentCount();
        const result = {
            totalRequests: counts[0].totalRequests[0]?.count || 0,
            approved: counts[0].approved[0]?.count || 0,
            pending: counts[0].pending[0]?.count || 0,
            completed: totalCount
        }
        res.json(result);
    } catch (error) {
        console.error('Request count error:', error);
        res.status(500).json({ message: 'Error getting request count', error });
    }
});

router.get('/searchBuy', verifyJWT, async (req, res) => {
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

        let Model = UserPurchase;
        if (status === 'completed') {
            Model = PurchaseCompleted;
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
                path: 'staff',
                select: 'employeeName'
            })
            .select('orderId totalPrice status customer staff notes items createdAt')
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
            totalPrice: req.totalPrice,
            status: req.status,
            staffName: req.staff?.employeeName || 'Not assigned',
            staffId: req.staff?._id || '',
            comments: req.comments || '',
            notes: req.notes || '',
            totalItems: req.items?.length || 0,
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

router.get('/orderDetails/:_id', async (req, res) => {
    try {
        const {table} = req.query;
        let order = null;
        if (!table) order = await UserPurchase.findById(req.params._id).populate('items.buyItem').select('-__v -customer -updatedAt');
        else if (table === 'completed') order = await PurchaseCompleted.findById(req.params._id).populate('items.buyItem').select('-__v -customer -updatedAt');
        else if (table === 'live') order = await UserPurchase.findById(req.params._id).populate('items.buyItem').select('-__v -customer -updatedAt');
        res.status(200).json(order);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving order details', error });
    }
});

router.post('/updateBuyRequest', verifyJWT, async (req, res) => {
    const { _id, status, staffId, notes, fromStatus } = req.body;
    try {
        if (fromStatus !== 'completed' && status === 'completed') {
            const request = await UserPurchase.findById(_id);
            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }
            const moveRecord = request.toObject();
            moveRecord.status = 'completed';
            moveRecord.staff = staffId;
            moveRecord.notes = notes || request.notes || '';
            UserPurchase.collection.deleteOne({ _id: request._id });
            const completed = new PurchaseCompleted(moveRecord);
            await completed.save();
            let staffName = null;
            if (staffId) {
                staffName = await ServiceStaff.findById(moveRecord.staff).select('employeeName -_id').lean();
                staffName = staffName.employeeName;
            }
            return res.status(200).json({ _id: request._id, status, staffId: request?.staff?._id||null, staffName, notes: request.notes });
        } else if (fromStatus === 'completed' && status !== 'completed') {
            const request = await PurchaseCompleted.findById(_id);
            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }
            const moveRecord = request.toObject();
            moveRecord.status = status;
            moveRecord.staff = staffId;
            moveRecord.notes = notes || request.notes || '';

            PurchaseCompleted.collection.deleteOne({ _id: request._id });
            const completed = new UserPurchase(moveRecord);
            await completed.save();
            let staffName = null;
            if (staffId) {
                staffName = await ServiceStaff.findById(moveRecord.staff).select('employeeName -_id').lean();
                staffName = staffName.employeeName;
            }
            return res.status(200).json({ _id: request._id, status, staffId: request?.staff?._id||null, staffName, notes: request.notes });
        } else {
            let Modal = status === 'completed' ? PurchaseCompleted : UserPurchase;
            
            const request = await Modal.findById(_id);
            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }
            request.status = status || request.status;
            request.staff = staffId;
            request.notes = notes || request.notes || '';
            let staffName = null;
            if (staffId) {
                staffName = await ServiceStaff.findById(request.staff).select('employeeName -_id').lean();
                staffName = staffName.employeeName;
            }
            await request.save();
            res.status(200).json({ _id: request._id, status, staffId: request?.staff?._id||null, staffName, notes: request.notes });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

router.post('/findBuy', verifyJWT, async (req, res) => {
    try {
        //const { orderId, fullName, mobile, startDate, endDate } = req.body;

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
            UserPurchase.aggregate(buildAggregation('live')),
            PurchaseCompleted.aggregate(buildAggregation('completed'))
        ]);
        const combined = [...userPurchases, ...completedPurchases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
        const mapped = combined.map(req => ({
            _id: req._id,
            orderId: req.orderId,
            customerName: req.customer?.fullName || 'N/A',
            customerId: req.customer?._id || '',
            customerAddress: req.customer?.address || 'N/A',
            customerMobile: req.customer?.mobile || 'N/A',
            status: req.status,
            staffName: req.staff?.employeeName || 'Not assigned',
            staffId: req.staff?._id || '',
            notes: req.notes || '',
            totalItems: req.items?.length || 0,
            createdAt: req.createdAt,
            table: req.table,
            totalPrice: req.totalPrice,
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

router.delete('/deleteBuy/:_id', verifyJWT, async (req, res) => {
    const { _id } = req.params;
    const {table} = req.query;
    try {
        const modal = table === 'live' ? UserPurchase : table === 'completed' ? PurchaseCompleted : null;
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


module.exports = router;