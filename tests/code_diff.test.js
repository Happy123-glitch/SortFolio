import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/code-diff.js';

const { buildDiff, createPatch, suggestFixes, applySuggestion, applySuggestions, generateCorrections } = globalThis.SortfolioDiff;

test('code comparison diff aligns unchanged, removed, and added lines', () => {
  const diff = buildDiff('start\nold value\nend', 'start\nnew value\nend');

  assert.deepEqual(diff.rows.map((row) => row.type), ['unchanged', 'removed', 'added', 'unchanged']);
  assert.deepEqual(diff.rows[1], { type: 'removed', beforeNo: 2, afterNo: null, text: 'old value' });
  assert.deepEqual(diff.rows[2], { type: 'added', beforeNo: null, afterNo: 2, text: 'new value' });
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.equal(diff.unchanged, 2);
});

test('code comparison normalizes CRLF and ignores a final newline difference', () => {
  const diff = buildDiff('first\r\nsecond\r\n', 'first\nsecond');

  assert.equal(diff.rows.length, 2);
  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
});

test('code comparison exports a unified patch with file and hunk headers', () => {
  const patch = createPatch('before', 'after');

  assert.match(patch, /^diff --git a\/before b\/after/m);
  assert.match(patch, /^--- a\/before$/m);
  assert.match(patch, /^\+\+\+ b\/after$/m);
  assert.match(patch, /^@@ -1,1 \+1,1 @@$/m);
  assert.match(patch, /^-before$/m);
  assert.match(patch, /^\+after$/m);
});

test('code comparison bounds memory for large inputs and reports simplified diff', () => {
  const before = Array.from({ length: 600 }, (_, index) => `old-${index}`).join('\n');
  const after = Array.from({ length: 600 }, (_, index) => `new-${index}`).join('\n');
  const diff = buildDiff(before, after);

  assert.equal(diff.simplified, true);
  assert.equal(diff.removed, 600);
  assert.equal(diff.added, 600);
});

test('fix suggestions are limited to added JavaScript lines and avoid null checks', () => {
  const diff = buildDiff(
    'if (value == null) return;\nconst oldValue = 1;',
    'if (value == null) return;\nif (left == right) return true;\nconst nextValue = 2;'
  );
  const suggestions = suggestFixes(diff.rows, 'javascript');

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].kind, 'strict-equality');
  assert.equal(suggestions[0].before, 'if (left == right) return true;');
  assert.equal(suggestions[0].after, 'if (left === right) return true;');
  assert.equal(suggestFixes(diff.rows, 'other').length, 0);
});

test('fix preview applies a selected strict-equality suggestion without changing other lines', () => {
  const after = 'const keep = true;\nif (left == right) return true;\n';
  const diff = buildDiff('const keep = true;', after);
  const [suggestion] = suggestFixes(diff.rows, 'javascript');

  assert.equal(applySuggestion(after, suggestion), 'const keep = true;\nif (left === right) return true;\n');
  assert.equal(applySuggestion('different code', suggestion), null);
});

test('fix preview preserves CRLF line endings', () => {
  const after = 'const keep = true;\r\nif (left == right) return true;\r\n';
  const diff = buildDiff('const keep = true;', after);
  const [suggestion] = suggestFixes(diff.rows, 'javascript');

  assert.equal(applySuggestion(after, suggestion), 'const keep = true;\r\nif (left === right) return true;\r\n');
});

test('fix preview can remove an added console log line', () => {
  const after = 'const value = 1;\nconsole.log(value);\nreturn value;';
  const diff = buildDiff('const value = 1;\nreturn value;', after);
  const [suggestion] = suggestFixes(diff.rows, 'javascript');

  assert.equal(suggestion.kind, 'remove-debug-log');
  assert.equal(applySuggestion(after, suggestion), 'const value = 1;\nreturn value;');
});

test('auto-correction generates a corrected copy from Before without changing the source', () => {
  const before = 'if (left == right) return true;\nconsole.log(left);\nreturn false;';
  const result = generateCorrections(before, 'javascript');

  assert.equal(before, 'if (left == right) return true;\nconsole.log(left);\nreturn false;');
  assert.equal(result.text, 'if (left === right) return true;\nreturn false;');
  assert.equal(result.applied, 2);
  assert.equal(result.suggestions.length, 2);
});

test('auto-correction copies unchanged source when no supported fix applies', () => {
  const source = 'if (value == null) return;\nconst ready = value !== undefined;';
  const result = generateCorrections(source, 'javascript');

  assert.equal(result.text, source);
  assert.equal(result.applied, 0);
  assert.deepEqual(result.suggestions, []);
});

test('auto-correction is disabled for unsupported language and batch edits preserve CRLF', () => {
  const source = 'if (left == right) return true;\r\nconsole.log(left);\r\n';
  const result = generateCorrections(source, 'typescript');

  assert.equal(result.text, 'if (left === right) return true;\r\n');
  assert.equal(result.applied, 2);
  assert.equal(generateCorrections(source, 'other').applied, 0);
  assert.equal(applySuggestions(source, []).text, source);
});
