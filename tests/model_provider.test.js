import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getModelConfig,
  parseClaimsJson,
  sanitizeExplanation,
  deterministicExtractClaims,
  extractClaimsWithModel,
  explainEvidenceWithModel,
} from '../supabase/functions/_shared/model-provider.ts';

test('Phase 4: Open-Weight AI Model Integration & Guardrails', async (t) => {
  await t.test('getModelConfig: enforces Hackathon Rule 10 against closed APIs', () => {
    const originalEnv = process.env.OPEN_WEIGHT_MODEL_BASE_URL;
    try {
      process.env.OPEN_WEIGHT_MODEL_BASE_URL = 'https://api.openai.com/v1';
      assert.throws(
        () => getModelConfig(),
        /Hackathon Rule 10 Violation: Closed proprietary model APIs/
      );
    } finally {
      process.env.OPEN_WEIGHT_MODEL_BASE_URL = originalEnv;
    }
  });

  await t.test('parseClaimsJson: parses valid JSON enclosed in markdown fences', () => {
    const rawOutput = `\`\`\`json
{
  "claims": [
    {
      "originalText": "add_url_rule has no parameter provide_automatic_options",
      "claimType": "parameter_existence",
      "targetSymbol": "provide_automatic_options",
      "entity": "add_url_rule"
    }
  ]
}
\`\`\``;

    const claims = parseClaimsJson(rawOutput);
    assert.ok(claims);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].originalText, 'add_url_rule has no parameter provide_automatic_options');
    assert.equal(claims[0].claimType, 'parameter_existence');
  });

  await t.test('parseClaimsJson: gracefully returns null for invalid JSON', () => {
    assert.equal(parseClaimsJson('Not a JSON string at all'), null);
    assert.equal(parseClaimsJson('{"incomplete": '), null);
  });

  await t.test('sanitizeExplanation: strips hallucinated file paths', () => {
    const hallucinated = 'According to fake/path/secret.py, line 20 shows a crash.';
    const sanitized = sanitizeExplanation(hallucinated, 'src/flask/app.py');
    assert.ok(!sanitized.includes('fake/path/secret.py'));
    assert.ok(sanitized.includes('[inspected source]'));

    const authentic = 'Inspected src/flask/app.py lines 14-21.';
    const kept = sanitizeExplanation(authentic, 'src/flask/app.py');
    assert.ok(kept.includes('src/flask/app.py'));
  });

  await t.test('deterministicExtractClaims: extracts claims using static patterns when model is offline', () => {
    const title = 'Bug: Flask.__init__ missing instance_path';
    const body = 'The constructor does not accept parameter instance_path anymore in `flask.app`.';

    const claims = deterministicExtractClaims(title, body);
    assert.ok(claims.length >= 1);
    assert.ok(claims.some((c) => c.targetSymbol === 'instance_path'));
    assert.equal(claims[0].claimType, 'parameter_existence');
  });

  await t.test('extractClaimsWithModel: falls back to deterministic extraction when model is unreachable', async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Simulate network connection failure (e.g. Ollama daemon not running)
      globalThis.fetch = async () => {
        throw new Error('Connection refused: ECONNREFUSED 127.0.0.1:11434');
      };

      const result = await extractClaimsWithModel(
        'Flask route error',
        'Function add_url_rule accepts parameter provide_automatic_options'
      );

      assert.ok(result.claims.length > 0);
      assert.equal(result.modelRun.outcome, 'fallback');
      assert.ok(result.modelRun.metadata?.error);
      assert.equal(result.modelRun.task, 'claim_extraction');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('extractClaimsWithModel: succeeds when open-weight model returns valid JSON', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              claims: [
                {
                  originalText: 'Flask.__init__ takes parameter import_name',
                  claimType: 'parameter_existence',
                  targetSymbol: 'import_name',
                },
              ],
            }),
          },
        }),
      });

      const result = await extractClaimsWithModel('Flask title', 'Flask body');
      assert.equal(result.modelRun.outcome, 'success');
      assert.equal(result.claims.length, 1);
      assert.equal(result.claims[0].targetSymbol, 'import_name');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('explainEvidenceWithModel: produces explanation and handles fallback', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        throw new Error('Timeout');
      };

      const result = await explainEvidenceWithModel(
        'add_url_rule accepts provide_automatic_options',
        'def add_url_rule(..., provide_automatic_options=None):',
        'src/flask/app.py',
        '#L14-L21',
        'supported'
      );

      assert.ok(result.explanation.includes('src/flask/app.py'));
      assert.equal(result.modelRun.outcome, 'fallback');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
