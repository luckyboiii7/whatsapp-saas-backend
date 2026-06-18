const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Message = require('./models/Message');
const app = express();

// Enable CORS so your Flutter frontend can read/write data safely
app.use(cors()); 

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
            console.log(`🚀 Outbound message sent successfully! Message ID:`, data.messages[0].id);
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

// ====================================================================
// ENDPOINT 1: Fetch chat log history for a specific number
// ====================================================================
app.get('/api/messages/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        
        // Explicitly query by fromNumber as a clean string to prevent Mongoose ObjectId casting bugs
        const chatHistory = await Message.find({ fromNumber: String(phoneNumber) }).sort({ timestamp: 1 });
        
        return res.status(200).json({ 
            success: true, 
            count: chatHistory.length, 
            data: chatHistory 
        });
    } catch (error) {
        console.error("❌ Error fetching chat history:", error);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// ====================================================================
// ENDPOINT 2: Send a manual message from the Dashboard
// ====================================================================
app.post('/api/messages/send', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        
        if (!phoneNumber || !message) {
            return res.status(400).json({ success: false, error: "Missing phoneNumber or message text" });
        }

        console.log(`💻 Dashboard requested manual reply to ${phoneNumber}: "${message}"`);

        // 1. Send it via Meta
        const outboundId = await sendWhatsAppMessage(phoneNumber, message);

        if (outboundId) {
            // 2. Save it to MongoDB so it shows up in the chat UI
            await Message.create({
                whatsappId: outboundId,
                fromNumber: String(phoneNumber),
                body: message,
                direction: 'outgoing'
            });
            console.log("💾 Dashboard manual reply saved to database.");
            return res.status(200).json({ success: true });
        } else {
            return res.status(500).json({ success: false, error: "Failed to send via Meta" });
        }
    } catch (error) {
        console.error("❌ Error sending manual message:", error);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

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
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const messageData = body.entry[0].changes[0].value.messages[0];
            const from = messageData.from; 
            const msgBody = messageData.text ? messageData.text.body.trim() : "";
            const messageId = messageData.id;

            console.log(`🤖 Processing message from ${from}: "${msgBody}"`);

            try {
                // Save incoming message
                await Message.create({
                    whatsappId: messageId,
                    fromNumber: String(from),
                    body: msgBody,
                    direction: 'incoming'
                });

                // Intelligent Keyword Routing Logic
                let replyText = "";
                const cleanMessage = msgBody.toLowerCase();

                if (cleanMessage.includes("hi") || cleanMessage.includes("hello") || cleanMessage.includes("hey")) {
                    replyText = `👋 Welcome to Wadhwa Plywood & Hardware!\n\nHow can we help you today? Reply with a keyword:\n📦 *Products*\n📍 *Location*\n📞 *Contact*`;
                } else if (cleanMessage.includes("product") || cleanMessage.includes("inventory")) {
                    replyText = `📦 *Our Core Offerings:*\n1. Premium Plywood\n2. Modular Hardware\n3. Designer Locks`;
                } else if (cleanMessage.includes("location") || cleanMessage.includes("address")) {
                    replyText = `📍 *Visit Our Store:*\nCome visit us at Wadhwa Plywood & Hardware during normal hours!`;
                } else if (cleanMessage.includes("contact") || cleanMessage.includes("support")) {
                    replyText = `📞 *Get In Touch:*\nDrop your requirements here, and a team member will get back to you shortly!`;
                } else {
                    replyText = `🤖 Sorry, I didn't quite catch that. Type *Hi* or *Hello* to view our main service menu!`;
                }

                // Trigger outbound reply
                const outboundId = await sendWhatsAppMessage(from, replyText);

                // Save outbound auto-reply
                await Message.create({
                    whatsappId: outboundId || `reply-${messageId}`,
                    fromNumber: String(from),
                    body: replyText,
                    direction: 'outgoing'
                });

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
app.get('/', (req, res) => res.send('Server is alive and running!'));

app.listen(PORT, () => console.log("Server is running smoothly on port " + PORT));