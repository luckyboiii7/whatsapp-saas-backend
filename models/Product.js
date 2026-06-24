const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    businessPhone: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, default: 0 },
    
    // 📦 The New Split Inventory System
    shopStock: { type: Number, default: 0 },
    godownStock: { type: Number, default: 0 },
    
    imageUrl: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);