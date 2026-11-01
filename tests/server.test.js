import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../server.js';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

function createMockReqRes({ method = 'GET', url = '/', headers = {}, body = null }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:3000', ...headers };

  class MockRes extends Writable {
    constructor() {
      super();
      this.statusCode = 200;
      this.headers = {};
      this.bodyChunks = [];
    }
    _write(chunk, encoding, callback) {
      this.bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }
    writeHead(code, headers = {}) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(headers)) {
        this.setHeader(k, v);
      }
    }
    get body() {
      return Buffer.concat(this.bodyChunks).toString('utf8');
    }
  }

  const res = new MockRes();

  process.nextTick(() => {
    if (body) {
      req.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(body));
    }
    req.emit('end');
  });

  return { req, res };
}

test('Sortfolio Unified Backend Server (server.js)', async (t) => {
  await t.test('Responds to /health with status ok and service name', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', url: '/health' });
    await handleRequest(req, res);
    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.service, 'sortfolio-backend');
  });

  await t.test('Handles CORS OPTIONS preflight', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS', url: '/functions/v1/analyze-issue' });
    await handleRequest(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.body, 'ok');
  });

  await t.test('Routes to /functions/v1/analyze-issue and rejects empty payload with 400', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/functions/v1/analyze-issue',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    await handleRequest(req, res);
    assert.equal(res.statusCode, 400);
    const parsed = JSON.parse(res.body);
    assert.match(parsed.error, /Missing required fields/);
  });

  await t.test('Routes to /functions/v1/analyze-pr and rejects non-POST request with 405', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/functions/v1/analyze-pr'
    });
    await handleRequest(req, res);
    assert.equal(res.statusCode, 405);
  });

  await t.test('Serves static file index.html on root /', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', url: '/' });
    await new Promise((resolve) => {
      res.on('finish', resolve);
      handleRequest(req, res);
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /Sortfolio/);
  });
});
