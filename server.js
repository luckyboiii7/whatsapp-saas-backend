const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Message = require('./models/Message');
const Rule = require('./models/Rule'); 
const User = require('./models/User'); // 👈 1. Import the new User model
const app = express();

app.use(cors()); 
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "your_local_or_atlas_mongodb_connection_string_here";

mongoose.connect(MONGO_URI)
    .then(() => console.log("💾 Successfully connected to MongoDB Atlas Cloud!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

async function sendWhatsAppMessage(toPhoneNumber, messageText) {
    const PHONE_NUMBER_ID = (process.env.PHONE_NUMBER_ID || "1212445375277979").trim();
    const ACCESS_TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();

    if (!ACCESS_TOKEN) return null;

    const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhoneNumber,
        type: "text",
        text: { body: messageText }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) return data.messages[0].id;
        return null;
    } catch (error) {
        return null;
    }
}

// ====================================================================
// NEW: SAAS REGISTRATION / LOGIN ENDPOINT
// ====================================================================
app.post('/api/register', async (req, res) => {
    try {
        const { businessName, phoneNumber } = req.body;
        
        if (!businessName || !phoneNumber) {
            return res.status(400).json({ success: false, message: "Missing business name or phone number" });
        }

        // 1. Check if this business already exists (Login)
        let user = await User.findOne({ phoneNumber: String(phoneNumber) });
        
        if (user) {
            console.log(`👋 Existing business logged in: ${user.businessName}`);
            return res.status(200).json({ success: true, message: "Welcome back!", user });
        }

        // 2. If they don't exist, create a new account (Registration)
        user = await User.create({ businessName, phoneNumber: String(phoneNumber) });
        console.log(`🏢 New Business Registered: ${businessName} (${phoneNumber})`);
        
        return res.status(201).json({ success: true, message: "Account created successfully!", user });

    } catch (error) {
        console.error("❌ Registration Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// ====================================================================
// BOT BUILDER ENDPOINTS
// ====================================================================
app.get('/api/rules', async (req, res) => {
    try {
        const rules = await Rule.find();
        return res.status(200).json({ success: true, data: rules });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Server Error" });
    }
});

app.post('/api/rules', async (req, res) => {
    try {
        const { keyword, replyText } = req.body;
        if (!keyword || !replyText) return res.status(400).json({ success: false, error: "Missing data" });

        await Rule.findOneAndUpdate(
            { keyword: keyword.toLowerCase() }, 
            { replyText: replyText }, 
            { upsert: true, new: true }
        );
        console.log(`🧠 Bot learned a new rule for: "${keyword}"`);
        return res.status(200).json({ success: true, message: "Rule saved to Brain!" });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Server Error" });
    }
});

// ====================================================================
// EXISTING CHAT ENDPOINTS
// ====================================================================
app.get('/api/messages/:phoneNumber', async (req, res) => {
    try {
        const chatHistory = await Message.find({ fromNumber: String(req.params.phoneNumber) }).sort({ timestamp: 1 });
        return res.status(200).json({ success: true, count: chatHistory.length, data: chatHistory });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

app.post('/api/messages/send', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        const outboundId = await sendWhatsAppMessage(phoneNumber, message);
        if (outboundId) {
            await Message.create({ whatsappId: outboundId, fromNumber: String(phoneNumber), body: message, direction: 'outgoing' });
            return res.status(200).json({ success: true });
        } else {
            return res.status(500).json({ success: false, error: "Failed to send via Meta" });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// ====================================================================
// THE UPGRADED "SMART" WEBHOOK
// ====================================================================
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "kesh_whatsapp_saas_secret_token_2026";
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        return res.status(200).send(req.query['hub.challenge']);
    }
    res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const messageData = body.entry[0].changes[0].value.messages[0];
            const from = messageData.from; 
            const msgBody = messageData.text ? messageData.text.body.trim() : "";
            const messageId = messageData.id;

            try {
                await Message.create({ whatsappId: messageId, fromNumber: String(from), body: msgBody, direction: 'incoming' });

                const cleanMessage = msgBody.toLowerCase();
                const matchedRule = await Rule.findOne({ keyword: cleanMessage });

                let replyText = matchedRule ? matchedRule.replyText : `🤖 I'm sorry, I don't recognize the word "${msgBody}". \n\nPlease wait, and a human agent will assist you shortly!`;

                const outboundId = await sendWhatsAppMessage(from, replyText);
                await Message.create({ whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), body: replyText, direction: 'outgoing' });

            } catch (dbError) {
                console.error("❌ Database Storage Error:", dbError);
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    } else {
        return res.sendStatus(404);
    }
});

app.get('/', (req, res) => res.send('Server is alive and running!'));
app.listen(PORT, () => console.log("Server is running smoothly on port " + PORT));