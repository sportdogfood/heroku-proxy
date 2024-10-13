const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// CORS configuration
const allowedOrigins = [
  'https://www.sportdogfood.com',
  'https://sportdogfood.com',
  'http://www.sportdogfood.com',
  'http://sportdogfood.com',
  'https://secure.sportdogfood.com'  // Added the secure subdomain
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      // Allow non-browser requests like curl or Postman
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`Disallowed origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer']  // Allow fx-customer in headers
};

// Use the CORS middleware
app.use(cors(corsOptions));

// Handle preflight OPTIONS request
app.options('*', cors(corsOptions));

// Route to fetch customer data using fx.customer token from headers
app.get('/proxy/customer', async (req, res) => {
  const apiUrl = "https://secure.sportdogfood.com/s/customer?sso=true&zoom=default_billing_address,default_shipping_address,default_payment_method,subscriptions,subscriptions:transactions,transactions,transactions:items";

  // Retrieve fx.customer token from client request headers
  const fxCustomerToken = req.headers['fx-customer'];
  console.log("Received fx-customer token:", fxCustomerToken);
  if (!fxCustomerToken) {
    return res.status(400).json({ message: "fx.customer token is required" });
  }

  const headers = {
    "fx.customer": fxCustomerToken,  // Use the token passed from the client
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9"
  };

  try {
    const response = await axios.get(apiUrl, { headers });
    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching customer data:", error.message);
    res.status(500).json({ message: "Error fetching customer data", error: error.message });
  }
});

// Proxy endpoint for POST requests
app.post('/proxy', async (req, res) => {
  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: "Invalid payload provided." });
    }

    const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
    const params = {
      zapikey: process.env.ZAPIKEY || 'default-key',
      isdebug: false
    };

    const response = await axios.post(targetWebhookURL, clientPayload, {
      params: params,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds timeout
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Proxy error:", error.message);

    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      res.status(500).json({ success: false, message: "No response received from target webhook." });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

// Handle favicon.ico requests to prevent unnecessary logs
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
