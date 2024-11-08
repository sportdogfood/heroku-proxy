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

app.post('/proxy/logout', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.82c68c4f4a0530a2060d237546ef9a5c.5256a1838c7b6d570c630ef200dee71d&isdebug=false';
  handleProxyRequest(req, res, targetWebhookURL);
});

app.post('/proxy/auth', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.8cc8785c2793dabb1fdb06f731bb493e.fda6cdb7ec5bcdf70b76b68d5307a6c4&isdebug=false';
  handleProxyRequest(req, res, targetWebhookURL);
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
