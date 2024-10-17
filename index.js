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
  'https://secure.sportdogfood.com' // Added the secure subdomain
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
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'], // Allow fx-customer in headers
};

// Use the CORS middleware
app.use(cors(corsOptions));

// Handle preflight OPTIONS request
app.options('*', cors(corsOptions));

// Route to fetch customer data using fx.customer token from headers
app.get('/proxy/customer', async (req, res) => {
  const apiUrl = "https://secure.sportdogfood.com/s/customer?sso=true&zoom=default_billing_address,default_shipping_address,default_payment_method,subscriptions,transactions,transactions:items";

  // Retrieve fx.customer token from client request headers
  const fxCustomerToken = req.headers['fx-customer'];
  console.log("Received fx-customer token:", fxCustomerToken);
  if (!fxCustomerToken) {
    return res.status(400).json({ message: "fx.customer token is required" });
  }

  const headers = {
    "fx.customer": fxCustomerToken, // Use the token passed from the client
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9"
  };

  try {
    // Fetching the customer data
    const response = await axios.get(apiUrl, { headers });

    // Processing the response data
    const customerData = response.data;

    // Filter active subscriptions only
    if (customerData.subscriptions) {
      customerData.subscriptions = customerData.subscriptions.filter(subscription => subscription.is_active);
    }

    // Limit transactions to the last 5
    if (customerData.transactions) {
      customerData.transactions = customerData.transactions.slice(-5);
    }

    // Send the processed data back to the client
    res.status(200).json(customerData);
  } catch (error) {
    console.error("Error fetching customer data:", error.message);

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({ message: "No response received from the Foxy.io API." });
    } else {
      res.status(500).json({ message: error.message });
    }
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

    res.status(resonse.status).json(response.data);
  } catch (error) {p
    console.error("Proxy error:", error.message);

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({ success: false, message: "No response received from the target webhook." });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

// Proxy endpoint for POST requests
app.post('/proxy/recover', async (req, res) => {
  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: "Invalid payload provided." });
    }

    const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
    const params = {
      zapikey: process.env.ZAPIKEY || 'zapikey=1001.e48ac834463666ce61b714c906934d9e.70001f597361bdb34f7ce91b3cc6bb1a&isdebug=false',
      isdebug: false
    };

    const response = await axios.post(targetWebhookURL, clientPayload, {
      params: params,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds timeout
    });

    res.status(resonse.status).json(response.data);
  } catch (error) {p
    console.error("Proxy error:", error.message);

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({ success: false, message: "No response received from the target webhook." });
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
