const payload = {
  object: "whatsapp_business_account",
  entry: [{
    id: "1212445375277979",
    changes: [{
      value: {
        messaging_product: "whatsapp",
        metadata: {
          display_phone_number: "15556660243",
          phone_number_id: "1212445375277979"
        },
        contacts: [{
          profile: { name: "Test User" },
          wa_id: "919039744212"
        }],
        messages: [{
          from: "919039744212",
          id: "wamid.mockID123456789",
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: "text",
          text: { body: "Ping" }
        }]
      },
      field: "messages"
    }]
  }]
};

fetch("https://whatsapp-saas-backend-qv85.onrender.com/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})
.then(res => console.log("✅ Simulated message sent! Render replied with status:", res.status))
.catch(err => console.error("❌ Error:", err));