const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------
// CORS configuration (FIXED: single CORS middleware, uses your allowlist)
// --------------------
const allowedOrigins = [
  'https://www.sportdogfood.com',
  'https://sportdogfood.com',
  'http://www.sportdogfood.com',
  'http://sportdogfood.com',
  'https://tackready.webflow.io',
  'https://secure.sportdogfood.com',
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl/postman
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.log(`Disallowed origin: ${origin}`);
    return callback(new Error('CORS policy: This origin is not allowed.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// --------------------
// Airtable env (FIXED: no duplicate CORS blocks, env checks stay)
// --------------------
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_HORSES_TABLE = process.env.AIRTABLE_HORSES_TABLE || 'tblliyUZ1ZS88Kfvl';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('Error: Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID.');
  process.exit(1);
}

// --------------------
// Airtable helper
// --------------------
const makeAirtableRequest = async (method, path, params = null, data = null) => {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const config = { method, url, headers };
  if (params) config.params = params;
  if (data && !['GET', 'HEAD'].includes(method.toUpperCase())) config.data = data;

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) throw { status: error.response.status, data: error.response.data };
    throw { status: 500, data: { message: 'Internal Server Error' } };
  }
};

// --------------------
// Zoho Flow proxy helper
// --------------------
const handleProxyRequest = async (req, res, targetWebhookURL) => {
  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload provided.' });
    }

    const params = {
      zapikey: process.env.ZAPIKEY || 'default-key',
      isdebug: false,
    };

    const response = await axios.post(targetWebhookURL, clientPayload, {
      params,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message, error.response ? error.response.data : '');

    if (error.response) {
      return res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      return res.status(500).json({ success: false, message: 'No response received from the target webhook.' });
    } else {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
};

// --------------------
// Proxy endpoints
// --------------------
app.post('/proxy', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  handleProxyRequest(req, res, targetWebhookURL);
});

app.post('/proxy/recover', (req, res) => {
  const targetWebhookURL = 'https://flow.zoho.com/681603876/flow/webhook/incoming';
  handleProxyRequest(req, res, targetWebhookURL);
});

// --------------------
// Airtable test route
// --------------------
app.get('/airtable/ping', async (req, res) => {
  try {
    const data = await makeAirtableRequest('GET', AIRTABLE_HORSES_TABLE, { pageSize: 1 });
    res.json({ success: true, message: 'Airtable OK', sample: data?.records?.[0] || null });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: 'Airtable failed',
      details: error.data,
    });
  }
});

// Handle favicon.ico requests
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Root (optional)
app.get('/', (req, res) => res.send('Proxy server running.'));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
