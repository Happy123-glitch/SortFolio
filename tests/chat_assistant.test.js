import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerTriageQueryWithModel,
  generateDeterministicTriageAnswer,
} from '../supabase/functions/_shared/model-provider.ts';
import { handleChatAssistant } from '../supabase/functions/chat-assistant/index.ts';
import { SortfolioAPI } from '../js/api.js';

const MOCK_REPORT = {
  repo: 'pallets/flask',
  number: 4912,
  title: 'False claim about instance_path',
  claims: [
    {
      text: 'Flask.__init__ has no parameter named instance_path',
      status: 'contradicted',
      where: 'Contradicted by src/flask/app.py • Lines 5–10',
      evidence: {
        path: 'src/flask/app.py',
        start: 5,
        end: 10,
        lines: [[5, 'def __init__(self, instance_path=None):']],
      },
    },
  ],
};

test('AI Triage Assistant & Conversational Chatbot', async (t) => {
  await t.test('generateDeterministicTriageAnswer: drafts maintainer reply with cited evidence', () => {
    const reply = generateDeterministicTriageAnswer('Please draft a maintainer reply for this issue', MOCK_REPORT);
    assert.match(reply, /suggested maintainer reply/i);
    assert.ok(reply.includes('src/flask/app.py'));
    assert.match(reply, /5[–-]10/);
    assert.ok(reply.includes('contradicted'));
  });

  await t.test('generateDeterministicTriageAnswer: explains why claim is contradicted', () => {
    const reply = generateDeterministicTriageAnswer('Why is this claim contradicted?', MOCK_REPORT);
    assert.ok(reply.includes('Contradiction Details'));
    assert.ok(reply.includes('Flask.__init__ has no parameter named instance_path'));
    assert.ok(reply.includes('src/flask/app.py'));
  });

  await t.test('generateDeterministicTriageAnswer: lists verified code lines and anchors', () => {
    const reply = generateDeterministicTriageAnswer('Show verified code lines and locations', MOCK_REPORT);
    assert.ok(reply.includes('Verified Code Locations'));
    assert.match(reply, /5[–-]10/);
  });

  await t.test('generateDeterministicTriageAnswer: explains evidence gaps for unverified cases', () => {
    const unverifiedReport = {
      repo: 'psf/requests',
      number: 6180,
      claims: [
        {
          text: 'Requests causes segfault in OpenSSL on custom embedded MIPS build',
          status: 'unverified',
          where: 'Missing reproducible environment',
        },
      ],
    };
    const reply = generateDeterministicTriageAnswer('What evidence is missing?', unverifiedReport);
    assert.ok(reply.includes('Missing Evidence / Evidence Gaps'));
    assert.ok(reply.includes('does not guess'));
  });

  await t.test('answerTriageQueryWithModel: falls back gracefully when model is offline', async () => {
    const res = await answerTriageQueryWithModel('Draft reply', MOCK_REPORT, {
      provider: 'ollama',
      modelId: 'qwen2.5:7b',
      endpoint: 'http://127.0.0.1:9999/unreachable',
    });
    assert.equal(res.modelRun.outcome, 'fallback');
    assert.match(res.reply, /suggested maintainer reply/i);
    assert.ok(res.reply.includes('src/flask/app.py'));
  });

  await t.test('handleChatAssistant Edge Function: rejects non-POST requests with 405', async () => {
    const req = new Request('http://localhost/functions/v1/chat-assistant', { method: 'GET' });
    const res = await handleChatAssistant(req);
    assert.equal(res.status, 405);
  });

  await t.test('handleChatAssistant Edge Function: validates required fields', async () => {
    const req = new Request('http://localhost/functions/v1/chat-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await handleChatAssistant(req);
    assert.equal(res.status, 400);
  });

  await t.test('handleChatAssistant Edge Function: processes chat query and returns 200 with reply', async () => {
    const req = new Request('http://localhost/functions/v1/chat-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Where is the evidence located?',
        report: MOCK_REPORT,
      }),
    });
    const res = await handleChatAssistant(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.reply);
    assert.ok(data.reply.includes('src/flask/app.py'));
    assert.equal(data.modelRun.task, 'general_summary');
  });

  await t.test('SortfolioAPI client exposes askAssistant and analyzePullRequest', () => {
    const api = new SortfolioAPI({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'mock-key' });
    assert.equal(typeof api.askAssistant, 'function');
    assert.equal(typeof api.analyzePullRequest, 'function');
  });
});
