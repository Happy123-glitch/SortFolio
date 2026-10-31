import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitDiff, handleAnalyzePR } from '../supabase/functions/analyze-pr/index.ts';

const SAMPLE_DIFF = `diff --git a/src/flask/app.py b/src/flask/app.py
index 1234..5678 100644
--- a/src/flask/app.py
+++ b/src/flask/app.py
@@ -10,6 +10,8 @@ def add_url_rule(
         rule: str,
+        provide_automatic_options: bool = None,
+        endpoint: str = None,
         view_func = None
`;

test('Secondary Workflow: analyze-pr Edge Function Pipeline', async (t) => {
  await t.test('parseGitDiff: parses files and added line numbers', () => {
    const chunks = parseGitDiff(SAMPLE_DIFF);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].filePath, 'src/flask/app.py');
    assert.ok(chunks[0].patch.includes('provide_automatic_options'));
    assert.ok(chunks[0].addedLines.length > 0);
  });

  await t.test('handleAnalyzePR: rejects non-POST requests with 405', async () => {
    const req = new Request('http://localhost/functions/v1/analyze-pr', { method: 'GET' });
    const res = await handleAnalyzePR(req);
    assert.equal(res.status, 405);
  });

  await t.test('handleAnalyzePR: verifies PR diff against claimed changes', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        const u = url.toString();
        if (u.includes('pulls/100')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              title: 'Add provide_automatic_options parameter to routing',
              body: 'This PR adds provide_automatic_options to add_url_rule in `src/flask/app.py`.',
              user: { login: 'flask-dev' },
              html_url: 'https://github.com/pallets/flask/pull/100',
              head: { sha: 'commit12345', ref: 'feature-branch' },
              base: { ref: 'main' },
            }),
            text: async () => SAMPLE_DIFF,
          };
        }
        return { ok: false, status: 404 };
      };

      const req = new Request('http://localhost/functions/v1/analyze-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'pallets/flask', prNumber: 100 }),
      });

      const res = await handleAnalyzePR(req);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.run.item_type, 'pull_request');
      assert.equal(data.run.status, 'completed');
      assert.ok(data.claims.length > 0);
      assert.ok(data.claims.some((c) => c.status === 'supported'));

      const supported = data.claims.find((c) => c.status === 'supported');
      assert.ok(supported.evidence.length > 0);
      assert.equal(supported.evidence[0].file_path, 'src/flask/app.py');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
