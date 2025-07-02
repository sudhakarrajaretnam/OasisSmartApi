const mongoose = require('mongoose');
const { Counter } = require('./buyModel');

const servicesSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    imagePath: {
        type: String,
        required: true
    },
    disabled: { type: Boolean, default: false, index: true },
}, {
    timestamps: true
});

const servicesItemSchema = new mongoose.Schema({
    service: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Services',
        required: true,
        index: true
    },
    serviceName: { type: String, required: true },
    noOfPersons: { type: Number, required: false },
    workingHours: { type: Number, required: false },
    price: { type: Number, required: true },
    imagePath: { type: String, required: true },
    description: { type: String },
    disabled: { type: Boolean, default: false, index: true },
}, {
    timestamps: true
});

// const staffSchema = new mongoose.Schema({
//     staffName: { type: String, required: true },
//     staffId: { type: String, required: true },
//     staffImage: { type: String, required: true },
//     staffGender: { type: String, required: true },
//     staffRole: { type: String, required: true },
//     staffMobile: { type: String, required: true },
//     staffAddress: { type: String, required: true },
//     staffExperience: { type: String, required: true }
// }, {
//     timestamps: true
// });

const requestServiceSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
        index: true
    },
    service: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ServicesItem',
        required: true
    },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    selectDate: { type: Date, required: true, index: true },
    selectTime: { type: String, required: true },
    staff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ServiceStaff',
    },
    status: {
        type: String,
        enum: ['pending', 'assigned', 'rejected', 'completed'],
        default: 'pending',
        index: true
    },
    orderId: { type: Number, unique: true },
    comments: { type: String },
    notes: { type: String },
}, {
    timestamps: true
});

async function getNextSequence(sequenceName) {
    const result = await Counter.findOneAndUpdate(
      { _id: sequenceName },
      { $inc: { sequence_value: 1 } },
      { new: true, upsert: true } // Create the document if it doesn't exist
    );
    return result.sequence_value;
}


requestServiceSchema.pre('save', async function (next) {
    if (this.isNew) {
      this.orderId = await getNextSequence('orderId'); // Get the next auto-incremented value
    }
    next();
});

const Services = mongoose.model('Services', servicesSchema);
const ServicesItem = mongoose.model('ServicesItem', servicesItemSchema);
const RequestService = mongoose.model('RequestService', requestServiceSchema);
const RequestCompleted = mongoose.model('ServiceCompleted', requestServiceSchema);
//const Staff = mongoose.model('Staff', staffSchema);
module.exports = {
    Services,
    ServicesItem,
    RequestService,
    RequestCompleted
}