const mongoose = require('mongoose');

const BotStatusSchema = new mongoose.Schema({
    businessPhone: { type: String, required: true }, // 🏢 SaaS Tenant ID
    customerPhone: { type: String, required: true },
    isBotPaused: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BotStatus', BotStatusSchema);