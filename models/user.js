const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    businessName: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true }, // 🏢 SaaS Tenant ID
    password: { type: String, required: true },
    metaPhoneId: { type: String, required: true },
    metaToken: { type: String, required: true },
    adminEmail: { type: String, required: true },
    adminPersonalPhone: { type: String, required: true },

    // 🔐 Temporary OTP Storage
    otpCode: { type: String },                            
    otpExpires: { type: Date },                           

    subscriptionStatus: { type: String, default: 'trial' }, 
    
    // 🏦 THE VAULT: Stores an array of EVERY used receipt so they can NEVER be reused
    consumedReceipts: { type: [String], default: [] }, 
    
    // 🗓️ THE CLOCK: Tracks exactly when their current month/trial ends!
    subscriptionExpiresAt: { 
        type: Date, 
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Auto-sets to 30 days from registration
    },
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);