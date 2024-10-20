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

// NEW PROXY ROUTE (this is the one you just added for dynamic URL forwarding)
app.post('/proxy/bypass', (req, res) => {
  // Get the targetURL and clientKey from the request body
  const targetURL = req.body.targetURL;
  const clientKey = req.body.clientKey || '';  // Treat as empty if not provided

  // Ensure targetURL is provided
  if (!targetURL) {
    return res.status(400).json({ success: false, message: "targetURL is required" });
  }

  // Forward the request to the targetURL along with the clientKey
  forwardRequestToTarget(req, res, targetURL, clientKey);
});

// Function to forward the request to the target URL
const forwardRequestToTarget = async (req, res, targetURL, clientKey) => {
  try {
    const clientPayload = req.body;

    // Forward the request to the targetURL using axios
    const response = await axios.post(targetURL, {
      ...clientPayload, // Include the original payload
      clientKey: clientKey || undefined,  // Add clientKey to the payload, treat as undefined if empty
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000 // 30 seconds timeout
    });

    // Send back the response received from the targetURL
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error forwarding request:", error.message, error.response ? error.response.data : '');

    // Handle error based on axios response
    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({ success: false, message: "No response received from the target URL." });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// Proxy endpoint that responds immediately to the webhook
app.post('/proxy/async', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  const apiKey = process.env.ZAPIKEY_async; // Use the async key

  // Respond immediately to acknowledge the webhook
  res.status(200).json({ success: true, message: 'Webhook received and is being processed.' });

  // Process the webhook data asynchronously
  handleProxyRequest(req, res, targetWebhookURL, apiKey);
});

// Handle favicon.ico requests to prevent unnecessary logs
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
