require('dotenv').config();
const axios = require('axios');

const token = process.env.WHATSAPP_TOKEN;
// This is the Phone Number ID from your dashboard screen (usually 15 digits)
const phone_number_id = "1212445375277979"; 
const recipient_phone = "919039744212"; 

async function sendWhatsAppMessage() {
    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: "whatsapp",
                to: recipient_phone,
                type: "template",
                template: {
                    name: "hello_world",
                    language: { code: "en_US" }
                }
            }
        });
        console.log("🚀 SUCCESS! Meta accepted the message:", response.data);
    } catch (error) {
        console.error("❌ META ERROR DETAILS:");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

sendWhatsAppMessage();