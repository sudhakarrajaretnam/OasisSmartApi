const express = require('express');
const mongoose = require('mongoose');
const { Category, BuyingItems, UserPurchase, PurchaseCompleted } = require("../../model/buyModel");
const { Customer } = require('../../model/userLoginModel');
const sendOrderMail = require('../../utils/sendOrderMail');

const router = express.Router();
const { Types } = mongoose;

const isValidObjectId = (value) => Types.ObjectId.isValid(value);

router.get('/categories', async (req, res) => {
    try {
        const search = req.query.search || ''; 
        const regex = new RegExp(search, 'i'); 

        const categories = await Category.find({ title: { $regex: regex }, disabled: false })
            .sort({ title: 1 })
            .select('title imagePath');

        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving categories', error });
    }
});

router.get('/searchItems/:resultType', async (req, res) => {
    try {
        const { resultType } = req.params;
        const { search } = req.query;
        let formattedCategories  = [], formattedBuyingItems = [];
        if (resultType === 'both') {
            const categoryResults = await Category.find({
                title: { $regex: search, $options: 'i' },
                disabled: false // Case-insensitive search on 'title'
            }).select('title imagePath');
            formattedCategories = categoryResults.map(cat => ({
                title: cat.title,
                itemCode: "",
                imagePath: cat.imagePath,
                _id: cat._id,
                discountPrice: 0,
                quantity: 0,
                unit: '',
                description: '',
                type: 'group'
            }));
        }
        if (resultType === 'items' || resultType === 'both') {
            const buyingItemsResults = await BuyingItems.find({
                itemName: { $regex: search, $options: 'i' } ,
                disabled: false
            }).select('itemName itemCode imagePath discountPrice quantity unit description');
            formattedBuyingItems = buyingItemsResults.map(item => ({
                title: item.itemName,
                imagePath: item.imagePath,
                itemCode: item.itemCode,
                _id: item._id,
                discountPrice: item.discountPrice,
                quantity: item.quantity,
                unit: item.unit,
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

router.get('/items/:categoryId', async (req, res) => {
    const { categoryId } = req.params;
    const { search } = req.query;
    try {
        const query = { category: categoryId, disabled: false };
        if (search) {
            query.itemName = { $regex: search, $options: 'i' };
        }

        const items = await BuyingItems.find(query).sort({ itemName: 1 }).select('-__v -caetgory -createdAt -updatedAt');
        res.status(200).json(items);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving items', error });
    }
});

router.post('/purchaseRequest', async (req, res) => {
    try {
        const { userId, cartItems, fullName, address, pincode, isNew} = req.body;
        const items = cartItems.map(item => ({
            buyItem: item.buyItem,
            price: item.price,
            quantity: item.quantity
        }));
        const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const purchase = new UserPurchase({
            customer: userId,
            items,
            totalPrice
        });
        await purchase.save();
        if (isNew) {
            let user = await Customer.findById(userId);
            user.fullName = fullName;
            user.address = address;
            user.zip = pincode;
            await user.save();
        }
        return res.status(200).json({ success: true, recId: purchase._id, orderId: purchase.orderId, createdAt: purchase.createdAt, message: 'Purchase submitted successfully!' });
    } catch (error) {
        console.error('Error submitting purchase:', error);
        return { success: false, message: 'Failed to submit purchase.' };
    }
});



router.post('/v2/purchaseRequest', async (req, res) => {
    try {
        console.log('[POST /mobile/grocery/v2/purchaseRequest] req.body:', req.body);

        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Request body is required. Send JSON with Content-Type: application/json.'
            });
        }

        const { userId, cartItems, fullName, address, pincode, isNew } = req.body;
        console.log('[POST /mobile/grocery/v2/purchaseRequest] userId:', userId);
        console.log('[POST /mobile/grocery/v2/purchaseRequest] cartItems:', cartItems);

        if (!isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid userId.'
            });
        }

        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'cartItems must be a non-empty array.'
            });
        }

        const invalidCartItem = cartItems.find((item) => !item || !isValidObjectId(item.buyItem));
        if (invalidCartItem) {
            return res.status(400).json({
                success: false,
                message: 'One or more buyItem values are invalid.'
            });
        }

        const invalidPriceOrQuantity = cartItems.find((item) => {
            const price = Number(item.price);
            const quantity = Number(item.quantity);
            return Number.isNaN(price) || price < 0 || Number.isNaN(quantity) || quantity <= 0;
        });

        if (invalidPriceOrQuantity) {
            return res.status(400).json({
                success: false,
                message: 'Each cart item must have a valid price and quantity.'
            });
        }

        const customer = await Customer.findById(userId);
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found.'
            });
        }

        const uniqueBuyItemIds = [...new Set(cartItems.map((item) => item.buyItem))];
        const existingItems = await BuyingItems.find({ _id: { $in: uniqueBuyItemIds } }).select('_id');
        if (existingItems.length !== uniqueBuyItemIds.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more cart items were not found.'
            });
        }

        const items = cartItems.map(item => ({
            buyItem: item.buyItem,
            price: Number(item.price),
            quantity: Number(item.quantity)
        }));

        const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const purchase = new UserPurchase({
            customer: userId,
            items,
            totalPrice
        });

        await purchase.save();
        console.log('[POST /mobile/grocery/v2/purchaseRequest] saved purchase:', purchase.toObject());

        if (isNew) {
            customer.fullName = fullName || customer.fullName;
            customer.address = address || customer.address;
            customer.zip = pincode || customer.zip;
            await customer.save();
        }

        const purchaseWithItems = await UserPurchase.findById(purchase._id)
            .populate('items.buyItem')
            .populate('customer');
        console.log(
            '[POST /mobile/grocery/v2/purchaseRequest] populated purchaseWithItems:',
            purchaseWithItems ? purchaseWithItems.toObject() : null
        );

        try {
            const mailInfo = await sendOrderMail({
                customer: purchaseWithItems.customer,
                order: purchaseWithItems,
                items: purchaseWithItems.items
            });
            console.log(
                '[POST /mobile/grocery/v2/purchaseRequest] mail sending success:',
                mailInfo?.response || mailInfo?.messageId || mailInfo
            );
        } catch (mailError) {
            console.error('[POST /mobile/grocery/v2/purchaseRequest] mail sending failure:', mailError);
        }

        return res.status(200).json({
            success: true,
            recId: purchase._id,
            orderId: purchase.orderId,
            createdAt: purchase.createdAt,
            message: 'Purchase submitted successfully!'
        });

    } catch (error) {
        console.error('[POST /mobile/grocery/v2/purchaseRequest] Error submitting purchase:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to submit purchase.',
            error: error.message
        });
    }
});

router.get('/orderDetails/:_id', async (req, res) => {
    try {
        let order = await UserPurchase.findById(req.params._id).populate('items.buyItem').select('-__v -customer -updatedAt');
        if (!order) {
            order = await PurchaseCompleted.findById(req.params._id).populate('items.buyItem').select('-__v -customer -updatedAt');
        }
        res.status(200).json(order);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving order details', error });
    }
});


module.exports = router;
