const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    businessPhone: { type: String, required: true }, // 🏢 SaaS Tenant ID
    customerPhone: String,
    items: [{ 
        name: String, 
        quantity: Number, 
        price: Number 
    }],
    totalAmount: Number,
    routingMode: String, // 'instant_pay' or 'quotation'
    status: String, // 'pending_quote', 'pending_payment', 'paid'
    
    // ⏰ NEW: Tracks if the 2-hour abandoned cart reminder was sent!
    reminderSent: { type: Boolean, default: false }, 
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);