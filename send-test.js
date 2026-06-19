// backend/send-test.js
const fetch = require('node-fetch');

// =====================================================================
// 🛒 SCENARIO A: The "General Store" Cart (Fixed Prices)
// All items have a price greater than 0. This should trigger Instant Pay.
// =====================================================================
const generalStoreCart = {
    "object": "whatsapp_business_account",
    "entry": [{
        "changes": [{
            "value": {
                "messages": [{
                    "from": "919039744212",
                    "id": "cart_id_" + Date.now(),
                    "type": "order",
                    "order": {
                        "catalog_id": "catalog_123",
                        "product_items": [
                            { "product_retailer_id": "shampoo_bottle", "quantity": 2, "item_price": 250, "currency": "INR" },
                            { "product_retailer_id": "soap_bar", "quantity": 5, "item_price": 40, "currency": "INR" }
                        ]
                    }
                }]
            }
        }]
    }]
};

// =====================================================================
// 🛠️ SCENARIO B: The "Plywood" Cart (Custom/Variable Prices)
// Contains an item with a price of 0. This should trigger the Quotation flow.
// =====================================================================
const plywoodCustomCart = {
    "object": "whatsapp_business_account",
    "entry": [{
        "changes": [{
            "value": {
                "messages": [{
                    "from": "919039744212",
                    "id": "cart_id_" + Date.now(),
                    "type": "order",
                    "order": {
                        "catalog_id": "catalog_123",
                        "product_items": [
                            { "product_retailer_id": "flush_door_std", "quantity": 5, "item_price": 2500, "currency": "INR" },
                            { "product_retailer_id": "19mm_custom_plywood", "quantity": 10, "item_price": 0, "currency": "INR" } // Price 0 triggers quotation!
                        ]
                    }
                }]
            }
        }]
    }]
};

async function test() {
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/webhook';
    
    // ⚠️ CHANGE THIS VARIABLE TO TEST THE DIFFERENT SCENARIOS
    // Use `generalStoreCart` for instant pay, or `plywoodCustomCart` for quotation.
    const payloadToTest = plywoodCustomCart; 

    console.log("🚀 Simulating Cart Checkout...");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadToTest)
        });

        if (response.status === 200) {
            console.log("✅ Cart webhook triggered successfully! Check your Flutter dashboard.");
        } else {
            console.log("❌ Webhook failed with status code:", response.status);
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

test();