const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http'); // Import http module
const { Server } = require('socket.io'); // Import Socket.IO
require('dotenv').config();

const app = express();
const server = http.createServer(app); // Create server
const io = new Server(server); // Initialize Socket.IO

// Middleware to parse JSON bodies
app.use(express.json());

// CORS configuration
const allowedOrigins = [
  'https://www.sportdogfood.com',
  'https://sportdogfood.com',
  'http://www.sportdogfood.com',
  'http://sportdogfood.com',
  'https://secure.sportdogfood.com',
  'https://sport-dog-food.webflow.io',
  'https://hooks.webflow.com',
  'https://webflow.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true); // Allow non-browser requests
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`Disallowed origin: ${origin}`);
      callback(new Error('CORS policy: This origin is not allowed.'));
    }
  },
  methods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
  credentials: true,
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS request
app.options('*', cors(corsOptions));

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Listen for messages from clients
  socket.on('message', (msg) => {
    console.log('Message from client:', msg);
    // Echo the message back to the client
    socket.emit('message', `Server: ${msg}`);
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
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  const apiKey = process.env.ZAPIKEY_session;
  handleProxyRequest(req, res, targetWebhookURL, apiKey);
});

app.post('/proxy/recover', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  const apiKey = process.env.ZAPIKEY_recover;
  handleProxyRequest(req, res, targetWebhookURL, apiKey);
});

app.post('/proxy/logout', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  const apiKey = process.env.ZAPIKEY_logout;
  handleProxyRequest(req, res, targetWebhookURL, apiKey);
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

    const payload = {
      ...clientPayload,
    };

    if (clientKey) {
      payload.clientKey = clientKey;
    }

    const response = await axios.post(targetURL, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error forwarding request:', error.message, error.response ? error.response.data : '');

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({
        success: false,
        message: 'No response received from the target URL.',
      });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// Add this route to forward requests to '/zoho-api/*' to 'https://desk.zoho.com/api/*'
app.all('/zoho-api/*', async (req, res) => {
  const path = req.params[0]; // Extract the path after '/zoho-api/'
  const targetURL = `https://desk.zoho.com/api/${path}`;

  const makeApiRequest = async () => {
    const headers = { ...req.headers };
    delete headers['host'];
    delete headers['origin'];
    delete headers['referer'];
    delete headers['accept-encoding'];

    headers['Host'] = 'desk.zoho.com';
    headers['Authorization'] = `Zoho-oauthtoken ${accessToken}`;

    if (process.env.DESK_ORG_ID) {
      headers['orgId'] = process.env.DESK_ORG_ID;
    }

    return await axios({
      method: req.method,
      url: targetURL,
      data: req.body,
      headers: headers,
      params: req.query,
      timeout: 30000,
    });
  };

  try {
    let response = await makeApiRequest();
    res.status(response.status).send(response.data);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('Access token expired, refreshing token...');
      const refreshResult = await refreshAccessToken();

      if (refreshResult.success) {
        try {
          response = await makeApiRequest();
          res.status(response.status).send(response.data);
        } catch (retryError) {
          console.error('Error after token refresh:', retryError.response ? retryError.response.data : retryError.message);
          res.status(retryError.response ? retryError.response.status : 500).send(retryError.response ? retryError.response.data : retryError.message);
        }
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to refresh access token.',
          error: refreshResult.error,
        });
      }
    } else {
      console.error('Error forwarding request:', error.response ? error.response.data : error.message);
      res.status(error.response ? error.response.status : 500).send(error.response ? error.response.data : error.message);
    }
  }
});

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
