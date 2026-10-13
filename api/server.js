import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import handler from './index.js';
import aiRouter from './routes/ai.js';
import webhookHandler from './stripe-webhook.js';

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'auramind-gemini', 'dist');
const hasStaticBuild = fs.existsSync(distDir);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000', 'https://auramind.app'],
  credentials: true,
}));

// Stripe webhook — mounted with a RAW body parser BEFORE express.json(), because
// Stripe's signature is computed over the exact request bytes. Parsing + re-
// serializing the JSON body would break signature verification.
app.use('/api/stripe-webhook', express.raw({ type: '*/*' }), webhookHandler);

// Course creation uploads PDFs and photos as base64 JSON (up to ~4 MB);
// Express's default 100 KB limit rejected them on the dev server.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// AI proxy router — also mounted before the Vercel catch-all so streaming
// responses use the real Express response object (write/end/flushHeaders).
app.use('/api/ai', aiRouter);

// Proxy all API requests to the Vercel handler (runs first for all /api/* paths)
app.use('/api', async (req, res) => {
  try {
    const fullPath = req.url.startsWith('/') ? req.url.substring(1) : req.url; // Remove leading slash if present

    // Split "endpoint?query" so the path stays clean and extra query params
    // (e.g. /api/health?probe=db) survive the proxy into req.query.
    const [pathOnly, queryString = ''] = fullPath.split('?');
    const extraQuery = Object.fromEntries(new URLSearchParams(queryString));

    // Sanitized logging — never log body (may contain tokens/PII) or auth headers
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${req.method} /api/${pathOnly}`);
    }

    // Simulate Vercel request/response
    const vercelReq = {
      ...req,
      query: {
        path: pathOnly,
        ...extraQuery,
      },
      headers: req.headers,
      body: req.body,
      method: req.method
    };

    const vercelRes = {
      status: (code) => {
        res.status(code);
        return vercelRes;
      },
      setHeader: (name, value) => {
        res.setHeader(name, value);
        return vercelRes;
      },
      send: (body) => {
        res.send(body);
        return vercelRes;
      },
      json: (body) => {
        res.json(body);
        return vercelRes;
      }
    };

    await handler(vercelReq, vercelRes);
  } catch (error) {
    console.error('API Error:', error);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({ error: isProd ? 'Internal server error' : (error.message || 'Internal server error') });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auramind-api', version: '2.0.0', timestamp: Date.now() });
});

// In production, serve the built frontend from dist/
if (hasStaticBuild) {
  app.use(express.static(distDir));
  // SPA fallback — catch-all for client-side routes like /admin/vault
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'auramind-api', version: '2.0.0' });
  });
}

const server = app.listen(PORT, () => {
  const mode = hasStaticBuild ? 'production' : 'development';
  console.log(`AuraMind API server (${mode}) running on http://localhost:${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api/*`);
  if (hasStaticBuild) {
    console.log(`Frontend being served from ${distDir}`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[FATAL] Port ${PORT} is already in use — another AuraMind process may be running.`);
    console.error(`        Stop it (or set PORT to a free port) and restart the API. Exiting.`);
    process.exit(1);
  }
  throw err;
});
