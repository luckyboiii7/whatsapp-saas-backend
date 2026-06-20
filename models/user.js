const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    businessName: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, // 🔒 NEW: Secure Password Lock
    metaPhoneId: { type: String, required: true }, 
    metaToken: { type: String, required: true },   
    email: { type: String, required: false, sparse: true },
    subscriptionStatus: { type: String, default: 'trial' }, 
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);