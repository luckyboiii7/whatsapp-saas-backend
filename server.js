const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io'); 
const multer = require('multer'); 
const fs = require('fs');         
const os = require('os');         
const crypto = require('crypto'); 
const cloudinary = require('cloudinary').v2; 

const Message = require('./models/Message');
const Rule = require('./models/Rule'); 
const User = require('./models/user'); 
const BotStatus = require('./models/BotStatus'); 
const Order = require('./models/Order'); 
const Product = require('./models/Product'); 

const app = express();
app.use(cors()); 

// 🛠️ CAPTURE RAW BODY FOR RAZORPAY SECURITY SIGNATURE
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "your_mongodb_connection_string_here";

// 💸 YOUR RAZORPAY TEST KEYS INTEGRATED
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_T4NshlJahTxAUs"; 
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "RofcA45NupOB1cLJKtJgbIJj";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "wadhwasaas2026";

const upload = multer({ dest: os.tmpdir() });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

mongoose.connect(MONGO_URI)
    .then(() => console.log("💾 Connected to MongoDB Atlas Cloud!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

io.on('connection', (socket) => {
    socket.on('join_channel', (businessPhone) => { 
        socket.join(businessPhone); 
    });
});

// ====================================================================
// CORE HELPER FUNCTIONS
// ====================================================================
async function generateRazorpayLink(amount, referenceId, customerPhone, isSubscription = false, businessPhone = "", callbackUrl = "") {
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    try {
        const payload = {
            amount: Math.round(amount * 100), currency: "INR",
            description: isSubscription ? "Monthly SaaS Subscription (Wadhwa Software)" : `Payment for Order #${referenceId.substring(0, 6)}`,
            customer: { contact: customerPhone },
            notify: { sms: false, email: false },
            notes: { 
                order_id: referenceId, 
                isSubscription: isSubscription ? 'true' : 'false', 
                businessPhone: businessPhone 
            }
        };

        if (callbackUrl) {
            payload.callback_url = callbackUrl;
            payload.callback_method = "get";
        }

        const response = await fetch('https://api.razorpay.com/v1/payment_links', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        return data.short_url; 
    } catch (error) { 
        console.error("Razorpay Generation Error:", error);
        return null; 
    }
}

async function sendWhatsAppMessage(metaPhoneId, metaToken, toPhoneNumber, messageText) {
    if (!metaToken || !metaPhoneId) return null;
    const url = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;
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
            headers: { 'Authorization': `Bearer ${metaToken}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        const data = await response.json();
        if (response.ok) return data.messages[0].id;
        return null;
    } catch (error) { 
        console.error("Meta Send Error:", error);
        return null; 
    }
}

async function validateMetaKeys(phoneId, token) {
    try {
        const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        return !data.error; 
    } catch (e) { 
        return false; 
    }
}

async function handleOtpDispatch(user, deliveryMethod) {
    const otp = Math.floor(1000 + Math.random() * 9000).toString(); 
    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60000); 
    await user.save();

    if (deliveryMethod === 'email') {
        console.log(`\n\n📧 [MOCK EMAIL SENT] To: ${user.adminEmail} | OTP CODE: ${otp}\n\n`);
    } else {
        const msg = `🔐 *Security Alert*\nYour WhatsApp SaaS OTP is: *${otp}*.\nDo not share this with anyone. Valid for 10 mins.`;
        await sendWhatsAppMessage(user.metaPhoneId, user.metaToken, user.adminPersonalPhone, msg);
        console.log(`\n\n📱 [WHATSAPP OTP INITIATED] To: ${user.adminPersonalPhone} | OTP CODE: ${otp}\n\n`);
    }
    return true;
}

// ====================================================================
// MULTI-TENANT SAAS API ENDPOINTS (AUTHENTICATION)
// ====================================================================

app.post('/api/register', async (req, res) => {
    try {
        const { businessName, phoneNumber, password, metaPhoneId, metaToken, adminEmail, adminPersonalPhone } = req.body;

        let user = await User.findOne({ phoneNumber: String(phoneNumber) });
        if (user) {
            return res.status(400).json({ success: false, message: "Phone number already registered. Please go to login." });
        }

        const keysValid = await validateMetaKeys(metaPhoneId, metaToken);
        if (!keysValid) {
            return res.status(400).json({ success: false, message: "Invalid Meta Keys. Registration rejected by Facebook." });
        }

        user = await User.create({ businessName, phoneNumber: String(phoneNumber), password, metaPhoneId, metaToken, adminEmail, adminPersonalPhone });
        return res.status(201).json({ success: true, message: "Account securely created!", user });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server error" }); 
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { phoneNumber, password, deliveryMethod } = req.body;
        const user = await User.findOne({ phoneNumber: String(phoneNumber) });
        
        if (!user) {
            return res.status(404).json({ success: false, message: "Business not found." });
        }
        if (user.password !== password) {
            return res.status(401).json({ success: false, message: "Incorrect password." });
        }

        await handleOtpDispatch(user, deliveryMethod);
        return res.status(200).json({ success: true, requiresOtp: true, message: "OTP Sent" });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server error" }); 
    }
});

app.post('/api/forgot-password', async (req, res) => {
    try {
        const { phoneNumber, deliveryMethod } = req.body;
        const user = await User.findOne({ phoneNumber: String(phoneNumber) });
        
        if (!user) {
            return res.status(404).json({ success: false, message: "Business not found." });
        }

        await handleOtpDispatch(user, deliveryMethod);
        return res.status(200).json({ success: true, message: "OTP Sent" });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server error" }); 
    }
});

app.post('/api/verify-otp', async (req, res) => {
    try {
        const { phoneNumber, otp, newPassword } = req.body;
        const user = await User.findOne({ phoneNumber: String(phoneNumber) });
        
        if (!user) {
            return res.status(404).json({ success: false, message: "Business not found." });
        }
        
        if (!user.otpCode || user.otpCode !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP." });
        }
        if (user.otpExpires < new Date()) {
            return res.status(400).json({ success: false, message: "OTP expired. Please try again." });
        }

        user.otpCode = undefined;
        user.otpExpires = undefined;

        if (newPassword) {
            user.password = newPassword;
        }
        
        await user.save();
        return res.status(200).json({ success: true, message: "Verified successfully!", user });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server error" }); 
    }
});

// ====================================================================
// 🚨 SUPER ADMIN "GOD MODE" & SUBSCRIPTION ENDPOINTS
// ====================================================================

const SUPER_ADMIN_PASS = "masterwadhwa2026"; 

app.post('/api/admin/login', (req, res) => {
    if (req.body.password === SUPER_ADMIN_PASS) {
        return res.status(200).json({ success: true });
    }
    return res.status(401).json({ success: false, message: "Unauthorized" });
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}, 'businessName phoneNumber adminEmail adminPersonalPhone subscriptionStatus createdAt metaPhoneId');
        return res.status(200).json({ success: true, data: users });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/admin/users/:id/toggle-suspend', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false });
        }
        
        user.subscriptionStatus = user.subscriptionStatus === 'suspended' ? 'active' : 'suspended';
        await user.save();
        return res.status(200).json({ success: true, status: user.subscriptionStatus });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

// 💸 ACTIVE PAYMENT RECOVERY ENGINE: Checks Razorpay even if the webhook failed!
app.get('/api/business/status/:phone', async (req, res) => {
    try {
        const user = await User.findOne({ phoneNumber: req.params.phone });
        if (!user) {
            return res.status(404).json({ success: false });
        }

        let currentStatus = user.subscriptionStatus;

        // 1. Math Check: Has the 30 day trial expired?
        if (currentStatus === 'trial') {
            const thirtyDaysInMillis = 30 * 24 * 60 * 60 * 1000;
            if (new Date() > new Date(user.createdAt.getTime() + thirtyDaysInMillis)) {
                user.subscriptionStatus = 'suspended';
                await user.save();
                currentStatus = 'suspended';
                console.log(`⏳ Trial Expired for: ${user.businessName}. Account locked.`);
            }
        }

        // 2. 🛠️ ACTIVE RECOVERY: If suspended, directly ask Razorpay if they paid!
        if (currentStatus === 'suspended') {
            const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
            const rzpRes = await fetch('https://api.razorpay.com/v1/payments', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            const rzpData = await rzpRes.json();
            
            if (rzpData && rzpData.items) {
                const recentlyPaid = rzpData.items.find(p => 
                    p.status === 'captured' && 
                    p.notes && 
                    p.notes.businessPhone === user.phoneNumber && 
                    p.notes.isSubscription === 'true' &&
                    (Date.now() / 1000 - p.created_at) < 86400 &&
                    p.notes.order_id !== user.lastPaymentId
                );

                if (recentlyPaid) {
                    user.subscriptionStatus = 'active';
                    user.lastPaymentId = recentlyPaid.notes.order_id; // CONSUME THE RECEIPT!
                    await user.save();
                    currentStatus = 'active';
                    console.log(`✅ ACTIVE RECOVERY: Consumed Razorpay payment for ${user.businessName}. UNLOCKING!`);
                }
            }
        }

        return res.status(200).json({ success: true, status: currentStatus });
    } catch (error) { 
        console.error("Status Check Error:", error);
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/subscription/pay', async (req, res) => {
    try {
        const user = await User.findOne({ phoneNumber: req.body.businessPhone });
        if (!user) {
            return res.status(404).json({ success: false });
        }

        const paymentLink = await generateRazorpayLink(100, "SUB_" + Date.now(), user.adminPersonalPhone, true, user.phoneNumber, req.body.callbackUrl);
        
        return res.status(200).json({ success: true, url: paymentLink });
    } catch (error) { 
        console.error("Payment Link Error:", error);
        return res.status(500).json({ success: false }); 
    }
});

// ====================================================================
// 📊 SAAS ANALYTICS & SECURE SETTINGS ENDPOINTS 
// ====================================================================

app.get('/api/analytics/:businessPhone', async (req, res) => {
    try {
        const phone = req.params.businessPhone;
        const paidOrders = await Order.find({ businessPhone: phone, status: 'paid' });
        const totalRevenue = paidOrders.reduce((sum, order) => sum + order.totalAmount, 0);
        const totalOrdersCount = await Order.countDocuments({ businessPhone: phone });
        const lowStockCount = await Product.countDocuments({ businessPhone: phone, stockQuantity: { $lt: 5 } });
        const uniqueCustomers = await Message.distinct('fromNumber', { businessPhone: phone, direction: 'incoming' });

        return res.status(200).json({
            success: true,
            data: {
                totalRevenue,
                totalOrdersCount,
                lowStockCount,
                totalContacts: uniqueCustomers.length
            }
        });
    } catch (error) {
        console.error("Analytics Error:", error);
        return res.status(500).json({ success: false });
    }
});

// 🔐 Request OTP for Settings Updates
app.post('/api/business/settings/request-otp', async (req, res) => {
    try {
        const { businessPhone, deliveryMethod } = req.body;
        const user = await User.findOne({ phoneNumber: businessPhone });
        if (!user) {
            return res.status(404).json({ success: false, message: "Business not found." });
        }

        await handleOtpDispatch(user, deliveryMethod);
        return res.status(200).json({ success: true, message: "OTP Sent successfully!" });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

// 🔐 Verify OTP & Save Profile Settings
app.post('/api/business/settings/verify', async (req, res) => {
    try {
        const { businessPhone, otp, newBusinessName, newAdminEmail, newPassword, newAdminPersonalPhone } = req.body;
        const user = await User.findOne({ phoneNumber: businessPhone });
        if (!user) {
            return res.status(404).json({ success: false });
        }

        if (!user.otpCode || user.otpCode !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP." });
        }
        if (user.otpExpires < new Date()) {
            return res.status(400).json({ success: false, message: "OTP has expired." });
        }

        // Clear OTP
        user.otpCode = undefined;
        user.otpExpires = undefined;

        // Apply changes
        if (newBusinessName) user.businessName = newBusinessName;
        if (newAdminEmail) user.adminEmail = newAdminEmail;
        if (newPassword) user.password = newPassword; 
        if (newAdminPersonalPhone) user.adminPersonalPhone = newAdminPersonalPhone;

        await user.save();
        return res.status(200).json({ success: true, message: "Settings Updated Securely!" });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
});

// ====================================================================
// CHAT & MEDIA ENDPOINTS
// ====================================================================

async function sendWhatsAppButtons(metaPhoneId, metaToken, toPhoneNumber, bodyText, buttonsArray) {
    if (!metaToken || !metaPhoneId || buttonsArray.length === 0) return null;
    const url = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;
    const formattedButtons = buttonsArray.slice(0, 3).map((btn, index) => ({ 
        type: "reply", 
        reply: { id: btn.id || `btn_${index}`, title: btn.title.substring(0, 20) } 
    }));
    const payload = { 
        messaging_product: "whatsapp", 
        recipient_type: "individual", 
        to: toPhoneNumber, 
        type: "interactive", 
        interactive: { type: "button", body: { text: bodyText }, action: { buttons: formattedButtons } } 
    };
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${metaToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (response.ok) return data.messages[0].id;
        return null;
    } catch (error) { 
        return null; 
    }
}

async function uploadMediaToWhatsApp(metaPhoneId, metaToken, filePath, mimeType, originalName) {
    if (!metaToken || !metaPhoneId) return null;
    const url = `https://graph.facebook.com/v20.0/${metaPhoneId}/media`;
    const fileBuffer = fs.readFileSync(filePath);
    const fileBlob = new Blob([fileBuffer], { type: mimeType });
    const formData = new FormData();
    formData.append('file', fileBlob, originalName);
    formData.append('messaging_product', 'whatsapp');
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${metaToken}` }, body: formData });
        const data = await response.json();
        return data.id; 
    } catch (error) { 
        return null; 
    }
}

async function sendWhatsAppMediaId(metaPhoneId, metaToken, toPhoneNumber, mediaId, mediaType, caption = "", filename = "") {
    if (!metaToken || !metaPhoneId) return null;
    const url = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;
    const payload = { 
        messaging_product: "whatsapp", 
        recipient_type: "individual", 
        to: toPhoneNumber, 
        type: mediaType, 
        [mediaType]: { id: mediaId } 
    };
    if (caption) payload[mediaType].caption = caption;
    if (mediaType === 'document' && filename) payload.document.filename = filename;
    
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${metaToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (response.ok) return data.messages[0].id;
        return null;
    } catch (error) { 
        return null; 
    }
}

app.get('/api/media/:businessPhone/:mediaId', async (req, res) => {
    try {
        const business = await User.findOne({ phoneNumber: req.params.businessPhone });
        if (!business) {
            return res.status(404).send('Business not found');
        }

        const metaRes = await fetch(`https://graph.facebook.com/v20.0/${req.params.mediaId}`, { headers: { 'Authorization': `Bearer ${business.metaToken}` }});
        const metaData = await metaRes.json();
        if (!metaData.url) {
            return res.status(404).send('Media not found');
        }

        const fileRes = await fetch(metaData.url, { headers: { 'Authorization': `Bearer ${business.metaToken}` }});
        const arrayBuffer = await fileRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        res.setHeader('Content-Type', metaData.mime_type);
        return res.send(buffer);
    } catch (error) {
        console.error("Media Fetch Error:", error);
        return res.status(500).send('Error Fetching Media');
    }
});

// 📌 FIXED: Fetch Contacts + Their Pinned/Archived statuses (Now searches BOTH incoming & outgoing)
app.get('/api/contacts/:businessPhone', async (req, res) => {
    try {
        const contacts = await Message.aggregate([
            // Matches any message associated with this business (incoming or outgoing)
            { $match: { businessPhone: req.params.businessPhone } }, 
            { $sort: { timestamp: -1 } },
            // Groups by the customer's phone number
            { $group: { 
                _id: "$fromNumber", // This stores the customer phone for both directions
                name: { $first: "$customerName" }, 
                lastMessage: { $first: "$body" }
            }},
            { $project: { phone: "$_id", name: 1, lastMessage: 1, _id: 0 } }
        ]);
        
        const user = await User.findOne({ phoneNumber: req.params.businessPhone });
        
        return res.status(200).json({ 
            success: true, 
            contacts: contacts,
            pinnedChats: user ? user.pinnedChats : [],
            archivedChats: user ? user.archivedChats : [],
            lockedChats: user ? user.lockedChats : []
        });
    } catch (e) { 
        return res.status(500).json({ success: false, message: e.message }); 
    }
});

// 📌 Save Contact Preferences (Pin, Archive, Lock)
app.post('/api/contacts/preferences', async (req, res) => {
    try {
        const { businessPhone, customerPhone, action } = req.body;
        const user = await User.findOne({ phoneNumber: businessPhone });
        if (!user) {
            return res.status(404).json({ success: false });
        }

        // Toggle Logic
        if (action === 'toggle_pin') {
            if (user.pinnedChats.includes(customerPhone)) {
                user.pinnedChats = user.pinnedChats.filter(p => p !== customerPhone);
            } else {
                user.pinnedChats.push(customerPhone);
            }
        } else if (action === 'toggle_archive') {
            if (user.archivedChats.includes(customerPhone)) {
                user.archivedChats = user.archivedChats.filter(p => p !== customerPhone);
            } else {
                user.archivedChats.push(customerPhone);
            }
        } else if (action === 'toggle_lock') {
            if (user.lockedChats.includes(customerPhone)) {
                user.lockedChats = user.lockedChats.filter(p => p !== customerPhone);
            } else {
                user.lockedChats.push(customerPhone);
            }
        }

        await user.save();
        return res.status(200).json({ success: true });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.get('/api/messages/:businessPhone/:customerPhone', async (req, res) => {
    try {
        const chatHistory = await Message.find({ businessPhone: req.params.businessPhone, fromNumber: String(req.params.customerPhone) }).sort({ timestamp: 1 });
        return res.status(200).json({ success: true, data: chatHistory });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/messages/send', async (req, res) => {
    try {
        const { businessPhone, phoneNumber, message } = req.body;
        const business = await User.findOne({ phoneNumber: businessPhone });
        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        const outboundId = await sendWhatsAppMessage(business.metaPhoneId, business.metaToken, phoneNumber, message);
        if (outboundId) {
            const newMsg = await Message.create({ businessPhone, whatsappId: outboundId, fromNumber: String(phoneNumber), body: message, direction: 'outgoing' });
            io.to(businessPhone).emit('new_message', newMsg);
            return res.status(200).json({ success: true });
        }
        
        return res.status(400).json({ success: false, message: "Meta API rejected message. (Sandbox limit or past 24 hours?)" });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server error sending message" }); 
    }
});

// 🚀 Meta Template Message Engine (Bypasses 24-hour limit)
app.post('/api/messages/send-template', async (req, res) => {
    try {
        const { businessPhone, phoneNumber, templateName } = req.body;
        const business = await User.findOne({ phoneNumber: businessPhone });
        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        const url = `https://graph.facebook.com/v20.0/${business.metaPhoneId}/messages`;
        
        const payload = { 
            messaging_product: "whatsapp", 
            to: phoneNumber, 
            type: "template", 
            template: { name: templateName, language: { code: "en_US" } } 
        };

        const response = await fetch(url, { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${business.metaToken}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        const data = await response.json();

        if (response.ok) {
            const newMsg = await Message.create({ businessPhone, whatsappId: data.messages[0].id, fromNumber: String(phoneNumber), body: `[Template Sent: ${templateName}]`, direction: 'outgoing' });
            io.to(businessPhone).emit('new_message', newMsg);
            return res.status(200).json({ success: true });
        }
        return res.status(400).json({ success: false, message: data.error?.message || "Meta API rejected template." });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server error sending template" }); 
    }
});

app.post('/api/messages/send-media', upload.single('file'), async (req, res) => {
    try {
        const { businessPhone, phoneNumber, caption } = req.body;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: "No file provided" });
        }

        const business = await User.findOne({ phoneNumber: businessPhone });
        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        const isImage = file.mimetype.startsWith('image/');
        const mediaType = isImage ? 'image' : 'document';

        const mediaId = await uploadMediaToWhatsApp(business.metaPhoneId, business.metaToken, file.path, file.mimetype, file.originalname);
        fs.unlinkSync(file.path);

        if (!mediaId) {
            return res.status(500).json({ success: false, message: "Failed to upload to Meta" });
        }

        const outboundId = await sendWhatsAppMediaId(business.metaPhoneId, business.metaToken, phoneNumber, mediaId, mediaType, caption, file.originalname);

        if (outboundId) {
            const newMsg = await Message.create({ businessPhone, whatsappId: outboundId, fromNumber: String(phoneNumber), body: `[Sent ${isImage ? 'Image' : 'Document'}: ${file.originalname}] ${caption ? '- ' + caption : ''}`, direction: 'outgoing' });
            io.to(businessPhone).emit('new_message', newMsg);
            return res.status(200).json({ success: true });
        }
        
        return res.status(400).json({ success: false, message: "Meta API rejected media. (Sandbox limit?)" });
    } catch (error) { 
        return res.status(500).json({ success: false, message: "Server Error" }); 
    }
});

// ====================================================================
// BOT, RULES, PRODUCTS, AND ORDERS
// ====================================================================

app.post('/api/bot/toggle', async (req, res) => {
    try {
        const status = await BotStatus.findOneAndUpdate(
            { businessPhone: req.body.businessPhone, customerPhone: String(req.body.customerPhone) }, 
            { isBotPaused: req.body.isBotPaused, updatedAt: Date.now() }, 
            { upsert: true, returnDocument: 'after' }
        );
        io.to(req.body.businessPhone).emit('bot_status_changed', status);
        return res.status(200).json({ success: true, data: status });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.get('/api/bot/status/:businessPhone/:customerPhone', async (req, res) => {
    try {
        const status = await BotStatus.findOne({ businessPhone: req.params.businessPhone, customerPhone: String(req.params.customerPhone) });
        return res.status(200).json({ success: true, isBotPaused: status ? status.isBotPaused : false });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.get('/api/rules/:businessPhone', async (req, res) => {
    try { 
        const rules = await Rule.find({ businessPhone: req.params.businessPhone });
        return res.status(200).json({ success: true, data: rules }); 
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/rules', async (req, res) => {
    try {
        await Rule.findOneAndUpdate(
            { businessPhone: req.body.businessPhone, keyword: req.body.keyword.toLowerCase() }, 
            { replyText: req.body.replyText }, 
            { upsert: true, returnDocument: 'after' }
        );
        return res.status(200).json({ success: true });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/catalog/upload-image', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }
        const result = await cloudinary.uploader.upload(req.file.path, { folder: "whatsapp_saas_catalog" });
        fs.unlinkSync(req.file.path);
        
        return res.status(200).json({ success: true, imageUrl: result.secure_url });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.get('/api/products/:businessPhone', async (req, res) => {
    try { 
        const products = await Product.find({ businessPhone: req.params.businessPhone }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: products }); 
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/products', async (req, res) => {
    try { 
        const product = await Product.create(req.body);
        return res.status(201).json({ success: true, data: product }); 
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try { 
        await Product.findByIdAndDelete(req.params.id); 
        return res.status(200).json({ success: true }); 
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.get('/api/orders/:businessPhone', async (req, res) => {
    try { 
        const orders = await Order.find({ businessPhone: req.params.businessPhone }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: orders }); 
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/orders/:id/send-invoice', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        const business = await User.findOne({ phoneNumber: order.businessPhone });
        
        order.totalAmount = req.body.newTotal; 
        order.status = 'pending_payment'; 
        await order.save();
        io.to(order.businessPhone).emit('order_updated', order);
        
        const paymentLink = await generateRazorpayLink(order.totalAmount, String(order._id), order.customerPhone);
        const outboundId = await sendWhatsAppMessage(business.metaPhoneId, business.metaToken, order.customerPhone, `🧾 Good news! Your custom quotation is ready.\n\nYour final total is ₹${req.body.newTotal}.\n\nSecure Payment Link:\n${paymentLink}`);
        
        const systemReply = await Message.create({ businessPhone: order.businessPhone, whatsappId: outboundId || `reply-${Date.now()}`, fromNumber: order.customerPhone, body: `[Sent Final Invoice Link: ₹${req.body.newTotal}]`, direction: 'outgoing' });
        io.to(order.businessPhone).emit('new_message', systemReply);
        return res.status(200).json({ success: true, data: order });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/orders/:id/mark-paid', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        const business = await User.findOne({ phoneNumber: order.businessPhone });
        
        order.status = 'paid'; 
        await order.save(); 
        io.to(order.businessPhone).emit('order_updated', order);
        
        for (let item of order.items) { 
            await Product.findOneAndUpdate({ businessPhone: order.businessPhone, name: item.name }, { $inc: { stockQuantity: -item.quantity } }); 
        }

        const outboundId = await sendWhatsAppMessage(business.metaPhoneId, business.metaToken, order.customerPhone, `✅ Payment received! Your order is now confirmed and is being processed for dispatch. Thank you!`);
        const systemReply = await Message.create({ businessPhone: order.businessPhone, whatsappId: outboundId || `reply-${Date.now()}`, fromNumber: order.customerPhone, body: `[Sent Payment Receipt]`, direction: 'outgoing' });
        io.to(order.businessPhone).emit('new_message', systemReply);
        return res.status(200).json({ success: true, data: order });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

// ====================================================================
// WEBHOOKS
// ====================================================================

app.post('/razorpay-webhook', async (req, res) => {
    console.log("🔔 WEBHOOK HIT:", req.body ? req.body.event : 'Unknown');
    try {
        const signature = req.headers['x-razorpay-signature'];
        const bodyToHash = req.rawBody || JSON.stringify(req.body);
        const expectedSignature = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(bodyToHash).digest('hex');
        
        if (expectedSignature !== signature) {
            console.error("❌ Webhook Signature Mismatch!");
            return res.status(400).send('Invalid signature');
        }

        if (req.body.event === 'payment_link.paid') {
            const entity = req.body.payload.payment_link.entity;
            const notes = entity.notes;
            const amountPaid = entity.amount_paid || entity.amount; 
            const paymentCurrency = entity.currency;
            
            if (notes.isSubscription === 'true') {
                const businessPhone = notes.businessPhone;
                const subOrderId = notes.order_id;
                
                const user = await User.findOne({ phoneNumber: businessPhone });
                if (user && user.lastPaymentId !== subOrderId && amountPaid >= 10000 && paymentCurrency === 'INR') {
                    user.subscriptionStatus = 'active';
                    user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    user.lastPaymentId = subOrderId;
                    await user.save();
                    console.log(`✅ SaaS SUBSCRIPTION PAID & UNLOCKED FOR: ${businessPhone}`);
                }
            } 
            else {
                const orderId = notes.order_id; 
                const order = await Order.findById(orderId);
                if (order && order.status !== 'paid' && amountPaid >= (order.totalAmount * 100) && paymentCurrency === 'INR') {
                    const business = await User.findOne({ phoneNumber: order.businessPhone });
                    order.status = 'paid'; 
                    await order.save();
                    io.to(order.businessPhone).emit('order_updated', order); 
                    
                    for (let item of order.items) { 
                        await Product.findOneAndUpdate({ businessPhone: order.businessPhone, name: item.name }, { $inc: { stockQuantity: -item.quantity } }); 
                    }

                    const outboundId = await sendWhatsAppMessage(business.metaPhoneId, business.metaToken, order.customerPhone, `✅ Payment of ₹${order.totalAmount} received automatically via Razorpay!`);
                    const systemReply = await Message.create({ businessPhone: order.businessPhone, whatsappId: outboundId || `reply-${Date.now()}`, fromNumber: order.customerPhone, body: `[Sent Automated Payment Receipt]`, direction: 'outgoing' });
                    io.to(order.businessPhone).emit('new_message', systemReply);
                }
            }
        }
        res.status(200).send('OK');
    } catch (e) { 
        res.status(500).send('Webhook Error'); 
    }
});

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
            
            const businessPhoneId = body.entry[0].changes[0].value.metadata.phone_number_id;
            const businessUser = await User.findOne({ metaPhoneId: businessPhoneId });
            
            if (!businessUser) {
                console.log("Message received for unregistered Phone ID:", businessPhoneId);
                return res.status(200).send('EVENT_RECEIVED'); 
            }

            let currentSubStatus = businessUser.subscriptionStatus;
            
            if (new Date() > businessUser.subscriptionExpiresAt && currentSubStatus !== 'suspended') {
                businessUser.subscriptionStatus = 'suspended';
                businessUser.consumedReceipts.push('AUTO_EXPIRE_' + Date.now());
                await businessUser.save();
                currentSubStatus = 'suspended';
                console.log(`⏳ Subscription Expired via Webhook. Account locked for: ${businessUser.businessName}`);
            }

            if (currentSubStatus === 'suspended') {
                return res.status(200).send('EVENT_RECEIVED');
            }

            const activeBusinessPhone = businessUser.phoneNumber;
            const activeMetaToken = businessUser.metaToken;

            const messageData = body.entry[0].changes[0].value.messages[0];
            const from = messageData.from; 
            const messageId = messageData.id;

            let extractedName = "Unknown";
            if (body.entry[0].changes[0].value.contacts && body.entry[0].changes[0].value.contacts.length > 0) {
                extractedName = body.entry[0].changes[0].value.contacts[0].profile.name || "Unknown";
            }

            const botStatus = await BotStatus.findOne({ businessPhone: activeBusinessPhone, customerPhone: String(from) });
            const isPaused = botStatus && botStatus.isBotPaused;

            if (messageData.type === 'order') {
                const items = messageData.order.product_items;
                let totalAmount = 0; 
                let requiresQuotation = false; 
                let formattedItems = [];
                let stockErrorMsg = "";

                for (let item of items) {
                    const price = item.item_price || 0; 
                    const qty = item.quantity || 1;
                    
                    const dbProduct = await Product.findOne({ businessPhone: activeBusinessPhone, name: item.product_retailer_id });
                    if (dbProduct && qty > dbProduct.stockQuantity) {
                        stockErrorMsg += `❌ *${item.product_retailer_id}* (You ordered ${qty}, but we only have ${dbProduct.stockQuantity} left!)\n`;
                    }
                    
                    totalAmount += (price * qty); 
                    if (price === 0) requiresQuotation = true; 
                    formattedItems.push({ name: item.product_retailer_id, quantity: qty, price: price });
                }

                if (stockErrorMsg !== "") {
                    const replyText = `⚠️ *Order Cannot Be Processed*\n\nSome items in your cart are out of stock:\n${stockErrorMsg}\nPlease adjust your cart and try sending again.`;
                    const outboundId = await sendWhatsAppMessage(businessPhoneId, activeMetaToken, from, replyText);
                    const systemReply = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), customerName: extractedName, body: `[Rejected Cart: Stock Limit Reached]`, direction: 'outgoing' });
                    io.to(activeBusinessPhone).emit('new_message', systemReply);
                    return res.status(200).send('EVENT_RECEIVED');
                }

                const routingMode = requiresQuotation ? 'quotation' : 'instant_pay';
                const newOrder = await Order.create({ businessPhone: activeBusinessPhone, customerPhone: String(from), items: formattedItems, totalAmount: totalAmount, routingMode: routingMode, status: requiresQuotation ? 'pending_quote' : 'pending_payment' });
                io.to(activeBusinessPhone).emit('new_order', newOrder);

                const cartSummary = `🛒 *Cart Received* | Mode: ${routingMode.toUpperCase()}\nItems: ${items.length}\nTotal: ₹${totalAmount}`;
                const incomingMsg = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: messageId, fromNumber: String(from), customerName: extractedName, body: cartSummary, direction: 'incoming' });
                io.to(activeBusinessPhone).emit('new_message', incomingMsg);

                if (isPaused) return res.status(200).send('EVENT_RECEIVED');

                if (requiresQuotation) {
                    const outboundId = await sendWhatsAppMessage(businessPhoneId, activeMetaToken, from, "🛒 We received your cart! Because it contains custom materials, we are calculating your bulk discount and final quotation. A human agent will message you shortly. 🛠️");
                    const systemReply = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), customerName: extractedName, body: `[Sent Quotation Notice]`, direction: 'outgoing' });
                    io.to(activeBusinessPhone).emit('new_message', systemReply);
                } else {
                    const replyText = `🛒 We received your cart! Your total is ₹${totalAmount}. How would you like to proceed?`;
                    const buttons = [{ id: `pay_${newOrder._id}_${totalAmount}`, title: "💳 Pay Now" }, { id: `invoice_${newOrder._id}`, title: "📝 Request Invoice" }];
                    const outboundId = await sendWhatsAppButtons(businessPhoneId, activeMetaToken, from, replyText, buttons);
                    const systemReply = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), customerName: extractedName, body: `[Sent Payment Options for ₹${totalAmount}]`, direction: 'outgoing' });
                    io.to(activeBusinessPhone).emit('new_message', systemReply);
                }
                return res.status(200).send('EVENT_RECEIVED');
            }

            let msgBody = "";
            let buttonIdMatch = "";

            if (messageData.text) {
                msgBody = messageData.text.body.trim();
            } else if (messageData.interactive && messageData.interactive.button_reply) {
                msgBody = messageData.interactive.button_reply.title;
                buttonIdMatch = messageData.interactive.button_reply.id;
            } else if (messageData.type === 'image') {
                msgBody = `[MEDIA:image:${messageData.image.id}]`;
            } else if (messageData.type === 'audio') {
                msgBody = `[MEDIA:audio:${messageData.audio.id}]`;
            } else if (messageData.type === 'document') {
                msgBody = `[MEDIA:document:${messageData.document.id}]`;
            }

            if (msgBody) {
                try {
                    const incomingMsg = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: messageId, fromNumber: String(from), customerName: extractedName, body: msgBody, direction: 'incoming' });
                    io.to(activeBusinessPhone).emit('new_message', incomingMsg);

                    if (isPaused) return res.status(200).send('EVENT_RECEIVED');

                    const lookupQuery = buttonIdMatch ? buttonIdMatch.toLowerCase() : msgBody.toLowerCase();
                    
                    if (lookupQuery.startsWith('pay_')) {
                        const parts = lookupQuery.split('_');
                        const paymentLink = await generateRazorpayLink(parts[2], parts[1], from);
                        const outboundId = await sendWhatsAppMessage(businessPhoneId, activeMetaToken, from, `Here is your secure payment link for Order #${parts[1].substring(0,6)}: \n\n${paymentLink}`);
                        const systemReply = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), customerName: extractedName, body: `[Sent Secure Payment Link]`, direction: 'outgoing' });
                        io.to(activeBusinessPhone).emit('new_message', systemReply);
                        return res.status(200).send('EVENT_RECEIVED');
                    }

                    if (['hello', 'hi', 'menu'].includes(lookupQuery)) {
                        const multiChoiceBody = "👋 Welcome! How can we help you today?";
                        const buttonMenu = [{ id: "products", title: "📁 View Products" }, { id: "contact", title: "👨‍💻 Speak to Human" }];
                        const outboundId = await sendWhatsAppButtons(businessPhoneId, activeMetaToken, from, multiChoiceBody, buttonMenu);
                        const systemReply = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), customerName: extractedName, body: `[Menu]: ${multiChoiceBody}`, direction: 'outgoing' });
                        io.to(activeBusinessPhone).emit('new_message', systemReply);
                    } 
                    else if (lookupQuery === 'products') {
                        const inventory = await Product.find({ businessPhone: activeBusinessPhone }).limit(10); 
                        
                        if (inventory.length === 0) {
                            const outboundId = await sendWhatsAppMessage(businessPhoneId, activeMetaToken, from, "Our catalog is currently being updated. Please check back later!");
                            const systemReply = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), customerName: extractedName, body: `[Catalog Empty Message Sent]`, direction: 'outgoing' });
                            io.to(activeBusinessPhone).emit('new_message', systemReply);
                        } else {
                            let catalogText = "📦 *Live Inventory Catalog:*\n\n";
                            inventory.forEach((item, index) => {
                                const priceDisplay = item.price === 0 ? "Ask for Quote 📝" : `₹${item.price}`;
                                catalogText += `${index + 1}. *${item.name}*\n   _${item.description}_\n   💰 Price: ${priceDisplay} | 📦 In Stock: ${item.stockQuantity}\n\n`;
                            });
                            catalogText += "🛒 *To order:* Simply reply with the items you need!";
                            const outboundId = await sendWhatsAppMessage(businessPhoneId, activeMetaToken, from, catalogText);
                            const systemReply = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), customerName: extractedName, body: `[Sent Dynamic Catalog from DB]`, direction: 'outgoing' });
                            io.to(activeBusinessPhone).emit('new_message', systemReply);
                        }
                    } 
                    else if (!msgBody.startsWith('[MEDIA:')) {
                        const allRules = await Rule.find({ businessPhone: activeBusinessPhone });
                        let matchedRule = null;
                        
                        for (let rule of allRules) {
                            const triggerWords = rule.keyword.split(',').map(w => w.trim().toLowerCase());
                            if (triggerWords.some(trigger => lookupQuery.includes(trigger))) {
                                matchedRule = rule;
                                break; 
                            }
                        }

                        let replyText = matchedRule ? matchedRule.replyText : `🤖 I don't recognize that. Type "Menu" to start over!`;
                        const outboundId = await sendWhatsAppMessage(businessPhoneId, activeMetaToken, from, replyText);
                        const systemReply = await Message.create({ businessPhone: activeBusinessPhone, whatsappId: outboundId || `reply-${messageId}`, fromNumber: String(from), customerName: extractedName, body: replyText, direction: 'outgoing' });
                        io.to(activeBusinessPhone).emit('new_message', systemReply);
                    }
                } catch (dbError) { console.error("❌ Webhook Error:", dbError); }
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    }
    return res.sendStatus(404);
});

