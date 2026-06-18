const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
    keyword: { type: String, required: true, lowercase: true }, // e.g., "price"
    replyText: { type: String, required: true }                 // e.g., "Our prices start at $10!"
});

module.exports = mongoose.model('Rule', RuleSchema);