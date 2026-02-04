// index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------
// Origins (single source of truth)
// --------------------
const allowedOrigins = [
  'https://www.sportdogfood.com',
  'https://sportdogfood.com',
  'http://www.sportdogfood.com',
  'http://sportdogfood.com',
  'https://secure.sportdogfood.com',
  'https://sport-dog-food.webflow.io',
  'https://tackready.webflow.io',
  'https://hooks.webflow.com',
  'https://webflow.com',
  'https://sportdogfood.github.io',
];

// --------------------
// CORS (Express) - allowlist (NOT open)
// --------------------
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/postman
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS policy: This origin is not allowed.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
  credentials: true,
  maxAge: 86400,
};

const corsMw = cors(corsOptions);
app.use(corsMw);
app.options('*', corsMw);

// --------------------
// Socket.IO (same allowlist)
// --------------------
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
    credentials: true,
  },
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinRoom', (userID) => {
    socket.join(userID);
    console.log(`User ${socket.id} joined room: ${userID}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// --------------------
// Airtable env + helper
// --------------------
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_HORSES_TABLE = process.env.AIRTABLE_HORSES_TABLE || 'tblliyUZ1ZS88Kfvl';

async function airtableReq(method, path, params = null, data = null) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw {
      status: 500,
      data: { message: 'Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID on server.' },
    };
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const config = { method, url, headers };
  if (params) config.params = params;
  if (data && !['GET', 'HEAD'].includes(String(method).toUpperCase())) config.data = data;

  try {
    const r = await axios(config);
    return r.data;
  } catch (e) {
    if (e.response) throw { status: e.response.status, data: e.response.data };
    throw { status: 500, data: { message: 'Internal Server Error' } };
  }
}

// --------------------
// Root (so / is not 404)
// --------------------
app.get('/', (req, res) => {
  res.json({
    ok: true,
    app: 'heroku-proxy',
    routes: ['/airtable/ping', '/airtable/horses', '/airtable/horses/:recordId'],
  });
});

// --------------------
// Airtable routes
// --------------------

// 1) Ping (proves Express route + Airtable auth + CORS)
app.get('/airtable/ping', async (req, res) => {
  try {
    const data = await airtableReq('GET', AIRTABLE_HORSES_TABLE, { pageSize: 1 });
    res.json({ success: true, message: 'Airtable OK', sample: data?.records?.[0] || null });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'Airtable failed', details: err.data });
  }
});

// 2) List (GET first N)
app.get('/airtable/horses', async (req, res) => {
  try {
    const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize || '10', 10), 100));
    const view = req.query.view ? String(req.query.view) : undefined;

    const params = { pageSize };
    if (view) params.view = view;

    const data = await airtableReq('GET', AIRTABLE_HORSES_TABLE, params);
    res.json({ success: true, records: data?.records || [] });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'List failed', details: err.data });
  }
});

// 3) Get 1 record
app.get('/airtable/horses/:recordId', async (req, res) => {
  try {
    const recordId = String(req.params.recordId || '').trim();
    if (!recordId) return res.status(400).json({ success: false, message: 'Missing recordId' });

    const data = await airtableReq('GET', `${AIRTABLE_HORSES_TABLE}/${encodeURIComponent(recordId)}`);
    res.json({ success: true, record: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'Fetch failed', details: err.data });
  }
});

// 4) Patch record (expects { fields: {...} } OR { horse: "ATLAS" })
app.patch('/airtable/horses/:recordId', async (req, res) => {
  try {
    const recordId = String(req.params.recordId || '').trim();
    if (!recordId) return res.status(400).json({ success: false, message: 'Missing recordId' });

    let fields = null;

    if (req.body && typeof req.body === 'object') {
      if (req.body.fields && typeof req.body.fields === 'object') fields = req.body.fields;
      else if (typeof req.body.horse === 'string') fields = { horse: req.body.horse };
    }

    if (!fields) {
      return res.status(400).json({
        success: false,
        message: 'Invalid body. Send { "fields": { ... } } or { "horse": "NAME" }',
      });
    }

    const data = await airtableReq('PATCH', `${AIRTABLE_HORSES_TABLE}/${encodeURIComponent(recordId)}`, null, {
      fields,
    });

    res.json({ success: true, record: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'Patch failed', details: err.data });
  }
});

// 5) Create record (expects { fields: {...} } OR { horse: "ATLAS" })
app.post('/airtable/horses', async (req, res) => {
  try {
    let fields = null;

    if (req.body && typeof req.body === 'object') {
      if (req.body.fields && typeof req.body.fields === 'object') fields = req.body.fields;
      else if (typeof req.body.horse === 'string') fields = { horse: req.body.horse };
    }

    if (!fields) {
      return res.status(400).json({
        success: false,
        message: 'Invalid body. Send { "fields": { ... } } or { "horse": "NAME" }',
      });
    }

    const data = await airtableReq('POST', AIRTABLE_HORSES_TABLE, null, { fields });
    res.status(201).json({ success: true, record: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'Create failed', details: err.data });
  }
});

// --------------------
// Stallcards table
// --------------------
const AIRTABLE_STALLCARDS_TABLE =
  process.env.AIRTABLE_STALLCARDS_TABLE || 'tbldfkyqm07gBqFWY';

// --------------------
// Airtable stallcards routes
// --------------------

// 1) List (GET first N, default view=approved, max 100)
app.get('/airtable/stallcards', async (req, res) => {
  try {
    const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize || '100', 10), 100));
    const view = req.query.view ? String(req.query.view) : 'approved';

    const params = { pageSize, view };

    const data = await airtableReq('GET', AIRTABLE_STALLCARDS_TABLE, params);
    res.json({ success: true, records: data?.records || [] });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'List failed', details: err.data });
  }
});

// 2) Get 1 record
app.get('/airtable/stallcards/:recordId', async (req, res) => {
  try {
    const recordId = String(req.params.recordId || '').trim();
    if (!recordId) return res.status(400).json({ success: false, message: 'Missing recordId' });

    const data = await airtableReq(
      'GET',
      `${AIRTABLE_STALLCARDS_TABLE}/${encodeURIComponent(recordId)}`
    );

    res.json({ success: true, record: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'Fetch failed', details: err.data });
  }
});

// 3) Patch record (expects { fields: {...} })
app.patch('/airtable/stallcards/:recordId', async (req, res) => {
  try {
    const recordId = String(req.params.recordId || '').trim();
    if (!recordId) return res.status(400).json({ success: false, message: 'Missing recordId' });

    const fields = (req.body && typeof req.body === 'object' && req.body.fields && typeof req.body.fields === 'object')
      ? req.body.fields
      : null;

    if (!fields) {
      return res.status(400).json({
        success: false,
        message: 'Invalid body. Send { "fields": { ... } }',
      });
    }

    const data = await airtableReq(
      'PATCH',
      `${AIRTABLE_STALLCARDS_TABLE}/${encodeURIComponent(recordId)}`,
      null,
      { fields }
    );

    res.json({ success: true, record: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'Patch failed', details: err.data });
  }
});

// 4) Create record (expects { fields: {...} })
app.post('/airtable/stallcards', async (req, res) => {
  try {
    const fields = (req.body && typeof req.body === 'object' && req.body.fields && typeof req.body.fields === 'object')
      ? req.body.fields
      : null;

    if (!fields) {
      return res.status(400).json({
        success: false,
        message: 'Invalid body. Send { "fields": { ... } }',
      });
    }

    const data = await airtableReq('POST', AIRTABLE_STALLCARDS_TABLE, null, { fields });
    res.status(201).json({ success: true, record: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'Create failed', details: err.data });
  }
});


// --------------------
// Existing proxy helper (safer: doesn't add zapikey unless provided)
// --------------------
const handleProxyRequest = async (req, res, targetWebhookURL, apiKey) => {
  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload provided.' });
    }

    const params = { isdebug: false };

    // Only add zapikey if apiKey is a non-empty string AND URL doesn't already include it
    if (typeof apiKey === 'string' && apiKey.trim()) {
      if (!String(targetWebhookURL).includes('zapikey=')) params.zapikey = apiKey.trim();
    }

    const response = await axios.post(targetWebhookURL, clientPayload, {
      params,
      headers: {
        'Content-Type': 'application/json',
        'fx-customer': req.headers['fx-customer'] || '',
      },
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
// Proxy endpoints (unchanged URLs)
// --------------------
app.post('/proxy/session', (req, res) => {
  const targetWebhookURL =
    'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.946854075052a0c11090978c62d7ac49.44750e9a2e205fca9fa9e9bcd2d2c742';
  handleProxyRequest(req, res, targetWebhookURL, null);
});

app.post('/enrichment-complete', (req, res) => {
  console.log('Incoming request body:', req.body);

  const enrichedData = req.body;
  console.log('Enriched data received:', enrichedData);

  const userID = enrichedData.userID;
  if (userID) io.to(userID).emit('enriched-data-ready', enrichedData);
  else console.error('User ID not found in the enriched data.');

  res.status(200).send('Enrichment complete');
});

app.post('/proxy/recover', (req, res) => {
  const targetWebhookURL =
    'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.e48ac834463666ce61b714c906934d9e.70001f597361bdb34f7ce91b3cc6bb1a&isdebug=false';
  handleProxyRequest(req, res, targetWebhookURL);
});

app.post('/proxy/end', (req, res) => {
  const targetWebhookURL =
    'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.82c68c4f4a0530a2060d237546ef9a5c.5256a1838c7b6d570c630ef200dee71d';

  const clientPayload = req.body;

  if (!clientPayload.sessionId || !clientPayload.timestamp) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields in payload: sessionId, timestamp.',
    });
  }

  handleProxyRequest(req, res, targetWebhookURL);
});

app.post('/proxy/auth', (req, res) => {
  const targetWebhookURL =
    'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.8cc8785c2793dabb1fdb06f731bb493e.fda6cdb7ec5bcdf70b76b68d5307a6c4';

  const clientPayload = req.body;

  if (!clientPayload.sessionId || !clientPayload.timestamp) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields in payload: sessionId, timestamp.',
    });
  }

  handleProxyRequest(req, res, targetWebhookURL);
});

app.post('/proxy/start', (req, res) => {
  const targetWebhookURL =
    'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.8b174169355355f1746f8619a4adf8f9.22e42bb52899117a0c22e28743a8b7a7';

  const clientPayload = req.body;

  if (!clientPayload.sessionId || !clientPayload.timestamp) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields in payload: sessionId, timestamp.',
    });
  }

  handleProxyRequest(req, res, targetWebhookURL, null);
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

const forwardRequestToTarget = async (req, res, targetURL, clientKey) => {
  try {
    const clientPayload = req.body;

    const payload = { ...clientPayload };
    if (clientKey) payload.clientKey = clientKey;

    const response = await axios.post(targetURL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error forwarding request:', error.message, error.response ? error.response.data : '');

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({ success: false, message: 'No response received from the target URL.' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// Forward requests to the Webflow webhook
app.post('/proxy/webflow', async (req, res) => {
  const webhookUrl = 'https://hooks.webflow.com/logic/5c919f089b1194a099fe6c41/w_qApc_TrDQ';

  try {
    const clientPayload = req.body;

    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload provided.' });
    }

    const response = await axios.post(webhookUrl, clientPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error forwarding request to Webflow webhook:', error.message, error.response ? error.response.data : '');

    if (error.response) {
      res.status(error.response.status).json({ message: error.response.data });
    } else if (error.request) {
      res.status(500).json({ success: false, message: 'No response received from the Webflow webhook.' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

// Route to handle enriched data posted from Zoho Flow (kept)
app.post('/proxy/enriched-data', (req, res) => {
  const enrichedData = req.body;

  if (!enrichedData || typeof enrichedData !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid enriched data provided.' });
  }

  console.log('Enriched Data Received:', enrichedData);
  res.status(200).json({ success: true, message: 'Enriched data received successfully.' });
});

// favicon
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// 404 JSON (helps debugging)
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not Found', path: req.path });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
