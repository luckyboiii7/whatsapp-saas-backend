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

    // 💸 SaaS Billing Engine
    subscriptionStatus: { type: String, default: 'trial' }, 
    consumedReceipts: { type: [String], default: [] }, 
    subscriptionExpiresAt: { 
        type: Date, 
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Auto-sets to 30 days
    },

    // 📌 NEW: Chat Organization Vault
    // Stores arrays of customer phone numbers so the UI remembers their state!
    pinnedChats: { type: [String], default: [] },
    archivedChats: { type: [String], default: [] },
    lockedChats: { type: [String], default: [] },
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);