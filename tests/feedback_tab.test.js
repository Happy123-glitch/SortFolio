import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/feedback.js';

const {
  CATEGORIES,
  DEFAULT_FEEDBACK,
  getRatingLabel,
  loadFeedback,
  saveFeedback,
  validateFeedback,
  addFeedback,
  toggleUpvote,
} = globalThis.SortfolioFeedback;

// In-memory mock storage
function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

test('Feedback & Improvements: Categories and labels are defined', () => {
  assert.ok(CATEGORIES.evidence);
  assert.ok(CATEGORIES.verdict);
  assert.ok(CATEGORIES.model);
  assert.ok(CATEGORIES.diff);
  assert.equal(CATEGORIES.evidence.label, 'Evidence Accuracy');
  assert.equal(getRatingLabel(5), '5 / 5 - Highly Accurate');
  assert.equal(getRatingLabel(1), '1 / 5 - Discrepancy Found');
});

test('Feedback & Improvements: Loads default items when storage is empty', () => {
  const storage = createMockStorage();
  const items = loadFeedback(storage);
  assert.ok(Array.isArray(items));
  assert.equal(items.length, DEFAULT_FEEDBACK.length);
  assert.equal(items[0].id, 'fb-1');
});

test('Feedback & Improvements: Validates input fields and character lengths', () => {
  const tooShort = validateFeedback({ text: 'abc' });
  assert.equal(tooShort.valid, false);
  assert.match(tooShort.error, /at least 5 characters/i);

  const empty = validateFeedback({ text: '   ' });
  assert.equal(empty.valid, false);

  const valid = validateFeedback({ text: 'The AST parser should inspect class decorators.' });
  assert.equal(valid.valid, true);

  const tooLong = validateFeedback({ text: 'a'.repeat(501) });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.error, /500 characters or fewer/i);
});

test('Feedback & Improvements: Submits new feedback and prepends to backlog', () => {
  const storage = createMockStorage();
  const newItem = addFeedback(storage, {
    category: 'evidence',
    target: 'tiangolo/fastapi #9820',
    rating: 4,
    text: 'Need to support async router dependencies in AST analysis.',
    suggestion: 'fastapi/routing.py line 22',
    author: '@pythonista',
  });

  assert.ok(newItem.id.startsWith('fb-'));
  assert.equal(newItem.category, 'evidence');
  assert.equal(newItem.rating, 4);
  assert.equal(newItem.author, '@pythonista');
  assert.equal(newItem.status, 'Under Review');
  assert.equal(newItem.upvotes, 1);
  assert.equal(newItem.upvoted, true);

  const updatedList = loadFeedback(storage);
  assert.equal(updatedList[0].id, newItem.id);
  assert.equal(updatedList[0].target, 'tiangolo/fastapi #9820');
});

test('Feedback & Improvements: Toggles upvote counter accurately', () => {
  const storage = createMockStorage();
  // Default fb-1 has upvotes = 14, upvoted = false
  const upvoted = toggleUpvote(storage, 'fb-1');
  assert.equal(upvoted.upvotes, 15);
  assert.equal(upvoted.upvoted, true);

  // Toggle again to remove upvote
  const toggledOff = toggleUpvote(storage, 'fb-1');
  assert.equal(toggledOff.upvotes, 14);
  assert.equal(toggledOff.upvoted, false);
});
