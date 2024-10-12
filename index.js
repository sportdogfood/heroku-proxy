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
  'http://sportdogfood.com'
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
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Use the CORS middleware
app.use(cors(corsOptions));

// Handle preflight OPTIONS request
app.options('*', cors(corsOptions));

// Proxy endpoint
app.post('/proxy', async (req, res) => {
  try {
    // **Removed staticPayload**
    // Instead, retrieve the payload from the client's request body
    const clientPayload = req.body;

    // Validate the received payload (optional but recommended)
    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: "Invalid payload provided." });
    }

    // Define target webhook URL
    const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming'; // Replace with your actual webhook URL

    // Query parameters for the target webhook
    const params = {
      zapikey: process.env.ZAPIKEY || '1001.946854075052a0c11090978c62d7ac49.44750e9a2e205fca9fa9e9bcd2d2c742', // Replace with your actual zapikey or use environment variable
      isdebug: false
    };

    // Send POST request to target webhook with the client's payload
    const response = await axios.post(targetWebhookURL, clientPayload, {
      params: params,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds timeout
    });

    // Forward response from webhook to client
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Proxy error:", error.message);

    if (error.response) {
      // Forward the error response from the target webhook
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      // No response received from target webhook
      res.status(500).json({ success: false, message: "No response received from target webhook." });
    } else {
      // Other errors
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
