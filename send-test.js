// backend/send-test.js
const fetch = require('node-fetch');

async function test() {
    const url = 'https://whatsapp-saas-backend-qv85.onrender.com/api/messages/send'; // MUST BE YOUR RENDER URL
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phoneNumber: '919039744212',
            message: 'menu' // Testing the menu trigger!
        })
    });
    
    if (response.ok) {
        console.log("✅ Message sent to Render cloud!");
    } else {
        console.log("❌ Failed to send!");
    }
}
test();