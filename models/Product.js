const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    businessPhone: { type: String, required: true }, // 🏢 SaaS Tenant ID
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true, default: 0 }, 
    stockQuantity: { type: Number, required: true, default: 0 }, 
    imageUrl: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', ProductSchema);