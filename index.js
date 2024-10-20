const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// CORS configuration (as previously defined)
const allowedOrigins = [
  'https://www.sportdogfood.com',
  'https://sportdogfood.com',
  'http://www.sportdogfood.com',
  'http://sportdogfood.com',
  'https://secure.sportdogfood.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true); // Allow non-browser requests like curl or Postman
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`Disallowed origin: ${origin}`);
      callback(new Error('CORS policy: This origin is not allowed.'));
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
  credentials: true,
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS request
app.options('*', cors(corsOptions));

// Helper function for proxy requests with different API keys
const handleProxyRequest = async (req, res, targetWebhookURL, apiKey) => {
  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: "Invalid payload provided." });
    }

    const params = {
      zapikey: apiKey, // Use the provided API key
      isdebug: false
    };

    const response = await axios.post(targetWebhookURL, clientPayload, {
      params: params,
      headers: {
        'Content-Type': 'application/json',
        'fx-customer': req.headers['fx-customer'] || '', // Forward fx-customer header if available
      },
      timeout: 30000 // 30 seconds timeout
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Proxy error:", error.message, error.response ? error.response.data : '');

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({ success: false, message: "No response received from the target webhook." });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// Proxy endpoint using ZAPIKEY_session
app.post('/proxy/session', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  const apiKey = process.env.ZAPIKEY_session; // Use the session key
  handleProxyRequest(req, res, targetWebhookURL, apiKey);
});

// Proxy endpoint using ZAPIKEY_recover
app.post('/proxy/recover', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  const apiKey = process.env.ZAPIKEY_recover; // Use the recover key
  handleProxyRequest(req, res, targetWebhookURL, apiKey);
});

// Bypass CORS route
app.post('/proxy/bypass', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  const apiKey = process.env.ZAPIKEY_bypass; // Use the bypass key

  // Manually set headers to allow any origin (bypass CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, fx-customer');

  handleProxyRequest(req, res, targetWebhookURL, apiKey);
});

// Handle favicon.ico requests to prevent unnecessary logs
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
