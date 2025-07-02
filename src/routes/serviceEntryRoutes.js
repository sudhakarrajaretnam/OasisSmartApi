const express = require('express');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const sharp = require('sharp');
const verifyJWT = require('../middleware/verifyJWT');
const { Services, ServicesItem, RequestService, RequestCompleted } = require('../model/serviceModel');
const { ServiceStaff } = require('../model/staffModel');
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

router.post('/addService', upload.single('flyerImage'), async (req, res) => {
    try {
        const { title} = req.body;
        const imageFile = req.file;
        if (!imageFile) {
            return res.status(400).json({ message: 'Image file is required' });
        }
        const originalImageBuffer = await sharp(imageFile.buffer).resize({ width: 1000, withoutEnlargement: true }).toBuffer();
        const imagePath = await uploadToAzureBlob(originalImageBuffer, `${Date.now()}-buy-cat-${imageFile.originalname}`, imageFile.mimetype);
        const services = new Services({ title, imagePath, disabled: false });
        await services.save();
        res.status(201).json(services);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/updateService/:_id', upload.single('flyerImage'), async (req, res) => {
    const { _id } = req.params;
    const { title} = req.body;
    try {
        const service = await Services.findById(_id);
        if (!service) {
            return res.status(404).json({ error: 'Category not found' });
        }
        if (service.imagePath) {
            const oldBlobName = service.imagePath.split('/').pop();
            await deleteBlob(oldBlobName);
        }
        let imageFile = service.imagePath;
        if (req.file) {
            const originalImageBuffer = await sharp(req.file.buffer).resize({ width: 1000, withoutEnlargement: true }).toBuffer();
            imageFile = await uploadToAzureBlob(originalImageBuffer, `${Date.now()}-buy-cat-${req.file.originalname}`, req.file.mimetype);
        }
        service.title = title || category.title;
        service.imagePath = imageFile;
        await service.save();
        res.status(201).json(service);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


router.get('/getServices', async (req, res) => {
    try {
        const search = req.query.search || ''; 
        const regex = new RegExp(search, 'i'); 

        const categories = await Services.find({ title: { $regex: regex }, disabled: false })
            .sort({ title: 1 })
            .select('title imagePath');

        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving categories', error });
    }
});

router.delete('/deleteService/:_id', verifyJWT, async (req, res) => {
    const { _id } = req.params;
    try {
        const buyItem = await Services.findById(_id);
        if (!buyItem) {
            return res.status(404).json({ error: 'Items not found' });
        }
        // if (buyItem.imagePath) {
        //     const oldBlobName = buyItem.imagePath.split('/').pop(); // Extract blob name from URL
        //     await deleteBlob(oldBlobName);
        // }
        // await Services.findByIdAndDelete(_id);
        buyItem.disabled = true;
        await buyItem.save();
        res.status(200).json({ message: 'Item deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/serviceItems/:serviceId', verifyJWT, async (req, res) => {
    const { serviceId } = req.params;
    try {
        const services = await ServicesItem.find({ service: serviceId, disabled: false })
        .populate("service", "title")
        .sort({ serviceName: 1 });
        res.status(200).json(services);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving items', error });
    }
});

router.post('/addServiceItems', upload.single('flyerImage'), async (req, res) => {
    try {
        const {
            service,
            serviceName,
            noOfPersons, 
            workingHours, 
            price,
            description 
        } = req.body;
        
        const imageFile = req.file;
        if (!imageFile) {
            return res.status(400).json({ message: 'Image file is required' });
        }
        const originalImageBuffer = await sharp(imageFile.buffer).resize({ width: 1000, withoutEnlargement: true }).toBuffer();
        const imagePath = await uploadToAzureBlob(originalImageBuffer, `${Date.now()}-ser-itm-${imageFile.originalname}`, imageFile.mimetype);
        const items = new ServicesItem({ service, serviceName, noOfPersons, workingHours, price, imagePath, description, disabled: false });
        const savedItem = await items.save();
        const populatedItem = await ServicesItem.findById(savedItem._id).populate('service', 'title');
        res.status(200).json(populatedItem);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/updateServiceItems/:_id', upload.single('flyerImage'), async (req, res) => {
    const { _id } = req.params;
    const {
        service,
        serviceName,
        noOfPersons, 
        workingHours, 
        price,
        description  
    } = req.body;
    try {
        const buyItem = await ServicesItem.findById(_id);
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
            imageFile = await uploadToAzureBlob(originalImageBuffer, `${Date.now()}-ser-itm-${req.file.originalname.split('-ser-itm-').pop()}`, req.file.mimetype);
        }
        buyItem.service = service || buyItem.service;
        buyItem.serviceName = serviceName || buyItem.serviceName;
        buyItem.noOfPersons = noOfPersons || buyItem.noOfPersons;
        buyItem.workingHours = workingHours || buyItem.workingHours;
        buyItem.price = price || buyItem.price;
        buyItem.description = description || buyItem.description;
        buyItem.imagePath = imageFile;
        const updateBuyItme = await buyItem.save();
        const populatedItem = await ServicesItem.findById(updateBuyItme._id).populate('service', 'title');
        res.status(200).json(populatedItem);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/deleteServiceItem/:_id', verifyJWT, async (req, res) => {
    const { _id } = req.params;
    try {
        const buyItem = await ServicesItem.findById(_id);
        if (!buyItem) {
            return res.status(404).json({ error: 'Items not found' });
        }
        // if (buyItem.imagePath) {
        //     const oldBlobName = buyItem.imagePath.split('/').pop(); // Extract blob name from URL
        //     await deleteBlob(oldBlobName);
        // }
        // await ServicesItem.findByIdAndDelete(_id);
        buyItem.disabled = true;
        await buyItem.save();
        res.status(200).json({ message: 'Item deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/updateRequest', verifyJWT, async (req, res) => {
    const { _id, status, staffId, comments, fromStatus } = req.body;
    try {
        if (fromStatus !== 'completed' && status === 'completed') {
            const request = await RequestService.findById(_id);
            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }
            const moveRecord = request.toObject();
            moveRecord.status = 'completed';
            moveRecord.staff = staffId;
            moveRecord.comments = comments || request.comments || '';
            RequestService.collection.deleteOne({ _id: request._id });
            const completed = new RequestCompleted(moveRecord);
            await completed.save();
            let staffName = null;
            if (staffId) {
                staffName = await ServiceStaff.findById(moveRecord.staff).select('employeeName -_id').lean();
                staffName = staffName.employeeName;
            }
            return res.status(200).json({ _id: request._id, status, staffId: request?.staff?._id||null, staffName, comments: request.comments });
        } else if (fromStatus === 'completed' && status !== 'completed') {
            const request = await RequestCompleted.findById(_id);
            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }
            const moveRecord = request.toObject();
            moveRecord.status = status;
            moveRecord.staff = staffId;
            moveRecord.comments = comments || request.comments || '';

            RequestCompleted.collection.deleteOne({ _id: request._id });
            const completed = new RequestService(moveRecord);
            await completed.save();
            let staffName = null;
            if (staffId) {
                staffName = await ServiceStaff.findById(moveRecord.staff).select('employeeName -_id').lean();
                staffName = staffName.employeeName;
            }
            return res.status(200).json({ _id: request._id, status, staffId: request?.staff?._id||null, staffName, comments: request.comments });
        } else {
            let Modal = status === 'completed' ? RequestCompleted : RequestService;
            
            const request = await Modal.findById(_id);
            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }
            request.status = status || request.status;
            request.staff = staffId;
            request.comments = comments || request.comments || '';
            let staffName = null;
            if (staffId) {
                staffName = await ServiceStaff.findById(request.staff).select('employeeName -_id').lean();
                staffName = staffName.employeeName;
            }
            await request.save();
            res.status(200).json({ _id: request._id, status, staffId: request?.staff?._id||null, staffName, comments: request.comments });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;