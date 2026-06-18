const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); // 👈 Required to wrap express with WebSockets
const { Server } = require('socket.io'); // 👈 Import Socket.io

const Message = require('./models/Message');
const Rule = require('./models/Rule'); 
const User = require('./models/user'); 

const app = express();
app.use(cors()); 
app.use(express.json());

// 👈 Create HTTP server wrapper for Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows your Flutter app to connect from anywhere
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "your_mongodb_uri_here";

mongoose.connect(MONGO_URI)
    .then(() => console.log("💾 Connected to MongoDB Atlas Cloud!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ====================================================================
// LIVE WEBSOCKET PIPELINE CONFIGURATION
// ====================================================================
io.on('connection', (socket) => {
    console.log(`🔌 A business dashboard client connected: ${socket.id}`);

    // Join a private room unique to this business's phone number channel
    socket.on('join_channel', (businessPhone) => {
        socket.join(businessPhone);
        console.log(`🏢 Client joined isolated private channel room: ${businessPhone}`);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

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

// SaaS Registration Endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { businessName, phoneNumber } = req.body;
        if (!businessName || !phoneNumber) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        let user = await User.findOne({ phoneNumber: String(phoneNumber) });
        if (user) {
            return res.status(200).json({ success: true, message: "Welcome back!", user });
        }

        user = await User.create({ businessName, phoneNumber: String(phoneNumber) });
        return res.status(201).json({ success: true, message: "Account created successfully!", user });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
});

// Get Messages Log
app.get('/api/messages/:phoneNumber', async (req, res) => {
    try {
        const chatHistory = await Message.find({ fromNumber: String(req.params.phoneNumber) }).sort({ timestamp: 1 });
        return res.status(200).json({ success: true, data: chatHistory });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Server Error" });
    }
});

// Intercept & Send Outbound Message
app.post('/api/messages/send', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        const outboundId = await sendWhatsAppMessage(phoneNumber, message);
        if (outboundId) {
            const newMsg = await Message.create({ whatsappId: outboundId, fromNumber: String(phoneNumber), body: message, direction: 'outgoing' });
            
            // 👈 BROADCAST LIVE OUTGOING TO THE DASHBOARD INSTANTLY
            io.to(phoneNumber).emit('new_message', newMsg);

            return res.status(200).json({ success: true });
        }
        return res.status(500).json({ success: false, error: "Meta API Failed" });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Server Error" });
    }
});

// Bot Builder Rules Endpoints
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

// Meta Verification Webhook
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "kesh_whatsapp_saas_secret_token_2026";
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        return res.status(200).send(req.query['hub.challenge']);
    }
    res.sendStatus(403);
});

// Incoming Webhook Receptor
app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const messageData = body.entry[0].changes[0].value.messages[0];
            const from = messageData.from; 
            const msgBody = messageData.text ? messageData.text.body.trim() : "";
            const messageId = messageData.id;

            try {
                // Save incoming client message
                const incomingMsg = await Message.create({ whatsappId: messageId, fromNumber: String(from), body: msgBody, direction: 'incoming' });
                
                // 👈 PUSH INCOMING MESSAGE LIVE TO THE DASHBOARD OVER WEBSOCKET
                io.emit('new_message', incomingMsg);

                // Check automated rules engine matching
                const cleanMessage = msgBody.toLowerCase();
                const matchedRule = await Rule.findOne({ keyword: cleanMessage });
                let replyText = matchedRule ? matchedRule.replyText : `🤖 I'm sorry, I don't recognize "${msgBody}". A human agent will assist shortly!`;

                const outboundId = await sendWhatsAppMessage(from, replyText);
                const systemReply = await Message.create({ whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), body: replyText, direction: 'outgoing' });

                // 👈 PUSH THE BOT'S AUTOMATED CONVERSATION REPLY OVER WEBSOCKET
                io.emit('new_message', systemReply);

            } catch (dbError) {
                console.error("❌ Webhook Pipeline Error:", dbError);
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    }
    return res.sendStatus(404);
});

app.get('/', (req, res) => res.send('WebSocket SaaS Server Alive!'));

// 👈 Critical: Listen with the custom wrap-around server variable, NOT app.listen
server.listen(PORT, () => console.log("Server running smoothly with active WebSockets on port " + PORT));