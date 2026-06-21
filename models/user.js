// FORCING GITHUB UPDATE V4 - SCHEMA FIX
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    businessName: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, 
    metaPhoneId: { type: String, required: true }, 
    metaToken: { type: String, required: true },   
    
    // 🛡️ Admin Contact Info for OTPs
    adminEmail: { type: String, required: true },         
    adminPersonalPhone: { type: String, required: true }, 
    
    // 🔐 Temporary OTP Storage
    otpCode: { type: String },                            
    otpExpires: { type: Date },                           

    subscriptionStatus: { type: String, default: 'trial' }, 
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);