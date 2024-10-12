const express = require('express');
const axios = require('axios');
const app = express();

app.get('/proxy/customer', async (req, res) => {
  const apiUrl = "https://secure.sportdogfood.com/s/customer?sso=true&zoom=default_billing_address,default_shipping_address,default_payment_method,subscriptions,subscriptions:transactions,transactions,transactions:items";

  const headers = {
    "fx.customer": "d56de689-ae1a-4105-af68-cb84cac27202",
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9"
  };

  try {
    const response = await axios.get(apiUrl, { headers });
    res.status(200).json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Error fetching customer data", error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});

