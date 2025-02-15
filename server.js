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
      callback(new Error('CORS policy: This origin is not allowed.'));
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'], // Allow fx-customer in headers
};

// Use the CORS middleware
app.use(cors(corsOptions));

// Handle preflight OPTIONS request
app.options('*', cors(corsOptions));

// Helper function for proxy requests
const handleProxyRequest = async (req, res, targetWebhookURL) => {
  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: "Invalid payload provided." });
    }

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

// Proxy endpoint for POST requests
app.post('/proxy', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  handleProxyRequest(req, res, targetWebhookURL);
});

// Proxy endpoint for POST requests with different params
app.post('/proxy/recover', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  handleProxyRequest(req, res, targetWebhookURL);
});

// Route to handle UPS token requests
app.post('/proxy/ups/token', async (req, res) => {
  const upsTokenURL = 'https://wwwcie.ups.com/security/v1/oauth/token';
  const { ups_clientId, ups_clientSecret } = process.env;

  if (!ups_clientId || !ups_clientSecret) {
    console.error('Missing UPS Client ID or Secret in environment variables.');
    return res.status(500).json({ error: 'UPS Client ID and Secret are required in environment variables.' });
  }

  try {
    const response = await axios.post(
      upsTokenURL,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: ups_clientId,
        client_secret: ups_clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    console.log('UPS Token Request Successful:', response.data);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('UPS Token Request Error:', error.message);
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});



// Route to handle UPS tracking requests
app.get('/proxy/ups/track/:inquiryNumber', async (req, res) => {
  const { inquiryNumber } = req.params;
  const upsTrackingURL = `https://wwwcie.ups.com/api/track/v1/details/${inquiryNumber}`;
  const { token } = req.headers; // Include the UPS Bearer token in the request

  if (!token) {
    return res.status(400).json({ success: false, message: 'Bearer token is required in headers.' });
  }

  try {
    const response = await axios.get(upsTrackingURL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      params: {
        locale: 'en_US',
        returnSignature: false,
        returnMilestones: false,
        returnPOD: false,
      },
    });
    console.log('UPS Tracking Request Successful:', response.data);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('UPS Tracking Request Error:', error.message);
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});


// Handle favicon.ico requests to prevent unnecessary logs
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