// ====================================================================
// 🛒 ABANDONED CART RECOVERY ENGINE (Runs every 30 mins)
// ====================================================================
setInterval(async () => {
    try {
        console.log("🔍 Scanning for abandoned carts...");
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

        const abandonedOrders = await Order.find({
            status: { $ne: 'paid' },
            createdAt: { $lt: twoHoursAgo },
            reminderSent: { $ne: true } 
        });

        for (let order of abandonedOrders) {
            const business = await User.findOne({ phoneNumber: order.businessPhone });
            
            if (business && business.subscriptionStatus === 'active') {
                let reminderText = `🛒 *Cart Reminder!*\n\nHi! We noticed you left some items in your cart a few hours ago.\n\nYour total is ₹${order.totalAmount}.\n\nReply to this message if you need any help completing your order, or let us know if you'd like to make changes!`;
                
                const outboundId = await sendWhatsAppMessage(business.metaPhoneId, business.metaToken, order.customerPhone, reminderText);
                
                if (outboundId) {
                    order.reminderSent = true; 
                    await order.save();

                    const systemReply = await Message.create({ 
                        businessPhone: order.businessPhone, 
                        whatsappId: outboundId || `reply-${Date.now()}`, 
                        fromNumber: order.customerPhone, 
                        body: `[Automated Abandoned Cart Reminder Sent]`, 
                        direction: 'outgoing' 
                    });
                    io.to(order.businessPhone).emit('new_message', systemReply);
                    console.log(`✅ Sent abandoned cart reminder to ${order.customerPhone}`);
                }
            }
        }
    } catch (err) {
        console.error("❌ Abandoned Cart Engine Error:", err);
    }
}, 30 * 60 * 1000);

app.get('/', (req, res) => res.send('WebSocket SaaS Server Alive!'));
server.listen(PORT, () => console.log("🚀 Server running on port " + PORT + " [V4 SAAS 30-DAY TRIAL LIVE]"));