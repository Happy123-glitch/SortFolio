import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnalyzeIssue } from '../supabase/functions/analyze-issue/index.ts';

test('Phase 5: analyze-issue Edge Function Pipeline', async (t) => {
  await t.test('CORS preflight: returns 200 OK for OPTIONS', async () => {
    const req = new Request('http://localhost/functions/v1/analyze-issue', {
      method: 'OPTIONS',
    });
    const res = await handleAnalyzeIssue(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  });

  await t.test('Method validation: rejects non-POST requests with 405', async () => {
    const req = new Request('http://localhost/functions/v1/analyze-issue', {
      method: 'GET',
    });
    const res = await handleAnalyzeIssue(req);
    assert.equal(res.status, 405);
  });

  await t.test('Payload validation: rejects missing fields with 400', async () => {
    const req = new Request('http://localhost/functions/v1/analyze-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await handleAnalyzeIssue(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Missing required fields/);
  });

  await t.test('Reference validation: rejects malformed repo name with 400', async () => {
    const req = new Request('http://localhost/functions/v1/analyze-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'invalid_repo_name', issueNumber: 42 }),
    });
    const res = await handleAnalyzeIssue(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Invalid GitHub reference/);
  });

  await t.test('End-to-End Orchestration: runs analysis pipeline and produces auditable report', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        const u = url.toString();

        // 1. Mock GitHub Issue fetch
        if (u.includes('issues/5240')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              title: 'Flask URL routing parameter verification',
              body: 'Does add_url_rule accept parameter provide_automatic_options in `src/flask/app.py`?',
              state: 'closed',
              user: { login: 'tester' },
              html_url: 'https://github.com/pallets/flask/issues/5240',
              labels: [{ name: 'verified' }],
              created_at: '2026-10-31T12:00:00Z',
            }),
          };
        }

        // 2. Mock GitHub default branch
        if (u.endsWith('/repos/pallets/flask')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ default_branch: 'main' }),
          };
        }

        // 3. Mock GitHub commit pinning
        if (u.endsWith('/commits/main')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ sha: '1234567890abcdef' }),
          };
        }

        // 4. Mock GitHub raw file content
        if (u.includes('src/flask/app.py')) {
          const sampleCode = `
class Flask:
    def add_url_rule(
        self,
        rule: str,
        provide_automatic_options: bool = None,
        **options
    ):
        pass
`;
          return {
            ok: true,
            status: 200,
            text: async () => sampleCode,
          };
        }

        return { ok: false, status: 404, statusText: 'Not found' };
      };

      const req = new Request('http://localhost/functions/v1/analyze-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'pallets/flask', issueNumber: 5240 }),
      });

      const res = await handleAnalyzeIssue(req);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.run.status, 'completed');
      assert.equal(data.run.repo_full_name, 'pallets/flask');
      assert.equal(data.run.item_number, 5240);
      assert.equal(data.run.commit_sha, '1234567890abcdef');

      // Verify claims extracted
      assert.ok(data.claims.length > 0);
      assert.ok(data.claims.some((c) => c.status === 'supported'));

      // Verify evidence grounded
      const supportedClaim = data.claims.find((c) => c.status === 'supported');
      assert.ok(supportedClaim.evidence.length > 0);
      assert.equal(supportedClaim.evidence[0].file_path, 'src/flask/app.py');
      assert.match(supportedClaim.evidence[0].source_url, /github\.com\/pallets\/flask/);

      // Verify model audit trail
      assert.ok(data.modelRuns.length > 0);
      assert.ok(data.modelRuns.some((mr) => mr.task === 'claim_extraction'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
