const express = require('express');
const app = express();

// Middleware to parse incoming JSON payloads
app.use(express.json());

// PORT Configuration
const PORT = process.env.PORT || 3000;

// Helper function to send outbound messages via Meta API
async function sendWhatsAppMessage(toPhoneNumber, messageText) {
    const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "1212445375277979";
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
        console.error("❌ Outbound Error: WHATSAPP_ACCESS_TOKEN is missing in environment variables.");
        return;
    }

    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhoneNumber,
        type: "text",
        text: {
            preview_url: false,
            body: messageText
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`🚀 Auto-reply sent successfully to ${toPhoneNumber}! Message ID:`, data.messages?.[0]?.id);
        } else {
            console.error("❌ Meta API Error Response:", JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("❌ Failed to contact Meta Outbound API:", error);
    }
}

// 1. Webhook Verification Route (GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "kesh_whatsapp_saas_secret_token_2026";

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log("✅ Webhook verified successfully with Meta!");
            return res.status(200).send(challenge);
        } else {
            console.log("❌ Webhook verification failed: Token mismatch.");
            return res.sendStatus(403);
        }
    }
    res.status(200).send("WhatsApp Webhook Server is running!");
});

// 2. Webhook Event Receiver Route (POST)
app.post('/webhook', async (req, res) => {
    console.log("📩 New Webhook Received:\n", JSON.stringify(req.body, null, 2));

    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        // Look closely inside the webhook array structure for message fields
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const messageData = body.entry[0].changes[0].value.messages[0];
            const from = messageData.from; // Sender's phone number
            const msgBody = messageData.text ? messageData.text.body : "";

            console.log(`🤖 Processing message from ${from}: "${msgBody}"`);

            // Trigger the automated reply loop
            const replyText = `Hello! Thanks for messaging. Your text "${msgBody}" was processed successfully by our SaaS Engine. ✨`;
            await sendWhatsAppMessage(from, replyText);
        }
        
        // Always respond back to Meta with 200 OK instantly
        return res.status(200).send('EVENT_RECEIVED');
    } else {
        return res.sendStatus(404);
    }
});

// Root Route
app.get('/', (req, res) => {
    res.send('Server is alive and running!');
});

// Start the Server
app.listen(PORT, () => {
    console.log(`Server is running smoothly on port ${PORT}`);
});