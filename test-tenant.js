const fetch = require('node-fetch');

// ⚠️ Make sure this matches your channel ID!
const META_PHONE_ID_OF_BUSINESS = "1212445375277979"; 

const fakeIncomingMedia = {
    "object": "whatsapp_business_account",
    "entry": [{
        "changes": [{
            "value": {
                "metadata": {
                    "phone_number_id": META_PHONE_ID_OF_BUSINESS 
                },
                "contacts": [{
                    "profile": { "name": "Hungry Customer" },
                    "wa_id": "919876543210" 
                }],
                "messages": [{
                    "from": "919876543210", 
                    "id": "msg_" + Date.now(),
                    "type": "image", // 📸 Simulating an image message!
                    "image": {
                        "mime_type": "image/jpeg",
                        "id": "fake_media_id_99999"
                    }
                }]
            }
        }]
    }]
};

async function test() {
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/webhook';
    console.log(`🚀 Simulating incoming IMAGE to Business ID: ${META_PHONE_ID_OF_BUSINESS}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fakeIncomingMedia)
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