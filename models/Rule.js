const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
    businessPhone: { type: String, required: true }, // 🏢 SaaS Tenant ID
    keyword: { type: String, required: true },
    replyText: { type: String, required: true }
});

module.exports = mongoose.model('Rule', RuleSchema);