const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
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

const buyingItemsSchema = new mongoose.Schema({
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
        index: true
    },
    itemCode: {type: String, required: true, index: true},
    itemName: {type: String, required: true, index: true},
    imagePath: {type: String, required: true},
    stock: {type: Number, default: 0},
    price: {type: Number, required: true },
    discountPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    unit: { type: String, required: true },
    description: { type: String },
    disabled: { type: Boolean, default: false, index: true },
}, {
    timestamps: true
});

const userPurchaseSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
        index: true
    },
    items: [
        {
            buyItem: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'BuyingItems',
                required: true
            },
            price: { type: Number, required: true },
            quantity: { type: Number, required: true }
        }
    ],
    totalPrice: { type: Number, required: true },
    staff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ServiceStaff',
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'completed'],
        default: 'pending'
    },
    orderId: { type: Number, unique: true },
    notes: { type: String }, // Optional admin notes or user comments
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

userPurchaseSchema.pre('save', async function (next) {
    if (this.isNew) {
      this.orderId = await getNextSequence('orderId'); // Get the next auto-incremented value
    }
    next();
});

const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Name of the sequence
    sequence_value: { type: Number, required: true, default: 1000 }
});


// Models
const Category = mongoose.model('Category', categorySchema);
const BuyingItems = mongoose.model('BuyingItems', buyingItemsSchema);
const UserPurchase = mongoose.model('UserPurchase', userPurchaseSchema);
const PurchaseCompleted = mongoose.model('PurchaseCompleted', userPurchaseSchema);
const Counter = mongoose.model('Counter', counterSchema);


module.exports = { 
    Category, 
    BuyingItems, 
    UserPurchase, 
    PurchaseCompleted,
    Counter 
};