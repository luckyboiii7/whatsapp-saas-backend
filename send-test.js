const fetch = require('node-fetch');

// Simulates a user clicking "View Products" from the Main Menu
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
                            "id": "products", 
                            "title": "📁 View Products"
                        }
                    }
                }]
            }
        }]
    }]
};

async function test() {
    // Make sure this points to your live Render backend
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/webhook';
    console.log("🚀 Simulating 'View Products' Button Click...");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mockPayload)
        });

        if (response.status === 200) {
            console.log("✅ Webhook triggered! Check your Flutter dashboard to see the dynamic catalog.");
        } else {
            console.log("❌ Webhook failed with status:", response.status);
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

test();