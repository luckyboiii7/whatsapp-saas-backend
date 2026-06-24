fetch("https://whatsapp-saas-backend-qv85.onrender.com/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "1212445375277979",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "15555555555",
            phone_number_id: "1212445375277979" // This perfectly matches your .env!
          },
          contacts: [{
            profile: { name: "Test Customer" },
            wa_id: "919876543210" // The fake customer's phone number
          }],
          messages: [{
            from: "919876543210",
            id: "wamid.mock_message_12345",
            timestamp: Date.now().toString().slice(0, 10),
            text: { body: "Hello from mock test! Does the inbox work?" },
            type: "text"
          }]
        },
        field: "messages"
      }]
    }]
  })
})
.then(res => res.text())
.then(data => console.log("✅ Server Responded:", data))
.catch(err => console.error("❌ Error:", err));