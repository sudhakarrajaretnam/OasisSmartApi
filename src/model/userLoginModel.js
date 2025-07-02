const { default: mongoose } = require("mongoose");
const bcrypt = require("bcrypt");

const userBasicInfoSchema = new mongoose.Schema(
    {
        fullName: { type: String },
        userName: { type: String, index: true },
        password: { type: String, index: true },
        role: {type: Number, default: 1},
    },
    { autoCreate: true, timestamps: true }
);
userBasicInfoSchema.pre('save', async function(next) {
    try {
        if (this.isNew || this.isModified('userName')) {
            const existingUser = await mongoose.models.UserBasicInfo.findOne({ userName: this.userName });
            if (existingUser) {
                return next(new Error("User already exists!"));
            }
        }
        if (this.isModified('password')) {
            const salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, salt);
        }
        next(); // Proceed if no issues
    } catch (err) {
        next(err); // Pass errors to Mongoose
    }
    
});

const otpSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true },
    otp: { type: String, required: true },
}, { timestamps: true });

const customerSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true, index: true },
    fullName: { type: String},
    address: { type: String},
    zip: { type: String },
}, { timestamps: true });

const UserBasicInfo = mongoose.model('UserBasicInfo', userBasicInfoSchema);
const Customer = mongoose.model('Customer', customerSchema);
const Otp = mongoose.model('Otp', otpSchema);

module.exports = {
    UserBasicInfo,
    Customer,
    Otp
}