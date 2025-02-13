const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// 1. CORS Configuration
const allowedOrigins = [
  'https://www.sportdogfood.com',
  'https://wefu.webflow.io/',
  'http://wefu.webflow.io/',
  'https://sportdogfood.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
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

// 2. Apply CORS Middleware Before Any Routes
app.use(cors(corsOptions));

// 3. Middleware to Parse JSON Bodies
app.use(express.json());

// 4. Handle Preflight OPTIONS Requests
app.options('*', cors(corsOptions));
app.get('/proxy/people/:personId', async (req, res) => {
  const { personId } = req.params;
  const { show_id, customer_id } = req.query;
  const targetUrl = `https://sglapi.wellingtoninternational.com/people/${personId}?pid=${personId}&show_id=${show_id}&customer_id=${customer_id}`;
  console.log('Proxying People request to:', targetUrl);
  try {
    const response = await axios.get(targetUrl, {
      headers: { 'Accept': 'application/json' }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Proxy error in /proxy/people/:personId:", error.message, error.response ? error.response.data : '');
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});


// 5. Proxy Endpoint
app.post('/proxy', async (req, res) => {
  try {
    // Define the static payload
    const staticPayload = {
      payloadEmail: "testuser@example.com",
      payloadfoxy_id: "27268981",
      payloadlast_name: "Doe",
      payloadfirst_name: "John",
      payloadis: "dashboardNotin"
    };

    // Define target webhook URL
    const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming'; // **Replace with your actual webhook URL**

    // Query parameters for the target webhook
    const params = {
      zapikey: process.env.ZAPIKEY || '1001.946854075052a0c11090978c62d7ac49.44750e9a2e205fca9fa9e9bcd2d2c742', // **Use environment variable or default**
      isdebug: false
    };

    // Send POST request to target webhook
    const response = await axios.post(targetWebhookURL, staticPayload, {
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

// 6. Handle favicon.ico Requests to Prevent Unnecessary Logs
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// 7. Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
