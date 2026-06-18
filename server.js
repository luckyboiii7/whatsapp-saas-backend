const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io'); 

const Message = require('./models/Message');
const Rule = require('./models/Rule'); 
const User = require('./models/user'); 

const app = express();
app.use(cors()); 
app.use(express.json());

// WebSocket Server Wrapper
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "your_local_or_atlas_mongodb_connection_string_here";

mongoose.connect(MONGO_URI)
    .then(() => console.log("💾 Connected to MongoDB Atlas Cloud!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ====================================================================
// WEBSOCKET PIPELINE
// ====================================================================
io.on('connection', (socket) => {
    socket.on('join_channel', (businessPhone) => {
        socket.join(businessPhone);
    });
});

// ====================================================================
// META API HELPERS (TEXT & BUTTONS)
// ====================================================================
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

// 🧠 NEW: Send Interactive Clickable Buttons
async function sendWhatsAppButtons(toPhoneNumber, bodyText, buttonsArray) {
    const PHONE_NUMBER_ID = (process.env.PHONE_NUMBER_ID || "1212445375277979").trim();
    const ACCESS_TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();

    if (!ACCESS_TOKEN || buttonsArray.length === 0) return null;

    const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
    
    // Map buttons to Meta's strict structure (Max 3 buttons)
    const formattedButtons = buttonsArray.slice(0, 3).map((btn, index) => ({
        type: "reply",
        reply: {
            id: btn.id || `btn_${index}`,
            title: btn.title.substring(0, 20) // Meta enforces a 20 character limit
        }
    }));

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhoneNumber,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: bodyText },
            action: { buttons: formattedButtons }
        }
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
// SAAS API ENDPOINTS
// ====================================================================
app.post('/api/register', async (req, res) => {
    try {
        const { businessName, phoneNumber } = req.body;
        if (!businessName || !phoneNumber) return res.status(400).json({ success: false });

        let user = await User.findOne({ phoneNumber: String(phoneNumber) });
        if (user) return res.status(200).json({ success: true, message: "Welcome back!", user });

        user = await User.create({ businessName, phoneNumber: String(phoneNumber) });
        return res.status(201).json({ success: true, message: "Account created!", user });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
});

app.get('/api/messages/:phoneNumber', async (req, res) => {
    try {
        const chatHistory = await Message.find({ fromNumber: String(req.params.phoneNumber) }).sort({ timestamp: 1 });
        return res.status(200).json({ success: true, data: chatHistory });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
});

app.post('/api/messages/send', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        const outboundId = await sendWhatsAppMessage(phoneNumber, message);
        if (outboundId) {
            const newMsg = await Message.create({ whatsappId: outboundId, fromNumber: String(phoneNumber), body: message, direction: 'outgoing' });
            io.to(phoneNumber).emit('new_message', newMsg);
            return res.status(200).json({ success: true });
        }
        return res.status(500).json({ success: false });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
});

app.get('/api/rules', async (req, res) => {
    try {
        const rules = await Rule.find();
        return res.status(200).json({ success: true, data: rules });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
});

app.post('/api/rules', async (req, res) => {
    try {
        const { keyword, replyText } = req.body;
        await Rule.findOneAndUpdate({ keyword: keyword.toLowerCase() }, { replyText: replyText }, { upsert: true });
        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
});

// ====================================================================
// META WEBHOOK (UPGRADED FOR BUTTON CLICKS)
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
            const messageId = messageData.id;

            let msgBody = "";
            let buttonIdMatch = "";

            // 🧠 1. Check if it's normal text OR a button click
            if (messageData.text) {
                msgBody = messageData.text.body.trim();
            } else if (messageData.interactive && messageData.interactive.button_reply) {
                msgBody = messageData.interactive.button_reply.title; // The visible text on the button
                buttonIdMatch = messageData.interactive.button_reply.id; // The hidden backend ID
            }

            if (msgBody) {
                try {
                    // Save the user's incoming message to DB and push to Flutter
                    const incomingMsg = await Message.create({ whatsappId: messageId, fromNumber: String(from), body: msgBody, direction: 'incoming' });
                    io.emit('new_message', incomingMsg);

                    // 🧠 2. Determine what they want (Prioritize button ID over text)
                    const lookupQuery = buttonIdMatch ? buttonIdMatch.toLowerCase() : msgBody.toLowerCase();
                    
                    // 🧠 3. Interactive Menu Logic
                    if (lookupQuery === 'hello' || lookupQuery === 'hi' || lookupQuery === 'menu') {
                        const multiChoiceBody = "👋 Welcome to Wadhwa Plywood & Hardware! How can we help you today? Select an option below:";
                        const buttonMenu = [
                            { id: "products", title: "📁 View Products" },
                            { id: "hours", title: "⏰ Store Hours" },
                            { id: "contact", title: "👨‍💻 Speak to Human" }
                        ];

                        const outboundId = await sendWhatsAppButtons(from, multiChoiceBody, buttonMenu);
                        const systemReply = await Message.create({ whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), body: `[Sent Button Menu]: ${multiChoiceBody}`, direction: 'outgoing' });
                        io.emit('new_message', systemReply);
                    } else {
                        // 🧠 4. Fallback to Database Rules Engine
                        const matchedRule = await Rule.findOne({ keyword: lookupQuery });
                        let replyText = matchedRule ? matchedRule.replyText : `🤖 I don't recognize that command. Type "Menu" to see your options!`;

                        const outboundId = await sendWhatsAppMessage(from, replyText);
                        const systemReply = await Message.create({ whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), body: replyText, direction: 'outgoing' });
                        io.emit('new_message', systemReply);
                    }
                } catch (dbError) {
                    console.error("❌ Webhook Pipeline Error:", dbError);
                }
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    }
    return res.sendStatus(404);
});

app.get('/', (req, res) => res.send('WebSocket SaaS Server Alive!'));
server.listen(PORT, () => console.log("Server running smoothly with active WebSockets on port " + PORT));