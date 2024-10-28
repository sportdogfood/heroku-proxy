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
  'https://secure.sportdogfood.com',
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
  methods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
  credentials: true,
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS request
app.options('*', cors(corsOptions));

// Store tokens in memory or retrieve from environment variables
let accessToken = process.env.DESK_ACCESS_TOKEN || '';
let refreshToken = process.env.DESK_REFRESH_TOKEN;

// Function to refresh the access token
async function refreshAccessToken() {
  const clientId = process.env.DESK_CLIENT_ID;
  const clientSecret = process.env.DESK_CLIENT_SECRET;
  const refreshUrl = 'https://accounts.zoho.com/oauth/v2/token';

  const params = new URLSearchParams();
  params.append('refresh_token', refreshToken);
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'refresh_token');

  try {
    const response = await axios.post(refreshUrl, params);
    const data = response.data;

    // Update the access token
    accessToken = data.access_token;

    // Update the refresh token if provided
    if (data.refresh_token) {
      refreshToken = data.refresh_token;
    }

    console.log('Access token refreshed successfully.');
    return { success: true };
  } catch (error) {
    console.error('Error refreshing access token:', error.response ? error.response.data : error.message);
    return {
      success: false,
      error: error.response ? error.response.data : error.message,
    };
  }
}

// Helper function for proxy requests with different API keys
const handleProxyRequest = async (req, res, targetWebhookURL, apiKey) => {
  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload provided.' });
    }

    const params = {
      zapikey: apiKey, // Use the provided API key
      isdebug: false,
    };

    const response = await axios.post(targetWebhookURL, clientPayload, {
      params: params,
      headers: {
        'Content-Type': 'application/json',
        'fx-customer': req.headers['fx-customer'] || '', // Forward fx-customer header if available
      },
      timeout: 30000, // 30 seconds timeout
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

// NEW PROXY ROUTE (dynamic URL forwarding)
app.post('/proxy/bypass', (req, res) => {
  // Get the targetURL and clientKey from the request body
  const targetURL = req.body.targetURL;
  const clientKey = req.body.clientKey || ''; // Treat as empty if not provided

  // Ensure targetURL is provided
  if (!targetURL) {
    return res.status(400).json({ success: false, message: 'targetURL is required' });
  }

  // Forward the request to the targetURL along with the clientKey
  forwardRequestToTarget(req, res, targetURL, clientKey);
});

// Function to forward the request to the target URL
const forwardRequestToTarget = async (req, res, targetURL, clientKey) => {
  try {
    const clientPayload = req.body;

    // Build the payload, including clientKey if provided
    const payload = {
      ...clientPayload, // Include the original payload
    };

    if (clientKey) {
      payload.clientKey = clientKey;
    }

    // Forward the request to the targetURL using axios
    const response = await axios.post(targetURL, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds timeout
    });

    // Send back the response received from the targetURL
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error forwarding request:', error.message, error.response ? error.response.data : '');

    // Handle error based on axios response
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

  // Function to make the API request
  const makeApiRequest = async () => {
    const headers = { ...req.headers };
    delete headers['host'];
    delete headers['origin'];
    delete headers['referer'];
    delete headers['accept-encoding'];

    headers['Host'] = 'desk.zoho.com';
    headers['Authorization'] = `Zoho-oauthtoken ${accessToken}`;

    // Include orgId header if required
    if (process.env.DESK_ORG_ID) {
      headers['orgId'] = process.env.DESK_ORG_ID;
    }

    return await axios({
      method: req.method,
      url: targetURL,
      data: req.body,
      headers: headers,
      params: req.query, // Forward query parameters
      timeout: 30000, // 30 seconds timeout
    });
  };

  try {
    let response = await makeApiRequest();
    // Send back the response received from the target URL
    res.status(response.status).send(response.data);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Access token expired; refresh it and retry
      console.log('Access token expired, refreshing token...');
      const refreshResult = await refreshAccessToken();

      if (refreshResult.success) {
        try {
          // Retry the API request with the new access token
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

// ... (existing code above)

// Add this route to search contacts in Zoho Desk
app.get('/search-contact', async (req, res) => {
  // Extract parameters from the query string
  const {
    fx_customerId,
    deskId,
    crmId,
    fx_customerEmail,
    ticketId,
    threadId,
    last_name,
    subject_contains,
    lastname_contains,
  } = req.query;

  // Ensure fx_customerId and at least one other identifier is provided
  if (!fx_customerId) {
    return res.status(400).json({
      success: false,
      message: 'fx_customerId is required.',
    });
  }

  if (
    !deskId &&
    !crmId &&
    !fx_customerEmail &&
    !ticketId &&
    !threadId &&
    !last_name &&
    !subject_contains &&
    !lastname_contains
  ) {
    return res.status(400).json({
      success: false,
      message:
        'At least one identifier (deskId, crmId, fx_customerEmail, ticketId, threadId, last_name, subject_contains, lastname_contains) is required.',
    });
  }

  // Function to make the API request
  const makeApiRequest = async () => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    };

    // Include orgId header if required
    if (process.env.DESK_ORG_ID) {
      headers['orgId'] = process.env.DESK_ORG_ID;
    }

    // Build search criteria
    let searchCriteria = '';

    if (deskId) {
      searchCriteria += `(id:equals:${deskId})`;
    }

    if (crmId) {
      if (searchCriteria) searchCriteria += 'or';
      searchCriteria += `(crmContactId:equals:${crmId})`;
    }

    if (fx_customerEmail) {
      if (searchCriteria) searchCriteria += 'or';
      searchCriteria += `(email:equals:'${fx_customerEmail}')`;
    }

    if (last_name) {
      if (searchCriteria) searchCriteria += 'or';
      searchCriteria += `(lastName:equals:'${last_name}')`;
    }

    if (lastname_contains) {
      if (searchCriteria) searchCriteria += 'or';
      searchCriteria += `(lastName:contains:'${lastname_contains}')`;
    }

    if (subject_contains) {
      if (searchCriteria) searchCriteria += 'or';
      searchCriteria += `(subject:contains:'${subject_contains}')`;
    }

    // Encode the search criteria
    const encodedCriteria = encodeURIComponent(searchCriteria);

    // Zoho Desk API endpoint for searching contacts
    const targetURL = `https://desk.zoho.com/api/v1/contacts/search?searchStr=${encodedCriteria}`;

    return await axios({
      method: 'GET',
      url: targetURL,
      headers: headers,
      timeout: 30000, // 30 seconds timeout
    });
  };

  try {
    let response = await makeApiRequest();
    // Send back the response received from the target URL
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Access token expired; refresh it and retry
      console.log('Access token expired, refreshing token...');
      const refreshResult = await refreshAccessToken();

      if (refreshResult.success) {
        try {
          // Retry the API request with the new access token
          response = await makeApiRequest();
          res.status(response.status).json(response.data);
        } catch (retryError) {
          console.error('Error after token refresh:', retryError.response ? retryError.response.data : retryError.message);
          res.status(retryError.response ? retryError.response.status : 500).json({
            success: false,
            message: retryError.response ? retryError.response.data : retryError.message,
          });
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
      res.status(error.response ? error.response.status : 500).json({
        success: false,
        message: error.response ? error.response.data : error.message,
      });
    }
  }
});

// ... (existing code below)


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
