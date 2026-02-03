// server.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
const allowedOrigins = [
  'https://www.sportdogfood.com',
  'https://sportdogfood.com',
  'http://www.sportdogfood.com',
  'http://sportdogfood.com',
  'https://secure.sportdogfood.com',
  'https://tackready.webflow.io',
];

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS policy: This origin is not allowed.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Airtable env
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_HORSES_TABLE = process.env.AIRTABLE_HORSES_TABLE || 'tblliyUZ1ZS88Kfvl';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID');
}

// Airtable helper
async function makeAirtableRequest(method, path, params = null, data = null) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw { status: 500, data: { message: 'Missing Airtable env vars on server' } };
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const config = { method, url, headers };
  if (params) config.params = params;
  if (data && !['GET', 'HEAD'].includes(method.toUpperCase())) config.data = data;

  try {
    const r = await axios(config);
    return r.data;
  } catch (e) {
    if (e.response) throw { status: e.response.status, data: e.response.data };
    throw { status: 500, data: { message: 'Internal Server Error' } };
  }
}

// Root route (so / is NOT 404)
app.get('/', (req, res) => {
  res.json({ ok: true, app: 'cat-heroku-proxy', routes: ['/airtable/ping'] });
});

// Ping route
app.get('/airtable/ping', async (req, res) => {
  try {
    const data = await makeAirtableRequest('GET', AIRTABLE_HORSES_TABLE, { pageSize: 1 });
    res.json({ success: true, message: 'Airtable OK', sample: data?.records?.[0] || null });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: 'Airtable failed', details: err.data });
  }
});

app.get('/favicon.ico', (req, res) => res.sendStatus(204));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
