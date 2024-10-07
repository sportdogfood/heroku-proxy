const express = require('express');
const axios = require('axios');
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  // Allow requests from your domain
  const allowedOrigins = ['https://www.sportdogfood.com', 'https://sportdogfood.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Optionally, you can log or handle disallowed origins
    console.log(`Disallowed origin: ${origin}`);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Proxy endpoint
app.all('/proxy', async (req, res) => {
  try {
    const { thisValue } = req.query;

    if (!thisValue) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin); // Set CORS header
      return res.status(400).json({ success: false, message: "'thisValue' parameter is missing." });
    }

    // Forward the request to the Catalyst serverless function
    const apiResponse = await axios({
      method: req.method,
      url: `https://serverless-700800454.development.catalystserverless.com/server/fetchZohoCors/`,
      params: { thisValue },
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Set CORS header before sending the response
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);

    res.status(apiResponse.status).json(apiResponse.data);
  } catch (error) {
    console.error("Proxy error:", error.message);

    // Set CORS header in error response as well
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);

    if (error.response) {
      // Forward the error response from the API
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ success: false, message: "Internal server error." });
    }
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});