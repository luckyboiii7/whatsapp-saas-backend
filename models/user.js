const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true
    },
    businessName: {
        type: String,
        required: false,
        default: "New Shop (Pending Setup)"
    },
    email: {
        type: String,
        required: false,
        unique: true,
        sparse: true 
    },
    subscriptionStatus: {
        type: String,
        default: 'trial'
    },
    // 🧠 NEW: The brain for custom auto-replies!
    // It's a Map (Dictionary) that stores "keyword" -> "message"
    customReplies: {
        type: Map,
        of: String,
        default: {} // Starts completely empty
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);