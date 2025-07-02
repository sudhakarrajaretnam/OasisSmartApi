const express = require('express');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const { Category, BuyingItems } = require('../model/buyModel');
const sharp = require('sharp');
const verifyJWT = require('../middleware/verifyJWT');
const router = express.Router();

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerName = process.env.AZURE_CONTAINER_NAME;

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/gif'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only images (jpg, jpeg, png, bmp, gif) are allowed!'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB size limit
});

const uploadToAzureBlob = async (buffer, filename, mimeType) => {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimeType },
    });

    return blockBlobClient.url;
};

async function deleteBlob(blobName) {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
}

// router.get('/test', async (req, res) => {
//     try {
//         await deleteBlob('1736431460795-buy-cat-item_apple.png');
//         res.status(200).json({ message: 'Blob deleted' });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Internal server error' });
//     }
// });

router.post('/addcategory', upload.single('flyerImage'), async (req, res) => {
    try {
        const { title } = req.body;
        const imageFile = req.file;
        if (!imageFile) {
            return res.status(400).json({ message: 'Image file is required' });
        }
        const originalImageBuffer = await sharp(imageFile.buffer).resize({ width: 1000, withoutEnlargement: true }).toBuffer();
        const imagePath = await uploadToAzureBlob(originalImageBuffer, `${Date.now()}-buy-cat-${imageFile.originalname}`, imageFile.mimetype);
        const category = new Category({ title, imagePath, disabled: false });
        await category.save();
        res.status(201).json(category);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/updateCategory/:_id', upload.single('flyerImage'), async (req, res) => {
    const { _id } = req.params;
    const { title } = req.body; 
    try {
        const category = await Category.findById(_id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        if (category.imagePath) {
            const oldBlobName = category.imagePath.split('/').pop(); // Extract blob name from URL
            await deleteBlob(oldBlobName);
        }
        let imageFile = category.imagePath;
        if (req.file) {
            const originalImageBuffer = await sharp(req.file.buffer).resize({ width: 1000, withoutEnlargement: true }).toBuffer();
            imageFile = await uploadToAzureBlob(originalImageBuffer, `${Date.now()}-buy-cat-${req.file.originalname}`, req.file.mimetype);
        }
        category.title = title || category.title;
        category.imagePath = imageFile;
        await category.save();
        res.status(201).json(category);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/categories', verifyJWT, async (req, res) => {
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


router.delete('/deleteCategory/:_id', verifyJWT, async (req, res) => {
    const { _id } = req.params;
    try {
        const categories = await Category.findById(_id);
        if (!categories) {
            return res.status(404).json({ error: 'Items not found' });
        }
        // if (buyItem.imagePath) {
        //     const oldBlobName = buyItem.imagePath.split('/').pop(); // Extract blob name from URL
        //     await deleteBlob(oldBlobName);
        // }
        // await Services.findByIdAndDelete(_id);
        categories.disabled = true;
        await categories.save();
        res.status(200).json({ message: 'Item deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/items/:categoryId', verifyJWT, async (req, res) => {
    const { categoryId } = req.params;
    try {
        const category = await BuyingItems.find({ category: categoryId, disabled: false })
        .populate("category", "title")
        .sort({ itemName: 1 });
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving items', error });
    }
});

router.post('/addItems', upload.single('flyerImage'), async (req, res) => {
    try {
        const {
            category,
            itemCode,
            itemName,
            stock,
            quantity,
            unit,
            price,
            discountPrice,
            discount,
            description 
        } = req.body;
        
        const imageFile = req.file;
        if (!imageFile) {
            return res.status(400).json({ message: 'Image file is required' });
        }
        const originalImageBuffer = await sharp(imageFile.buffer).resize({ width: 1000, withoutEnlargement: true }).toBuffer();
        const imagePath = await uploadToAzureBlob(originalImageBuffer, `${Date.now()}-buy-itm-${imageFile.originalname}`, imageFile.mimetype);
        const items = new BuyingItems({ category, itemCode, itemName, stock, quantity, unit, price, discountPrice, discount, description, imagePath });
        const savedItem = await items.save();
        const populatedItem = await BuyingItems.findById(savedItem._id).populate('category', 'title');
        res.status(201).json(populatedItem);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/updateItems/:_id', upload.single('flyerImage'), async (req, res) => {
    const { _id } = req.params;
    const {
        category,
        itemCode,
        itemName,
        stock,
        quantity,
        unit,
        price,
        discountPrice,
        discount,
        description 
    } = req.body;
    try {
        const buyItem = await BuyingItems.findById(_id);
        if (!buyItem) {
            return res.status(404).json({ error: 'Items not found' });
        }
        if (buyItem.imagePath) {
            const oldBlobName = buyItem.imagePath.split('/').pop(); // Extract blob name from URL
            await deleteBlob(oldBlobName);
        }
        let imageFile = buyItem.imagePath;
        if (req.file) {
            const originalImageBuffer = await sharp(req.file.buffer).resize({ width: 1000, withoutEnlargement: true }).toBuffer();
            imageFile = await uploadToAzureBlob(originalImageBuffer, `${Date.now()}-buy-itm-${req.file.originalname.split('-buy-itm-').pop()}`, req.file.mimetype);
        }
        buyItem.category = category || buyItem.category;
        buyItem.itemCode = itemCode || buyItem.itemCode;
        buyItem.itemName = itemName || buyItem.itemName;
        buyItem.stock = stock || buyItem.stock;
        buyItem.quantity = quantity || buyItem.quantity;
        buyItem.unit = unit || buyItem.unit;
        buyItem.price = price || buyItem.price;
        buyItem.discountPrice = discountPrice|| buyItem.discountPrice;
        buyItem.discount = discount || buyItem.discount;
        buyItem.description = description || buyItem.description;
        buyItem.imagePath = imageFile;
        const updateBuyItme = await buyItem.save();
        const populatedItem = await BuyingItems.findById(updateBuyItme._id).populate('category', 'title');
        res.status(201).json(populatedItem);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/deleteItems/:_id', verifyJWT, async (req, res) => {
    const { _id } = req.params;
    try {
        const buyItem = await BuyingItems.findById(_id);
        if (!buyItem) {
            return res.status(404).json({ error: 'Items not found' });
        }
        // if (buyItem.imagePath) {
        //     const oldBlobName = buyItem.imagePath.split('/').pop(); // Extract blob name from URL
        //     await deleteBlob(oldBlobName);
        // }
        // await BuyingItems.findByIdAndDelete(_id);
        buyItem.disabled = true;
        await buyItem.save();
        res.status(200).json({ message: 'Item deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = router;