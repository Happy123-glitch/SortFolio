import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePythonSource,
  isNegativeClaim,
  verifyClaimAgainstSource,
} from '../supabase/functions/_shared/analyzer.ts';

const SAMPLE_FLASK_CODE = `import os
from werkzeug.serving import run_simple

class Flask:
    def __init__(
        self,
        import_name: str,
        static_url_path: str = None,
        instance_path: str = None,
    ) -> None:
        self.import_name = import_name
        self.instance_path = instance_path

    def add_url_rule(
        self,
        rule: str,
        endpoint: str = None,
        view_func = None,
        provide_automatic_options: bool = None,
        **options
    ):
        pass

def create_app(config_file=None):
    return Flask(__name__)
`;

test('Phase 3: Deterministic Static Analysis Engine', async (t) => {
  await t.test('parsePythonSource: correctly parses classes and methods', () => {
    const facts = parsePythonSource(SAMPLE_FLASK_CODE, 'src/flask/app.py');
    assert.equal(facts.classes.length, 1);
    assert.equal(facts.classes[0].name, 'Flask');
    assert.equal(facts.classes[0].lineStart, 4);

    const initMethod = facts.functions.find((f) => f.name === '__init__');
    assert.ok(initMethod, '__init__ must be detected');
    assert.equal(initMethod.className, 'Flask');
    assert.equal(initMethod.kind, 'method');
    assert.equal(initMethod.lineStart, 5);
    assert.equal(initMethod.lineEnd, 10);

    const paramNames = initMethod.parameters.map((p) => p.name);
    assert.deepEqual(paramNames, ['self', 'import_name', 'static_url_path', 'instance_path']);
  });

  await t.test('parsePythonSource: parses top-level functions and multiline signatures', () => {
    const facts = parsePythonSource(SAMPLE_FLASK_CODE, 'src/flask/app.py');
    const createApp = facts.functions.find((f) => f.name === 'create_app');
    assert.ok(createApp);
    assert.equal(createApp.kind, 'function');
    assert.equal(createApp.className, undefined);

    const addUrlRule = facts.functions.find((f) => f.name === 'add_url_rule');
    assert.ok(addUrlRule);
    assert.equal(addUrlRule.lineStart, 14);
    assert.equal(addUrlRule.lineEnd, 21);
    assert.ok(addUrlRule.parameters.some((p) => p.name === 'provide_automatic_options'));
    assert.ok(addUrlRule.parameters.some((p) => p.name === 'options'));
  });

  await t.test('isNegativeClaim: identifies negative vs positive statements', () => {
    assert.equal(isNegativeClaim('Flask has no parameter named foo'), true);
    assert.equal(isNegativeClaim('Function does not accept keyword debug'), true);
    assert.equal(isNegativeClaim('Method missing argument validate'), true);
    assert.equal(isNegativeClaim('Function add_url_rule accepts rule string'), false);
    assert.equal(isNegativeClaim('Class Flask provides __init__'), false);
  });

  await t.test('verifyClaimAgainstSource: verifies supported claim with exact evidence', () => {
    const claim = {
      id: 'claim-1',
      original_text: 'add_url_rule accepts parameter provide_automatic_options',
      claim_type: 'parameter_existence',
    };

    const sourceFiles = [
      {
        filePath: 'src/flask/app.py',
        content: SAMPLE_FLASK_CODE,
        lineCount: 26,
        permalink: 'https://github.com/pallets/flask/blob/sha123/src/flask/app.py',
        sizeBytes: SAMPLE_FLASK_CODE.length,
      },
    ];

    const result = verifyClaimAgainstSource(claim, sourceFiles, 'pallets', 'flask', 'sha123');

    assert.equal(result.status, 'supported');
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].file_path, 'src/flask/app.py');
    assert.equal(result.evidence[0].line_start, 14);
    assert.equal(result.evidence[0].line_end, 21);
    assert.equal(result.evidence[0].relation, 'supporting');
    assert.match(result.evidence[0].source_url, /#L14-L21/);
  });

  await t.test('verifyClaimAgainstSource: contradicts false negative claim', () => {
    const claim = {
      id: 'claim-2',
      original_text: 'Flask.__init__ has no parameter named instance_path',
      claim_type: 'parameter_existence',
    };

    const sourceFiles = [
      {
        filePath: 'src/flask/app.py',
        content: SAMPLE_FLASK_CODE,
        lineCount: 26,
        permalink: 'https://github.com/pallets/flask/blob/sha123/src/flask/app.py',
        sizeBytes: SAMPLE_FLASK_CODE.length,
      },
    ];

    const result = verifyClaimAgainstSource(claim, sourceFiles, 'pallets', 'flask', 'sha123');

    assert.equal(result.status, 'contradicted');
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].relation, 'conflicting');
    assert.equal(result.evidence[0].line_start, 5);
    assert.equal(result.evidence[0].line_end, 10);
  });

  await t.test('verifyClaimAgainstSource: returns unverified when symbol is absent', () => {
    const claim = {
      id: 'claim-3',
      original_text: 'The server crashes when running on Windows 11',
      claim_type: 'runtime_behavior',
    };

    const sourceFiles = [
      {
        filePath: 'src/flask/app.py',
        content: SAMPLE_FLASK_CODE,
        lineCount: 26,
        permalink: 'https://github.com/pallets/flask/blob/sha123/src/flask/app.py',
        sizeBytes: SAMPLE_FLASK_CODE.length,
      },
    ];

    const result = verifyClaimAgainstSource(claim, sourceFiles, 'pallets', 'flask', 'sha123');

    assert.equal(result.status, 'unverified');
    assert.equal(result.evidence.length, 0);
    assert.match(result.confidenceRationale, /not deterministically matched/);
  });
});
