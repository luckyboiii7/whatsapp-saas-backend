const fetch = require('node-fetch');

// ⚠️ CRITICAL FIX: You are currently logged into channel "919039744212".
// You MUST change "12345" below to the exact "Meta Phone Number ID" you used to register that specific account!
const META_PHONE_ID_OF_BUSINESS = "1212445375277979"; 

const fakeIncomingMessage = {
    "object": "whatsapp_business_account",
    "entry": [{
        "changes": [{
            "value": {
                "metadata": {
                    // This tells the backend WHICH business should receive this message
                    "phone_number_id": META_PHONE_ID_OF_BUSINESS 
                },
                "contacts": [{
                    "profile": { "name": "Hungry Customer" },
                    // Changed customer number so it doesn't conflict with your business number
                    "wa_id": "919876543210" 
                }],
                "messages": [{
                    // Changed customer number
                    "from": "919876543210", 
                    "id": "msg_" + Date.now(),
                    "type": "text",
                    "text": { "body": "Hello! Do you have chocolate cake?" }
                }]
            }
        }]
    }]
};

async function test() {
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/webhook';
    console.log(`🚀 Simulating customer message to Business ID: ${META_PHONE_ID_OF_BUSINESS}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fakeIncomingMessage)
        });

        if (response.status === 200) {
            console.log("✅ Webhook triggered! Check your Netlify dashboard.");
        } else {
            console.log("❌ Webhook failed with status:", response.status);
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

test();