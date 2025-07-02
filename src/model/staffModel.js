const mongoose = require('mongoose');

const StaffCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Category name
    description: { type: String } // Optional description
}, { timestamps: true });

const ServiceStaffSchema = new mongoose.Schema({
    employeeName: { type: String, required: true },
    employeeMobile: { type: String, required: true },
    employeeImage: { type: String},
    employeeGender: { type: String, required: true },
    employeeAddress: { type: String, required: true },
    dateOfJoining: { type: Date, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffCategory', required: true },
    disabled: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = {
    StaffCategory: mongoose.model('StaffCategory', StaffCategorySchema),
    ServiceStaff: mongoose.model('ServiceStaff', ServiceStaffSchema)
}