import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/ai-diagnostic.js';

const { summarizePR, detectIssuesAndSolutions, generatePRDiagnosis } = globalThis.SortfolioAIDiagnostic;

test('AI Diagnostic: summarizePR produces meaningful summaries based on title and files', () => {
  const summary1 = summarizePR('pallets/flask', { title: 'feat: add automatic options parameter' }, [{ filePath: 'src/flask/app.py' }]);
  assert.match(summary1, /implements new capabilities/i);
  assert.match(summary1, /src\/flask\/app.py/);

  const summary2 = summarizePR('me-agrim-rehan/reachable-vulnerability', { title: 'chore: establish project foundation' }, [{ filePath: 'README.md' }]);
  assert.match(summary2, /project foundation/i);
});

test('AI Diagnostic: detects reachable-vulnerability risks and generates sanitization code patch', () => {
  const issues = detectIssuesAndSolutions('me-agrim-rehan/reachable-vulnerability', { number: 1, title: 'setup scanner execution' }, [{ filePath: 'src/scanner.py' }], []);
  assert.ok(issues.length > 0);
  assert.equal(issues[0].canBeSolved, true);
  assert.match(issues[0].title, /Reachable Vulnerability/i);
  assert.match(issues[0].solutionGuide, /sanitization/i);
  assert.ok(issues[0].proposedPatch);
  assert.match(issues[0].proposedPatch.unifiedDiff, /shlex\.quote/);
});

test('AI Diagnostic: detects contradicted claims and drafts signature fix patch', () => {
  const claims = [{
    text: 'Flask.__init__ has no parameter instance_path',
    status: 'Contradicted',
    where: 'Contradicted by src/flask/app.py • Lines 5–10',
    evidence: { path: 'src/flask/app.py' },
  }];
  const issues = detectIssuesAndSolutions('pallets/flask', { number: 4912, title: 'remove parameter' }, [{ filePath: 'src/flask/app.py' }], claims);
  assert.ok(issues.some((i) => i.title.includes('Contradiction')));
  const contraIssue = issues.find((i) => i.title.includes('Contradiction'));
  assert.equal(contraIssue.canBeSolved, true);
  assert.match(contraIssue.solutionGuide, /method signature/i);
  assert.ok(contraIssue.proposedPatch.unifiedDiff.includes('provide_automatic_options'));
});

test('AI Diagnostic: detects missing test files when source files are modified', () => {
  const issues = detectIssuesAndSolutions('org/repo', { number: 5, title: 'update core logic' }, [{ filePath: 'src/engine.py' }], []);
  assert.ok(issues.some((i) => i.id === 'issue-test-1'));
  const testIssue = issues.find((i) => i.id === 'issue-test-1');
  assert.match(testIssue.title, /Missing Automated Regression Tests/i);
  assert.ok(testIssue.proposedPatch.filePath.includes('test_pr_5.py'));
});

test('AI Diagnostic: generatePRDiagnosis returns complete diagnosis payload', () => {
  const diagnosis = generatePRDiagnosis(
    'pallets/flask',
    { number: 100, title: 'Add provide_automatic_options to routing', author: 'dev' },
    [{ filePath: 'src/flask/app.py' }, { filePath: 'tests/test_routing.py' }],
    [{ text: 'adds parameter', status: 'Supported' }]
  );

  assert.equal(diagnosis.prNumber, 100);
  assert.equal(diagnosis.repo, 'pallets/flask');
  assert.equal(diagnosis.overallStatus, 'verified');
  assert.equal(diagnosis.statusBadge, 'Verified ✓');
  assert.equal(diagnosis.hasErrors, false);
  assert.ok(diagnosis.aiSummary);
});
