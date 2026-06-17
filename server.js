// 1. FORCE NODE TO USE STABLE GOOGLE DNS
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// 🔐 Load Environment Variables
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const User = require('./models/user');

const app = express();
const cors = require('cors');
app.use(cors());
app.use(express.json());

// 🔗 Your MongoDB Atlas link here
const mongoURI = "mongodb+srv://kesh:keshoncam@kesh.x10nuws.mongodb.net/whatsapp-saas?retryWrites=true&w=majority";

// Connect to the Cloud Database
mongoose.connect(mongoURI)
    .then(async () => {
        console.log("✅ Successfully connected to MongoDB Atlas Cloud!");
        await User.syncIndexes(); 
    })
    .catch((err) => console.error("❌ Database connection error:", err));

// Test route
app.get('/test', (req, res) => {
    res.send("Backend server is working perfectly!");
});

// 📝 Route to Register a New Shopkeeper via Frontend
app.post('/register', async (req, res) => {
    try {
        const { businessName, phoneNumber, email } = req.body;

        const userExists = await User.findOne({ phoneNumber });
        if (userExists) {
            return res.status(400).json({ message: "This phone number is already registered!" });
        }

        const newUser = new User({
            businessName,
            phoneNumber,
            email,
            subscriptionStatus: 'trial'
        });

        await newUser.save();

        res.status(201).json({
            message: "🎉 Customer registered successfully!",
            user: newUser
        });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "Server error during registration." });
    }
});

// 🧠 NEW: Route to Save Custom Auto-Replies from the Flutter App
app.post('/update-reply', async (req, res) => {
    try {
        // Flutter will send us the user's phone number, the keyword, and the custom reply
        const { phoneNumber, keyword, replyMessage } = req.body;
        
        // 1. Find the user in the database
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        // 2. Clean the keyword (make it lowercase so "MENU", "Menu", and "menu" all match)
        const cleanKeyword = keyword.trim().toLowerCase();
        
        // 3. Save the new rule directly into their MongoDB profile
        user.customReplies.set(cleanKeyword, replyMessage);
        await user.save();

        console.log(`🧠 Saved rule for ${phoneNumber}: "${cleanKeyword}" -> "${replyMessage}"`);
        res.status(200).json({ message: "Rule saved successfully!" });

    } catch (error) {
        console.error("Update Reply Error:", error);
        res.status(500).json({ message: "Server error saving reply." });
    }
});

// 🔐 Meta Webhook Verification
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = "kesh_whatsapp_saas_secret_token_2026";
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log("✅ Meta Webhook Verified Successfully!");
            return res.status(200).send(challenge);
        } else {
            return res.status(403).sendStatus(403);
        }
    }
});

// 📥 Incoming WhatsApp Messages Receiver
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value && body.entry[0].changes[0].value.messages) {
                
                const messageData = body.entry[0].changes[0].value.messages[0];
                const fromNumber = messageData.from; 
                const messageText = messageData.text ? messageData.text.body : ""; 

                console.log(`\n💬 USER SAID -> From: ${fromNumber} | Text: "${messageText}"`);

                const command = messageText.trim().toLowerCase();
                let replyText = "";

                let existingUser = await User.findOne({ phoneNumber: fromNumber });

                // 🧠 THE BRAIN: Check the user's custom dictionary FIRST
                if (existingUser && existingUser.customReplies && existingUser.customReplies.has(command)) {
                    replyText = existingUser.customReplies.get(command);
                } 
                // 🔀 Fallback to Default Global Rules if they don't have a custom one
                else if (command === "hi" || command === "hello" || command === "hey") {
                    if (existingUser) {
                         replyText = `Welcome back, ${existingUser.businessName}! 🤖\n\nType *Menu* to see your options.`;
                    } else {
                         replyText = "Welcome to WA Bot! 🤖\n\nHow can we help you today?\nReply with a keyword:\n1️⃣ *Register* - Create a new account\n2️⃣ *Menu* - See our options";
                    }
                } 
                else if (command === "register") {
                    if (existingUser) {
                        replyText = "You already have an account with us! 🎉\n\nType *Menu* to get started.";
                    } else {
                        const newUser = new User({
                            phoneNumber: fromNumber,
                            businessName: "New Shop",
                            subscriptionStatus: 'trial'
                        });
                        await newUser.save();
                        replyText = "🎉 Awesome! Your account has been officially saved to our database.\n\nType *Menu* to see what you can do next!";
                    }
                } 
                else if (command === "menu") {
                    replyText = "📋 *WA Bot Menu*\n- Services\n- Products\n- Subscriptions\n\n(Reply 'Hi' to go back)";
                } 
                else {
                    replyText = "I didn't quite catch that. 🤔\nType *Hi* to see the main menu!";
                }

                // 📤 Send the Reply
                try {
                    await axios({
                        method: 'POST',
                        url: `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
                        headers: {
                            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        data: {
                            messaging_product: "whatsapp",
                            to: fromNumber,
                            type: "text",
                            text: { body: replyText }
                        }
                    });
                    console.log(`✅ BOT REPLIED:\n"${replyText}"\n`);
                } catch (apiError) {
                    console.error("❌ Failed to send auto-reply:", apiError.response ? apiError.response.data : apiError.message);
                }
            }
            return res.status(200).send('EVENT_RECEIVED');
        } else {
            return res.sendStatus(404);
        }
    } catch (error) {
        console.error("❌ Webhook Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running smoothly on port ${PORT}`);
});