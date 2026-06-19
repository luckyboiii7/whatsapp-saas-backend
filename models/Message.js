const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    businessPhone: { type: String, required: true }, // 🏢 SaaS Tenant ID
    whatsappId: String,
    fromNumber: String,
    customerName: String, // 👤 Extracted WhatsApp profile name
    body: String,
    direction: String, // 'incoming' or 'outgoing'
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);