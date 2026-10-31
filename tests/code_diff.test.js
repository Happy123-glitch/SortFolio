import test from 'node:test';
import assert from 'node:assert/strict';
import '../.agents/frontend/js/code-diff.js';

const { buildDiff, createPatch } = globalThis.SortfolioDiff;

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
