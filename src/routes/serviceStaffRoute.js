const express = require('express');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const sharp = require('sharp');
const verifyJWT = require('../middleware/verifyJWT');
const { StaffCategory, ServiceStaff } = require('../model/staffModel');

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

router.post('/staff', verifyJWT, (req, res, next) => {
    upload.single('flyerImage')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: 'Multer error: ' + err.message });
        } else if (err) {
            return res.status(500).json({ error: 'Server error: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        let imagePath = null;
        if (req.file) {
            const { buffer, mimetype } = req.file;
            const filename = `${Date.now()}-${req.file.originalname}`;
            imagePath = await uploadToAzureBlob(buffer, filename, mimetype);    
        } 
        const { employeeName, employeeMobile, employeeGender, employeeAddress, dateOfJoining, category } = req.body;
        //dateOfJoining = new Date().toISOString();
        //category = "67b378aa4ea2637b5caf7266";

        const newStaff = new ServiceStaff({
            employeeName,
            employeeMobile,
            employeeGender,
            employeeAddress,
            dateOfJoining,
            category,
            employeeImage: imagePath,
            disabled: false,
        });

        const savedStaff = await newStaff.save();
        const populatedStaff = await savedStaff.populate('category', 'name');
        res.status(201).json(populatedStaff);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

router.put('/staff/:id', verifyJWT, (req, res, next) => {
    upload.single('flyerImage')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: 'Multer error: ' + err.message });
        } else if (err) {
            return res.status(500).json({ error: 'Server error: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        let imagePath = null;
        if (req.file) {
            const { buffer, mimetype } = req.file;
            const filename = `${Date.now()}-${req.file.originalname}`;
            imagePath = await uploadToAzureBlob(buffer, filename, mimetype);    
        } 
        const staff = await ServiceStaff.findById(req.params.id);
        const { employeeName, employeeMobile, employeeGender, employeeAddress, dateOfJoining, category } = req.body;
        if (staff) {
            staff.employeeName = employeeName;
            staff.employeeMobile = employeeMobile;
            staff.employeeGender = employeeGender;
            staff.employeeAddress = employeeAddress;
            staff.dateOfJoining = dateOfJoining;
            staff.category = category;
            staff.employeeImage = imagePath;
            staff.disabled = false;
            if (imagePath && staff.employeeImage) {
                await deleteBlob(staff.employeeImage);
                staff.employeeImage = imagePath;
            } else if (!imagePath && staff.employeeImage) {
                await deleteBlob(staff.employeeImage);
                staff.employeeImage = null;
            }
            const updatedStaff = await staff.save();
            const populatedStaff = await updatedStaff.populate('category', 'name');
            res.status(200).json(populatedStaff);
        } else {
            res.status(404).json({ message: 'Staff not found' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

// router.put('/staff/:id', verifyJWT, upload.single('image'), async (req, res) => {
//     try {
//         const { employeeName, employeeMobile, employeeGender, employeeAddress, dateOfJoining, category } = req.body;
//         const { buffer, mimetype } = req.file;
//         let imagePath = null;
//         if (buffer && mimetype) {
//             const filename = `${Date.now()}-${req.file.originalname}`;
//             imagePath = await uploadToAzureBlob(buffer, filename, mimetype);    
//         }
        
//         const staff = await ServiceStaff.findById(req.params.id);
//         if (staff) {
//             staff.employeeName = employeeName;
//             staff.employeeMobile = employeeMobile;
//             staff.employeeGender = employeeGender;
//             staff.employeeAddress = employeeAddress;
//             staff.dateOfJoining = dateOfJoining;
//             staff.category = category;
//             if (imagePath) {
//                 await deleteBlob(staff.employeeImage);
//                 staff.employeeImage = imagePath;
//             }
//             const updatedStaff = await staff.save();
//             updatedStaff.populate('category', 'name');
//             res.status(200).json(updatedStaff);
//         } else {
//             res.status(404).json({ message: 'Staff not found' });
//         }
//     } catch (error) {
//         res.status(500).json({ message: 'Error updating staff', error });
//     }
// });


router.get('/staff', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const staff = await ServiceStaff.find({disabled: false})
            .populate('category', 'name')
            .skip(skip)
            .limit(limit)
            .exec();

        res.status(200).json({
            currentPage: page,
            staff,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving staff', error });
    }
});

router.get('/staff/count', async (req, res) => {
    try {
        const totalStaff = await ServiceStaff.countDocuments({disabled: false});
        res.status(200).json({ totalStaff });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving staff count', error });
    }
});



router.delete('/staff/:id', verifyJWT, async (req, res) => {
    // try {
    //     const staff = await ServiceStaff.findByIdAndDelete(req.params.id);
    //     if (staff) {
    //         await deleteBlob(staff.employeeImage);
    //         await staff.remove();
    //         res.status(200).json(staff);
    //     } else {
    //         res.status(404).json({ message: 'Staff not found' });
    //     }
    // } catch (error) {
    //     res.status(500).json({ message: 'Error deleting staff', error });
    // }
    const { id } = req.params;
    try {
        const staff = await ServiceStaff.findById(id);
        if (!staff) {
            return res.status(404).json({ error: 'Staff not found' });
        }
        staff.disabled = true;
        await staff.save();
        res.status(200).json({ message: 'Staff deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/staffCategory', verifyJWT, async (req, res) => {
    try {
        const { name, description } = req.body;
        const newCategory = new StaffCategory({ name, description });
        const savedCategory = await newCategory.save();
        res.status(201).json(savedCategory);
    } catch (error) {
        res.status(500).json({ message: 'Error saving category', error });
    }
});

router.get('/staffCategory', async (req, res) => {
    try {
        const categories = await StaffCategory.find().select('name description').exec();
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving categories', error });
    }
});

router.put('/staffCategory/:id', verifyJWT, async (req, res) => {
    try {
        const { name, description } = req.body;
        const category = await StaffCategory.findById(req.params.id);
        if (category) {
            category.name = name;
            category.description = description;
            const updatedCategory = await category.save();
            res.status(200).json(updatedCategory);
        } else {
            res.status(404).json({ message: 'Category not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error updating category', error });
    }
});

router.delete('/staffCategory/:id', verifyJWT, async (req, res) => {
    try {
        const category = await StaffCategory.findByIdAndDelete(req.params.id);
        if (category) {
            res.status(200).json(category);
        } else {
            res.status(404).json({ message: 'Category not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error deleting category', error });
    }
});

router.get('/getallstaffs', async (req, res) => {
    try {
        const staff = await ServiceStaff.find({disabled: false}).populate('category', 'name').select('_id employeeName category').sort({employeeName: 1}).exec();
        res.status(200).json(staff);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving staff', error });
    }
});

module.exports = router;