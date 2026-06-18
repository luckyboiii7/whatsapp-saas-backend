const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    customerPhone: { type: String, required: true },
    items: [{
        name: String,
        quantity: Number,
        price: Number, // If 0 or missing, it triggers Quotation Mode
        currency: { type: String, default: "INR" }
    }],
    totalAmount: { type: Number, default: 0 },
    routingMode: { type: String, enum: ['instant_pay', 'quotation'], required: true },
    status: { type: String, enum: ['pending_quote', 'pending_payment', 'paid', 'fulfilled'], default: 'pending_quote' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);