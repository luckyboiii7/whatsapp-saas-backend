const mongoose = require('mongoose');

const BotStatusSchema = new mongoose.Schema({
    customerPhone: { type: String, required: true, unique: true },
    isBotPaused: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BotStatus', BotStatusSchema);