const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    whatsappId: String,
    fromNumber: String,
    customerName: String, // 👤 NEW: Saving their profile name
    body: String,
    direction: String,
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);