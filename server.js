// ==============================================================================
// Sortfolio Unified Backend Server (Node.js)
// Serves API endpoints (compatible with Supabase Edge Functions) and Static Files
// ==============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAnalyzeIssue } from './supabase/functions/analyze-issue/index.ts';
import { handleAnalyzePR } from './supabase/functions/analyze-pr/index.ts';
import { handleChatAssistant } from './supabase/functions/chat-assistant/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8'
};

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  if (typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export async function handleRequest(req, res) {
  const host = req.headers?.host || `localhost:${PORT}`;
  const fullUrl = `http://${host}${req.url}`;
  const parsedUrl = new URL(fullUrl);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  // 1. Health check
  if (pathname === '/health' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'sortfolio-backend',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Helper to adapt Node req/res to Web Request/Response handler
  async function forwardToEdgeHandler(handler) {
    try {
      const bodyBuffer = (req.method === 'GET' || req.method === 'HEAD') ? undefined : await readBody(req);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers || {})) {
        if (v !== undefined) {
          if (Array.isArray(v)) {
            v.forEach(val => headers.append(k, val));
          } else {
            headers.set(k, v);
          }
        }
      }

      const webRequest = new Request(fullUrl, {
        method: req.method,
        headers,
        body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined
      });

      const response = await handler(webRequest);
      const responseHeaders = {};
      for (const [k, v] of response.headers.entries()) {
        responseHeaders[k] = v;
      }

      res.writeHead(response.status, responseHeaders);
      const responseBuffer = Buffer.from(await response.arrayBuffer());
      res.end(responseBuffer);
    } catch (err) {
      console.error('Handler error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
    }
  }

  // 2. API Endpoints (both Supabase Edge Function paths and /api aliases)
  if (pathname === '/functions/v1/analyze-issue' || pathname === '/api/analyze-issue') {
    await forwardToEdgeHandler(handleAnalyzeIssue);
    return;
  }

  if (pathname === '/functions/v1/analyze-pr' || pathname === '/api/analyze-pr') {
    await forwardToEdgeHandler(handleAnalyzePR);
    return;
  }

  if (pathname === '/functions/v1/chat-assistant' || pathname === '/api/chat-assistant') {
    await forwardToEdgeHandler(handleChatAssistant);
    return;
  }

  // 3. Static Files Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(normalizedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      const htmlPath = normalizedPath + '.html';
      if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
        const stream = fs.createReadStream(htmlPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        stream.pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(normalizedPath).pipe(res);
  });
}

export function createServer() {
  return http.createServer(handleRequest);
}

// Start standalone server if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Sortfolio server listening on port ${PORT}`);
  });
}
