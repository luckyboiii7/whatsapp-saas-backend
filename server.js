const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Message = require('./models/Message');
const Rule = require('./models/Rule'); // 👈 Import our new Bot Brain model!
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
// NEW: BOT BUILDER ENDPOINTS
// ====================================================================

// A. Get all saved bot rules
app.get('/api/rules', async (req, res) => {
    try {
        const rules = await Rule.find();
        return res.status(200).json({ success: true, data: rules });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Server Error" });
    }
});

// B. Create or update a bot rule
app.post('/api/rules', async (req, res) => {
    try {
        const { keyword, replyText } = req.body;
        if (!keyword || !replyText) return res.status(400).json({ success: false, error: "Missing data" });

        // If the keyword exists, update it. If not, create a new one!
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
                // 1. Save incoming message
                await Message.create({ whatsappId: messageId, fromNumber: String(from), body: msgBody, direction: 'incoming' });

                // 2. 🧠 THE NEW BRAIN LOGIC: Search MongoDB for the exact keyword!
                const cleanMessage = msgBody.toLowerCase();
                const matchedRule = await Rule.findOne({ keyword: cleanMessage });

                let replyText = "";
                
                if (matchedRule) {
                    // We found a custom rule the business owner created!
                    replyText = matchedRule.replyText;
                } else {
                    // Fallback if the bot doesn't know the answer yet
                    replyText = `🤖 I'm sorry, I don't recognize the word "${msgBody}". \n\nPlease wait, and a human agent will assist you shortly!`;
                }

                // 3. Send and save outbound reply
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