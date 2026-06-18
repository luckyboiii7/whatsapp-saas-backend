const express = require('express');
const mongoose = require('mongoose');
const Message = require('./models/Message');
const app = express();

// Middleware to parse incoming JSON payloads
app.use(express.json());

// PORT Configuration
const PORT = process.env.PORT || 3000;

// MongoDB Connection Setup
const MONGO_URI = process.env.MONGO_URI || "your_local_or_atlas_mongodb_connection_string_here";

mongoose.connect(MONGO_URI)
    .then(() => console.log("💾 Successfully connected to MongoDB Atlas Cloud!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Helper function to send outbound messages via Meta API
async function sendWhatsAppMessage(toPhoneNumber, messageText) {
    const PHONE_NUMBER_ID = (process.env.PHONE_NUMBER_ID || "1212445375277979").trim();
    const ACCESS_TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();

    if (!ACCESS_TOKEN) {
        console.error("❌ Outbound Error: WHATSAPP_ACCESS_TOKEN is missing in environment variables.");
        return null;
    }

    const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhoneNumber,
        type: "text",
        text: { 
            body: messageText 
        }
    };

    try {
        console.log(`📤 Sending outward request to Meta for ${toPhoneNumber}...`);
        
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
            console.log(`🚀 Auto-reply sent successfully! Message ID:`, data.messages[0].id);
            return data.messages[0].id;
        } else {
            console.error("❌ Meta API Error Response:", JSON.stringify(data, null, 2));
            return null;
        }
    } catch (error) {
        console.error("❌ Failed to contact Meta Outbound API:", error);
        return null;
    }
}

// Webhook Verification Route (GET)
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

// Webhook Event Receiver Route (POST)
app.post('/webhook', async (req, res) => {
    console.log("📩 New Webhook Received:\n", JSON.stringify(req.body, null, 2));

    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const messageData = body.entry[0].changes[0].value.messages[0];
            const from = messageData.from; 
            const msgBody = messageData.text ? messageData.text.body : "";
            const messageId = messageData.id;

            console.log(`🤖 Processing message from ${from}: "${msgBody}"`);

            try {
                // Save the incoming WhatsApp text to MongoDB Atlas
                await Message.create({
                    whatsappId: messageId,
                    fromNumber: from,
                    body: msgBody,
                    direction: 'incoming'
                });
                console.log("💾 Incoming message saved to database.");

                // Trigger the automated reply text
                const replyText = `Hello! Thanks for messaging. Your text "${msgBody}" was processed successfully by our SaaS Engine. ✨`;
                const outboundId = await sendWhatsAppMessage(from, replyText);

                // Save our outbound auto-reply to MongoDB Atlas
                await Message.create({
                    whatsappId: outboundId || `reply-${messageId}`,
                    fromNumber: from,
                    body: replyText,
                    direction: 'outgoing'
                });
                console.log("💾 Outbound auto-reply saved to database.");

            } catch (dbError) {
                console.error("❌ Database Storage Error:", dbError);
            }
        }
        
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