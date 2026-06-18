// backend/send-test.js
const fetch = require('node-fetch');

// CHANGE THIS MESSAGE TO TEST DIFFERENT TRIGGERS:
// Options: "menu", "hours", "hi", "ping"
const TEST_MESSAGE = "menu"; 

async function test() {
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/api/messages/send';
    
    console.log(`🚀 Sending test message: "${TEST_MESSAGE}"...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber: '919039744212', // This is your customer's number
                message: TEST_MESSAGE
            })
        });

        if (response.ok) {
            console.log("✅ Message sent successfully! Check your Flutter dashboard.");
        } else {
            console.log("❌ Failed to send. Make sure your Render backend is running.");
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

test();