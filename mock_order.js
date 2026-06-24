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
            phone_number_id: "1212445375277979"
          },
          contacts: [{
            profile: { name: "Test Customer" },
            wa_id: "919876543210"
          }],
          messages: [{
            from: "919876543210",
            id: "wamid.mock_order_" + Date.now(),
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: "order",
            order: {
              catalog_id: "1111111111",
              product_items: [
                { product_retailer_id: "Premium Plywood", quantity: 50, item_price: 0 }, // Price 0 triggers Quotation!
                { product_retailer_id: "Fevicol 1kg", quantity: 5, item_price: 250 }
              ]
            }
          }]
        },
        field: "messages"
      }]
    }]
  })
})
.then(res => res.text())
.then(data => console.log("✅ Order Received by Server:", data))
.catch(err => console.error("❌ Error:", err));