const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http'); // Import http module
const { Server } = require('socket.io'); // Import Socket.IO
require('dotenv').config();

const app = express();
const server = http.createServer(app); // Create server
const io = new Server(server, {
  cors: {
    origin: [
      'https://www.sportdogfood.com',
      'https://sportdogfood.com',
      'http://www.sportdogfood.com',
      'http://sportdogfood.com',
      'https://secure.sportdogfood.com',
      'https://sport-dog-food.webflow.io',
      'https://hooks.webflow.com',
      'https://webflow.com',
      'https://sportdogfood.github.io',
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
    credentials: true,
  },
}); // Initialize Socket.IO with CORS configuration

// Middleware to parse JSON bodies
app.use(express.json());

// CORS configuration for Express
app.use(cors());

// Handle preflight OPTIONS request
app.options('*', cors());

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Listen for a user to join their specific room
  socket.on('joinRoom', (userID) => {
    socket.join(userID); // Join the room associated with the user's ID
    console.log(`User ${socket.id} joined room: ${userID}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});


// Helper function for proxy requests with different API keys
const handleProxyRequest = async (req, res, targetWebhookURL, apiKey) => {
  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload provided.' });
    }

    const params = {
      zapikey: apiKey,
      isdebug: false,
    };

    const response = await axios.post(targetWebhookURL, clientPayload, {
      params: params,
      headers: {
        'Content-Type': 'application/json',
        'fx-customer': req.headers['fx-customer'] || '',
      },
      timeout: 30000,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message, error.response ? error.response.data : '');

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({
        success: false,
        message: 'No response received from the target webhook.',
      });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// Proxy endpoints
app.post('/proxy/session', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.946854075052a0c11090978c62d7ac49.44750e9a2e205fca9fa9e9bcd2d2c742';
  handleProxyRequest(req, res, targetWebhookURL, null); // Pass null if no additional API key is needed
});


// New Endpoint for Enriched Data
app.post('/enrichment-complete', (req, res) => {
  console.log('Incoming request body:', req.body); // Log the complete request body
  console.log('Raw request body:', req.body); // Log the complete request body
   
  const enrichedData = req.body; // Capture the enriched data
  console.log('Enriched data received:', enrichedData); // Log the enriched data

  const userID = enrichedData.userID; 
    if (userID) {
        io.to(userID).emit('enriched-data-ready', enrichedData); // Emit to the user's room
    } else {
        console.error('User ID not found in the enriched data.');
    }

    res.status(200).send('Enrichment complete'); // Respond back to Zoho Flow
});

app.post('/proxy/recover', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.e48ac834463666ce61b714c906934d9e.70001f597361bdb34f7ce91b3cc6bb1a&isdebug=false';
  handleProxyRequest(req, res, targetWebhookURL);
});


app.post('/proxy/end', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.82c68c4f4a0530a2060d237546ef9a5c.5256a1838c7b6d570c630ef200dee71d';
  
  const clientPayload = req.body;

  // Validate payload
  if (!clientPayload.sessionId || !clientPayload.timestamp) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields in payload: sessionId, timestamp.',
    });
  }
  
  handleProxyRequest(req, res, targetWebhookURL);
});

app.post('/proxy/auth', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.8cc8785c2793dabb1fdb06f731bb493e.fda6cdb7ec5bcdf70b76b68d5307a6c4';
  
  const clientPayload = req.body;

  // Validate payload
  if (!clientPayload.sessionId || !clientPayload.timestamp) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields in payload: sessionId, timestamp.',
    });
  }
  
  handleProxyRequest(req, res, targetWebhookURL);
});

app.post('/proxy/start', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.8b174169355355f1746f8619a4adf8f9.22e42bb52899117a0c22e28743a8b7a7';

  const clientPayload = req.body;

  // Validate payload
  if (!clientPayload.sessionId || !clientPayload.timestamp) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields in payload: sessionId, timestamp.',
    });
  }

  handleProxyRequest(req, res, targetWebhookURL, null); // Pass null since no additional parameter is needed
});


// UPS Refresh Token Route
app.post('/proxy/ups/refresh', async (req, res) => {
  const upsTokenURL = 'https://wwwcie.ups.com/security/v1/oauth/token';
  const refreshToken = req.body.refresh_token || process.env.UPS_REFRESH_TOKEN;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Missing refresh_token in request body or environment.',
    });
  }

  try {
    const response = await axios.post(
      upsTokenURL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(
            `${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`
          ).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000, // Timeout set to 30 seconds
      }
    );

    // Extract required fields from response
    const { access_token, expires_in } = response.data;

    // Respond with success and token information
    res.status(200).json({
      success: true,
      access_token,
      expires_in, // Token expiry in seconds
    });
  } catch (error) {
    console.error('Error refreshing UPS token:', error.message);

    if (error.response) {
      res.status(error.response.status).json({
        success: false,
        message: error.response.data,
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
});


// UPS Tracking Route
app.get('/proxy/ups/track/:inquiryNumber', async (req, res) => {
  const { inquiryNumber } = req.params;
  const upsTrackingURL = `https://wwwcie.ups.com/api/track/v1/details/${inquiryNumber}`;

  // Function to get a fresh access token (server-side handling)
  const fetchAccessToken = async () => {
    const upsTokenURL = 'https://wwwcie.ups.com/security/v1/oauth/token';
    try {
      const response = await axios.post(
        upsTokenURL,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: process.env.UPS_REFRESH_TOKEN, // Ensure this is set in your environment variables
        }),
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(
              `${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`
            ).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        }
      );
      return response.data.access_token;
    } catch (error) {
      console.error('Error refreshing UPS access token:', error.message);
      throw new Error('Unable to refresh access token');
    }
  };

  try {
    // Check for access token in headers or dynamically fetch one
    let accessToken = req.headers['authorization']?.replace('Bearer ', '');

    if (!accessToken) {
      console.log('Access token not provided, fetching a new one...');
      accessToken = await fetchAccessToken();
    }

    // Make the tracking API request with the valid access token
    const response = await axios.get(upsTrackingURL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'transId': 'tracking-request',
        'transactionSrc': 'proxy',
      },
      timeout: 30000,
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching UPS tracking:', error.message);
    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});



// New proxy route (dynamic URL forwarding)
app.post('/proxy/bypass', (req, res) => {
  const targetURL = req.body.targetURL;
  const clientKey = req.body.clientKey || '';

  if (!targetURL) {
    return res.status(400).json({ success: false, message: 'targetURL is required' });
  }

  forwardRequestToTarget(req, res, targetURL, clientKey);
});

// Function to forward the request to the target URL
const forwardRequestToTarget = async (req, res, targetURL, clientKey) => {
  try {
    const clientPayload = req.body;

    // Create a new payload object based on the incoming request body
    const payload = {
      ...clientPayload,
    };

    // If clientKey is provided, add it to the payload
    if (clientKey) {
      payload.clientKey = clientKey;
    }

    // Forward the request to the target URL
    const response = await axios.post(targetURL, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // Set timeout to 30 seconds
    });

    // Send back the response received from the target URL
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error forwarding request:', error.message, error.response ? error.response.data : '');

    // Handle errors based on the type of Axios error
    if (error.response) {
      // The request was made and the server responded with a status code
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      // The request was made but no response was received
      res.status(500).json({
        success: false,
        message: 'No response received from the target URL.',
      });
    } else {
      // Something happened in setting up the request that triggered an Error
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// Add a new route for forwarding requests to the Webflow webhook
app.post('/proxy/webflow', async (req, res) => {
  const webhookUrl = 'https://hooks.webflow.com/logic/5c919f089b1194a099fe6c41/w_qApc_TrDQ';

  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload provided.' });
    }

    const response = await axios.post(webhookUrl, clientPayload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error forwarding request to Webflow webhook:', error.message, error.response ? error.response.data : '');

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({
        success: false,
        message: 'No response received from the Webflow webhook.',
      });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

// Route to handle enriched data posted from Zoho Flow
app.post('/proxy/enriched-data', (req, res) => {
  const enrichedData = req.body;

  if (!enrichedData || typeof enrichedData !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid enriched data provided.' });
  }

  console.log('Enriched Data Received:', enrichedData);
  res.status(200).json({ success: true, message: 'Enriched data received successfully.' });
});

// Handle favicon.ico requests to prevent unnecessary logs
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
