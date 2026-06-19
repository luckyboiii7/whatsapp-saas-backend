const fetch = require('node-fetch');

// This simulates a customer ordering 10 units, but you only have 5 in stock!
const outOfStockCart = {
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
                            { "product_retailer_id": "fevicol_glue", "quantity": 10, "item_price": 100, "currency": "INR" } 
                        ]
                    }
                }]
            }
        }]
    }]
};

async function test() {
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/webhook';
    console.log("🚀 Simulating Over-Limit Cart Submission...");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(outOfStockCart)
        });

        if (response.status === 200) {
            console.log("✅ Webhook triggered! Check your Flutter dashboard to see the Stock Error message.");
        } else {
            console.log("❌ Webhook failed with status:", response.status);
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

test();