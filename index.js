const express = require('express');
const axios = require('axios');
const cors = require('cors');

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
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Use the CORS middleware
app.use(cors(corsOptions));

// Handle preflight OPTIONS request
app.options('*', cors(corsOptions));

// Proxy endpoint
app.all('/proxy', async (req, res) => {
  try {
    const { thisValue } = req.query;

    if (!thisValue) {
      return res.status(400).json({ success: false, message: "'thisValue' parameter is missing." });
    }

    // Forward the request to the target API
    const apiResponse = await axios({
      method: req.method,
      url: 'https://flow.zoho.com/681603876/flow/webhook/incoming', // Adjusted to the actual target API
      params: {
        zapikey: '1001.946854075052a0c11090978c62d7ac49.44750e9a2e205fca9fa9e9bcd2d2c742',
        isdebug: false
      },
      data: req.body,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds timeout
    });

    res.status(apiResponse.status).json(apiResponse.data);
  } catch (error) {
    console.error("Proxy error:", error.message);

    if (error.response) {
      // Forward the error response from the API
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      // No response received
      res.status(500).json({ success: false, message: "No response received from target API." });
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
