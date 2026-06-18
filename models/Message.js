const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    whatsappId: { type: String, required: true }, 
    fromNumber: { type: String, required: true }, 
    body: { type: String, required: true },       
    timestamp: { type: Date, default: Date.now }, 
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true }
});

module.exports = mongoose.model('Message', MessageSchema);