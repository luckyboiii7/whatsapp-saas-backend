const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io'); 

const Message = require('./models/Message');
const Rule = require('./models/Rule'); 
const User = require('./models/user'); 
const BotStatus = require('./models/BotStatus'); 
const Order = require('./models/Order'); 
const Product = require('./models/Product'); 

const app = express();
app.use(cors()); 
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "your_mongodb_connection_string_here";

// 💳 RAZORPAY KEYS (Test Mode)
// In a real SaaS, these would be in your .env file!
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder_key"; 
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "placeholder_secret";

mongoose.connect(MONGO_URI)
    .then(() => console.log("💾 Connected to MongoDB Atlas Cloud!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

io.on('connection', (socket) => {
    socket.on('join_channel', (businessPhone) => { 
        socket.join(businessPhone); 
    });
});

// ====================================================================
// RAZORPAY HELPER (NEW)
// ====================================================================
async function generateRazorpayLink(amount, orderId, customerPhone) {
    if (RAZORPAY_KEY_ID === "rzp_test_placeholder_key") {
        // Fallback if user hasn't put real keys yet
        return `https://razorpay.com/fake-demo-link/pay/${orderId}?amt=${amount}`;
    }

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    try {
        const response = await fetch('https://api.razorpay.com/v1/payment_links', {
            method: 'POST',
            headers: { 
                'Authorization': `Basic ${auth}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                amount: Math.round(amount * 100), // Razorpay needs amount in paise/cents
                currency: "INR",
                description: `Payment for Order #${orderId.substring(0, 6)}`,
                customer: { contact: customerPhone },
                notify: { sms: false, email: false }
            })
        });
        const data = await response.json();
        return data.short_url; // Returns a real link like https://rzp.io/i/xxxx
    } catch (error) {
        console.error("Razorpay Error:", error);
        return null;
    }
}

// ====================================================================
// META API HELPERS 
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
            headers: { 
                'Authorization': `Bearer ${ACCESS_TOKEN}`, 
                'Content-Type': 'application/json' 
            }, 
            body: JSON.stringify(payload) 
        });
        const data = await response.json();
        if (response.ok) return data.messages[0].id;
        return null;
    } catch (error) { 
        return null; 
    }
}

