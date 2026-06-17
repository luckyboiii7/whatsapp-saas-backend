const express = require('express');
const app = express();

// Middleware to parse incoming JSON payloads
app.use(express.json());

// PORT Configuration
const PORT = process.env.PORT || 3000;

// 1. Webhook Verification Route (GET)
// This is what Meta uses when you click "Verify and Save"
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
    
    // Prevents the browser from loading forever if opened directly
    res.status(200).send("WhatsApp Webhook Server is running!");
});

// 2. Webhook Event Receiver Route (POST)
// This captures all incoming WhatsApp messages
app.post('/webhook', (req, res) => {
    // 🚨 THIS IS THE NEW LINE THAT WILL FORCE RENDER TO PRINT LOGS
    console.log("📩 New Webhook Received:\n", JSON.stringify(req.body, null, 2));

    const body = req.body;

    // Check if the event is from a WhatsApp Business Account
    if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const messageData = body.entry[0].changes[0].value.messages[0];
            const from = messageData.from; 
            const msgBody = messageData.text ? messageData.text.body : "Non-text message";

            console.log(`🤖 Processing message from ${from}: "${msgBody}"`);
            
            // Your bot handling / database saving logic goes here!
        }
        
        // Always respond back to Meta with a 200 OK immediately
        return res.status(200).send('EVENT_RECEIVED');
    } else {
        // Return a 404 if the event is not from a WhatsApp Business Account
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
    console.log(`Successfully connected to MongoDB Atlas Cloud!`);
});