const express = require('express');
const { Customer } = require('../../model/userLoginModel');
const { Services, ServicesItem, RequestService, RequestCompleted } = require('../../model/serviceModel');

const router = express.Router();

router.get('/getServices', async (req, res) => {
    try {
        const search = req.query.search || ''; 
        const regex = new RegExp(search, 'i'); 

        const services = await Services.find({ title: { $regex: regex }, disabled: false })
            .sort({ title: 1 })
            .select('title imagePath');
            //.select('title noOfPersons workingHours price imagePath');

        res.status(200).json(services);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving services', error });
    }
});

router.get('/items/:serviceId', async (req, res) => {
    const { serviceId } = req.params;
    try {
        const query = { service: serviceId, disabled: false };
        const items = await ServicesItem.find(query).sort({ itemName: 1 }).select('-__v -service -createdAt -updatedAt');
        res.status(200).json(items);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving items', error });
    }
});

router.post('/purchaseRequest', async (req, res) => {
    try {
        const { userId, cartItems, fullName, address, pincode, isNew} = req.body;
        const savedRequests = [];
        for (const item of cartItems) {
            const request = new RequestService({
                customer: userId,
                service: item.serviceId,
                price: item.price,
                quantity: item.quantity,
                notes: item.comment,
                selectDate: item.selectDate,
                selectTime: item.selectTime,
                status: 'pending',
                comments: '',
            });
        
            const savedRequest = await request.save(); // Triggers pre-save hook for orderId
            savedRequests.push(savedRequest);
        }
        // const requests = cartItems.map(item => ({
        //     customer: userId,
        //     service: item.serviceId,
        //     price: item.price,
        //     quantity: item.quantity,
        //     notes: item.comments,
        //     selectDate: item.selectDate,
        //     selectTime: item.selectTime,
        //     status: 'pending',
        //     comments: '',
        // }));
        // const savedRequests = await RequestService.insertMany(requests, { ordered: true, rawResult: true });
        const requestIds = savedRequests.map(request => request._id);
        const populatedRequests = await RequestService.find({ _id: { $in: requestIds } })
            .populate('service', 'serviceName')
            .exec();
        const result = populatedRequests.reduce((acc, request) => {
            acc._id.push(request._id);
            acc.orderId.push(request.orderId);
            acc.serviceName.push(request.service.serviceName);
            return acc;
        }, {_id: [], orderId: [], serviceName: []});

        if (isNew) {
            let user = await Customer.findById(userId);
            user.fullName = fullName;
            user.address = address;
            user.zip = pincode;
            await user.save();
        }
        return res.status(200).json({ success: true, recId: result._id, orderId: result.orderId, serviceName: result.serviceName, createdAt: new Date(), message: 'Purchase submitted successfully!' });
    } catch (error) {
        console.error('Error submitting purchase:', error);
        return { success: false, message: 'Failed to submit purchase.' };
    }
});

router.put('/addaddress', async (req, res) => {
    try {
        const { userId, fullName, address, pincode } = req.body;
        let user = await Customer.findById(userId);
        if (!user) {
            user = new Customer({ _id: userId, fullName, address, zip: pincode });
        } else {
            user.fullName = fullName;
            user.address = address;
            user.zip = pincode;
        }
        await user.save();
        res.status(200).json({ message: 'Address added successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error adding address', error });
    }
});

router.get('/orderDetails/:_id', async (req, res) => {
    try {
        let order = await RequestService.findById(req.params._id)
            .populate('service')
            .populate({path: 'staff', select:'employeeName employeeMobile'})
            .select('-__v -customer -updatedAt');
        if (!order) {
            order = await RequestCompleted.findById(req.params._id)
                .populate('service')
                .populate({path: 'staff', select:'employeeName employeeMobile'})
                .select('-__v -customer -updatedAt');
        }
        const result = order.toObject();
        const out = {
            serviceName: result.service.serviceName,
            noOfPersons: result.service.noOfPersons,
            workingHours: result.service.workingHours,
            imageUrl: result.service.imagePath,
            price: result.price,
            quantity: result.quantity,
            selectDate: result.selectDate,
            selectTime: result.selectTime,
            status: result.status,
            comments: result.comments,
            notes: result.notes||'',
            staffName: result.staff?.employeeName || '',
            staffMobile: result.staff?.employeeMobile || '',
        }
        //console.log(out);
        res.status(200).json(out);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving order details', error });
    }
});

router.get('/searchItems/:resultType', async (req, res) => {
    try {
        const { resultType } = req.params;
        const { search } = req.query;
        let formattedCategories  = [], formattedBuyingItems = [];
        if (resultType === 'both') {
            const categoryResults = await Services.find({
                title: { $regex: search, $options: 'i' },
                disabled: false // Case-insensitive search on 'title'
            }).select('title imagePath _id');
            formattedCategories = categoryResults.map(cat => ({
                title: cat.title,
                imagePath: cat.imagePath,
                _id: cat._id,
                price: 0,
                noOfPersons: 0,
                workingHours: 0,
                description: '',
                type: 'group'
            }));
        }
        if (resultType === 'items' || resultType === 'both') {
            const buyingItemsResults = await ServicesItem.find({
                serviceName: { $regex: search, $options: 'i' },
                disabled: false // Case-insensitive search on 'itemName'
            }).select('serviceName imagePath _id price noOfPersons workingHours description');
            formattedBuyingItems = buyingItemsResults.map(item => ({
                title: item.serviceName,
                imagePath: item.imagePath,
                _id: item._id,
                price: item.price,
                noOfPersons: item.noOfPersons,
                workingHours: item.workingHours,
                description: item.description,
                type: 'item' // Mark as item
            }));
        }
        const combinedResults = [...formattedCategories, ...formattedBuyingItems];
        //console.log(combinedResults);
        res.status(200).json(combinedResults);
    } catch (error) {
        console.error('Error searching items:', error);
        res.status(500).json({ message: 'Error retrieving items', error });
    }
});


module.exports = router;
