// backend/send-test.js
const fetch = require('node-fetch');

// This mimics exactly what Meta sends when a user clicks the "Store Hours" button
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
                            "id": "hours", // The hidden ID for Store Hours
                            "title": "⏰ Store Hours"
                        }
                    }
                }]
            }
        }]
    }]
};

async function test() {
    // ⚠️ IMPORTANT: Point this to your live Render webhook URL
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/webhook';
    
    console.log("🚀 Sending 'menu' to the Webhook...");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mockPayload)
        });

        if (response.status === 200) {
            console.log("✅ Webhook triggered successfully!");
        } else {
            console.log("❌ Webhook failed. Check your Render logs.");
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

test();