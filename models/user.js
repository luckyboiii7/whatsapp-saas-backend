const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    businessName: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true }, // This acts as the unique 'businessPhone' for multi-tenancy
    metaPhoneId: { type: String, required: true }, // The unique WhatsApp API ID
    metaToken: { type: String, required: true },   // The Permanent Access Token
    
    // 💰 Added back for our upcoming SaaS Billing phase!
    email: { type: String, required: false, sparse: true },
    subscriptionStatus: { type: String, default: 'trial' }, 
    
    createdAt: { type: Date, default: Date.now }
    
    // 🧠 NOTE: 'customReplies' is intentionally removed from here because 
    // we now use the dedicated 'Rule.js' database model to store them!
});

module.exports = mongoose.model('User', UserSchema);