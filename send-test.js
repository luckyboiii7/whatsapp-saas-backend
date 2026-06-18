// backend/send-test.js
const fetch = require('node-fetch');

// This mimics exactly what Meta sends when a user clicks the "View Products" button
const mockPayload = {
    "object": "whatsapp_business_account",
    "entry": [{
        "changes": [{
            "value": {
                "messages": [{
                    "from": "919039744212",
                    "id": "click_id_" + Date.now(),
                    "type": "interactive",
                    "interactive": {
                        "type": "button_reply",
                        "button_reply": {
                            "id": "products", // The hidden ID that triggers the image catalog
                            "title": "📁 View Products"
                        }
                    }
                }]
            }
        }]
    }]
};

async function test() {
    // ⚠️ Ensure this is your live Render webhook URL
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/webhook';
    
    console.log("🚀 Simulating 'View Products' Button Click...");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mockPayload)
        });

        if (response.status === 200) {
            console.log("✅ Webhook triggered successfully! Check your Flutter dashboard.");
        } else {
            console.log("❌ Webhook failed with status code:", response.status);
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

test();