async function sendWhatsAppButtons(toPhoneNumber, bodyText, buttonsArray) {
    const PHONE_NUMBER_ID = (process.env.PHONE_NUMBER_ID || "1212445375277979").trim();
    const ACCESS_TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
    if (!ACCESS_TOKEN || buttonsArray.length === 0) return null;

    const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
    const formattedButtons = buttonsArray.slice(0, 3).map((btn, index) => ({ 
        type: "reply", 
        reply: { id: btn.id || `btn_${index}`, title: btn.title.substring(0, 20) } 
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
            headers: { 
                'Authorization': `Bearer ${ACCESS_TOKEN}`, 
                'Content-Type': 'application/json' 
            }, 
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
app.get('/api/contacts/:businessPhone', async (req, res) => {
    try {
        const uniqueContacts = await Message.distinct('fromNumber');
        const formatted = uniqueContacts.map(phone => ({ phone }));
        return res.status(200).json({ success: true, contacts: formatted });
    } catch (e) { 
        return res.status(500).json({ success: false, message: e.message }); 
    }
});

app.post('/api/bot/toggle', async (req, res) => {
    try {
        const status = await BotStatus.findOneAndUpdate(
            { customerPhone: String(req.body.customerPhone) }, 
            { isBotPaused: req.body.isBotPaused, updatedAt: Date.now() }, 
            { upsert: true, new: true }
        );
        io.emit('bot_status_changed', status);
        return res.status(200).json({ success: true, data: status });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.get('/api/bot/status/:phone', async (req, res) => {
    try {
        const status = await BotStatus.findOne({ customerPhone: String(req.params.phone) });
        return res.status(200).json({ success: true, isBotPaused: status ? status.isBotPaused : false });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/register', async (req, res) => {
    try {
        let user = await User.findOne({ phoneNumber: String(req.body.phoneNumber) });
        if (user) {
            return res.status(200).json({ success: true, message: "Welcome back!", user });
        }
        user = await User.create({ 
            businessName: req.body.businessName, 
            phoneNumber: String(req.body.phoneNumber) 
        });
        return res.status(201).json({ success: true, message: "Account created!", user });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.get('/api/messages/:phone', async (req, res) => {
    try {
        const chatHistory = await Message.find({ fromNumber: String(req.params.phone) }).sort({ timestamp: 1 });
        return res.status(200).json({ success: true, data: chatHistory });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/messages/send', async (req, res) => {
    try {
        const outboundId = await sendWhatsAppMessage(req.body.phoneNumber, req.body.message);
        if (outboundId) {
            const newMsg = await Message.create({ 
                whatsappId: outboundId, 
                fromNumber: String(req.body.phoneNumber), 
                body: req.body.message, 
                direction: 'outgoing' 
            });
            io.to(req.body.phoneNumber).emit('new_message', newMsg);
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
        await Rule.findOneAndUpdate(
            { keyword: req.body.keyword.toLowerCase() }, 
            { replyText: req.body.replyText }, 
            { upsert: true }
        );
        return res.status(200).json({ success: true });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.get('/api/products', async (req, res) => {
    try { 
        const products = await Product.find().sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: products }); 
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/products', async (req, res) => {
    try { 
        const newProduct = await Product.create(req.body);
        return res.status(201).json({ success: true, data: newProduct }); 
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

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: orders });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

// 💳 UPDATED: Send Invoice now triggers Razorpay!
app.post('/api/orders/:id/send-invoice', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        order.totalAmount = req.body.newTotal; 
        order.status = 'pending_payment'; 
        await order.save();
        io.emit('order_updated', order);
        
        // Generate actual Razorpay payment link
        const paymentLink = await generateRazorpayLink(order.totalAmount, String(order._id), order.customerPhone);
        
        const replyText = `🧾 Good news! Your custom quotation is ready.\n\nYour final total is ₹${req.body.newTotal}.\n\nSecure Payment Link:\n${paymentLink}`;
        const outboundId = await sendWhatsAppMessage(order.customerPhone, replyText);
        
        const systemReply = await Message.create({ 
            whatsappId: outboundId || `reply-${Date.now()}`, 
            fromNumber: order.customerPhone, 
            body: `[Sent Final Invoice Link: ₹${req.body.newTotal}]`, 
            direction: 'outgoing' 
        });
        io.emit('new_message', systemReply);
        return res.status(200).json({ success: true, data: order });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

app.post('/api/orders/:id/mark-paid', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        order.status = 'paid'; 
        await order.save(); 
        io.emit('order_updated', order);
        
        // AUTO-DEDUCT INVENTORY
        for (let item of order.items) {
            await Product.findOneAndUpdate(
                { name: item.name }, 
                { $inc: { stockQuantity: -item.quantity } }
            );
        }

        const outboundId = await sendWhatsAppMessage(order.customerPhone, `✅ Payment received! Your order is now confirmed and is being processed for dispatch. Thank you!`);
        
        const systemReply = await Message.create({ 
            whatsappId: outboundId || `reply-${Date.now()}`, 
            fromNumber: order.customerPhone, 
            body: `[Sent Payment Receipt]`, 
            direction: 'outgoing' 
        });
        io.emit('new_message', systemReply);
        return res.status(200).json({ success: true, data: order });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
});

// ====================================================================
// WEBHOOK (THE BOT BRAIN)
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

            const botStatus = await BotStatus.findOne({ customerPhone: String(from) });
            const isPaused = botStatus && botStatus.isBotPaused;

            // 🛒 SMART CART ENGINE WITH STOCK GUARDRAILS
            if (messageData.type === 'order') {
                const items = messageData.order.product_items;
                let totalAmount = 0; 
                let requiresQuotation = false; 
                let formattedItems = [];
                let stockErrorMsg = "";

                for (let item of items) {
                    const price = item.item_price || 0; 
                    const qty = item.quantity || 1;
                    
                    const dbProduct = await Product.findOne({ name: item.product_retailer_id });
                    if (dbProduct && qty > dbProduct.stockQuantity) {
                        stockErrorMsg += `❌ *${item.product_retailer_id}* (You ordered ${qty}, but we only have ${dbProduct.stockQuantity} left!)\n`;
                    }
                    
                    totalAmount += (price * qty); 
                    if (price === 0) requiresQuotation = true; 
                    
                    formattedItems.push({ 
                        name: item.product_retailer_id, 
                        quantity: qty, 
                        price: price 
                    });
                }

                // Reject if out of stock
                if (stockErrorMsg !== "") {
                    const replyText = `⚠️ *Order Cannot Be Processed*\n\nSome items in your cart are out of stock:\n${stockErrorMsg}\nPlease adjust your cart and try sending again.`;
                    const outboundId = await sendWhatsAppMessage(from, replyText);
                    
                    const systemReply = await Message.create({ 
                        whatsappId: outboundId || `reply-${messageId}`, 
                        fromNumber: String(from), 
                        body: `[Rejected Cart: Stock Limit Reached]`, 
                        direction: 'outgoing' 
                    });
                    io.emit('new_message', systemReply);
                    return res.status(200).send('EVENT_RECEIVED');
                }

                const routingMode = requiresQuotation ? 'quotation' : 'instant_pay';
                const newOrder = await Order.create({ 
                    customerPhone: String(from), 
                    items: formattedItems, 
                    totalAmount: totalAmount, 
                    routingMode: routingMode, 
                    status: requiresQuotation ? 'pending_quote' : 'pending_payment' 
                });
                io.emit('new_order', newOrder);

                const cartSummary = `🛒 *Cart Received* | Mode: ${routingMode.toUpperCase()}\nItems: ${items.length}\nTotal: ₹${totalAmount}`;
                const incomingMsg = await Message.create({ 
                    whatsappId: messageId, 
                    fromNumber: String(from), 
                    body: cartSummary, 
                    direction: 'incoming' 
                });
                io.emit('new_message', incomingMsg);

                if (isPaused) return res.status(200).send('EVENT_RECEIVED');

                if (requiresQuotation) {
                    const outboundId = await sendWhatsAppMessage(from, "🛒 We received your cart! Because it contains custom materials, we are calculating your bulk discount and final quotation. A human agent will message you shortly. 🛠️");
                    
                    const systemReply = await Message.create({ 
                        whatsappId: outboundId || `reply-${messageId}`, 
                        fromNumber: String(from), 
                        body: `[Sent Quotation Notice]`, 
                        direction: 'outgoing' 
                    });
                    io.emit('new_message', systemReply);
                } else {
                    const replyText = `🛒 We received your cart! Your total is ₹${totalAmount}. How would you like to proceed?`;
                    const buttons = [
                        { id: `pay_${newOrder._id}_${totalAmount}`, title: "💳 Pay Now" }, 
                        { id: `invoice_${newOrder._id}`, title: "📝 Request Invoice" }
                    ];
                    const outboundId = await sendWhatsAppButtons(from, replyText, buttons);
                    
                    const systemReply = await Message.create({ 
                        whatsappId: outboundId || `reply-${messageId}`, 
                        fromNumber: String(from), 
                        body: `[Sent Payment Options for ₹${totalAmount}]`, 
                        direction: 'outgoing' 
                    });
                    io.emit('new_message', systemReply);
                }
                return res.status(200).send('EVENT_RECEIVED');
            }

            // TEXT & BUTTONS ENGINE
            let msgBody = messageData.text ? messageData.text.body.trim() : (messageData.interactive && messageData.interactive.button_reply ? messageData.interactive.button_reply.title : "");
            let buttonIdMatch = messageData.interactive && messageData.interactive.button_reply ? messageData.interactive.button_reply.id : "";

            if (msgBody) {
                try {
                    const incomingMsg = await Message.create({ 
                        whatsappId: messageId, 
                        fromNumber: String(from), 
                        body: msgBody, 
                        direction: 'incoming' 
                    });
                    io.emit('new_message', incomingMsg);

                    if (isPaused) return res.status(200).send('EVENT_RECEIVED');

                    const lookupQuery = buttonIdMatch ? buttonIdMatch.toLowerCase() : msgBody.toLowerCase();
                    
                    // 💳 UPDATED: User clicks "Pay Now" bot generates Razorpay Link
                    if (lookupQuery.startsWith('pay_')) {
                        const parts = lookupQuery.split('_');
                        const orderId = parts[1];
                        const amount = parts[2];
                        
                        const paymentLink = await generateRazorpayLink(amount, orderId, from);

                        const outboundId = await sendWhatsAppMessage(from, `Here is your secure payment link for Order #${orderId.substring(0,6)}: \n\n${paymentLink}`);
                        
                        const systemReply = await Message.create({ 
                            whatsappId: outboundId || `reply-${messageId}`, 
                            fromNumber: String(from), 
                            body: `[Sent Secure Payment Link]`, 
                            direction: 'outgoing' 
                        });
                        io.emit('new_message', systemReply);
                        return res.status(200).send('EVENT_RECEIVED');
                    }

                    if (['hello', 'hi', 'menu'].includes(lookupQuery)) {
                        const multiChoiceBody = "👋 Welcome to Wadhwa Plywood & Hardware! How can we help you?";
                        const buttonMenu = [
                            { id: "products", title: "📁 View Products" }, 
                            { id: "hours", title: "⏰ Store Hours" }, 
                            { id: "contact", title: "👨‍💻 Speak to Human" }
                        ];
                        const outboundId = await sendWhatsAppButtons(from, multiChoiceBody, buttonMenu);
                        
                        const systemReply = await Message.create({ 
                            whatsappId: outboundId || `reply-${messageId}`, 
                            fromNumber: String(from), 
                            body: `[Menu]: ${multiChoiceBody}`, 
                            direction: 'outgoing' 
                        });
                        io.emit('new_message', systemReply);
                    } 
                    else if (lookupQuery === 'products') {
                        const inventory = await Product.find().limit(10); 
                        
                        if (inventory.length === 0) {
                            const outboundId = await sendWhatsAppMessage(from, "Our catalog is currently being updated. Please check back later!");
                            
                            const systemReply = await Message.create({ 
                                whatsappId: outboundId || `reply-${messageId}`, 
                                fromNumber: String(from), 
                                body: `[Catalog Empty Message Sent]`, 
                                direction: 'outgoing' 
                            });
                            io.emit('new_message', systemReply);
                        } else {
                            let catalogText = "📦 *Live Inventory Catalog:*\n\n";
                            inventory.forEach((item, index) => {
                                const priceDisplay = item.price === 0 ? "Ask for Quote 📝" : `₹${item.price}`;
                                catalogText += `${index + 1}. *${item.name}*\n   _${item.description}_\n   💰 Price: ${priceDisplay} | 📦 In Stock: ${item.stockQuantity}\n\n`;
                            });
                            catalogText += "🛒 *To order:* Simply reply with the items you need!";

                            const outboundId = await sendWhatsAppMessage(from, catalogText);
                            
                            const systemReply = await Message.create({ 
                                whatsappId: outboundId || `reply-${messageId}`, 
                                fromNumber: String(from), 
                                body: `[Sent Dynamic Catalog from DB]`, 
                                direction: 'outgoing' 
                            });
                            io.emit('new_message', systemReply);
                        }
                    } 
                    else {
                        const matchedRule = await Rule.findOne({ keyword: lookupQuery });
                        let replyText = matchedRule ? matchedRule.replyText : `🤖 I don't recognize that. Type "Menu" to start over!`;
                        
                        const outboundId = await sendWhatsAppMessage(from, replyText);
                        
                        const systemReply = await Message.create({ 
                            whatsappId: outboundId || `reply-${messageId}`, 
                            fromNumber: String(from), 
                            body: replyText, 
                            direction: 'outgoing' 
                        });
                        io.emit('new_message', systemReply);
                    }
                } catch (dbError) { 
                    console.error("❌ Webhook Error:", dbError); 
                }
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    }
    return res.sendStatus(404);
});

app.get('/', (req, res) => res.send('WebSocket SaaS Server Alive!'));
server.listen(PORT, () => console.log("Server running on port " + PORT));