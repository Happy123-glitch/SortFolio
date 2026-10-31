import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnalyzePR } from '../supabase/functions/analyze-pr/index.ts';

// Mirroring the client-side parsing logic for testing
function parseGitHubInput(input) {
  if (!input) return null;
  const raw = input.trim();
  const prMatch = raw.match(/github\.com\/([\w.\-]+)\/([\w.\-]+?)\/(?:pull|pulls)\/(\d+)/i);
  if (prMatch) {
    return { repo: `${prMatch[1]}/${prMatch[2]}`, num: parseInt(prMatch[3], 10), type: 'pull', cleanUrl: `https://github.com/${prMatch[1]}/${prMatch[2]}` };
  }
  const issueMatch = raw.match(/github\.com\/([\w.\-]+)\/([\w.\-]+?)\/issues\/(\d+)/i);
  if (issueMatch) {
    return { repo: `${issueMatch[1]}/${issueMatch[2]}`, num: parseInt(issueMatch[3], 10), type: 'issue', cleanUrl: `https://github.com/${issueMatch[1]}/${issueMatch[2]}` };
  }
  const repoMatch = raw.match(/github\.com\/([\w.\-]+)\/([\w.\-]+?)(?:\.git)?(?:[\/#?].*)?$/i);
  if (repoMatch) {
    return { repo: `${repoMatch[1]}/${repoMatch[2]}`, num: null, type: null, cleanUrl: `https://github.com/${repoMatch[1]}/${repoMatch[2]}` };
  }
  const shortMatch = raw.match(/^([\w.\-]+)\/([\w.\-]+)$/i);
  if (shortMatch) {
    return { repo: `${shortMatch[1]}/${shortMatch[2]}`, num: null, type: null, cleanUrl: `https://github.com/${shortMatch[1]}/${shortMatch[2]}` };
  }
  return null;
}

function sortRepoItems(items, sortMode) {
  const copy = items.slice();
  switch (sortMode) {
    case 'number-desc':
      return copy.sort((a, b) => b.number - a.number);
    case 'number-asc':
      return copy.sort((a, b) => a.number - b.number);
    case 'date-desc':
      return copy.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    case 'state-open':
      return copy.sort((a, b) => {
        if (a.state === 'open' && b.state !== 'open') return -1;
        if (a.state !== 'open' && b.state === 'open') return 1;
        return b.number - a.number;
      });
    case 'title-asc':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return copy;
  }
}

test('Repository Pull Request & Issue Explorer with Sorting', async (t) => {
  await t.test('parseGitHubInput: parses full pull request URLs', () => {
    const res = parseGitHubInput('https://github.com/me-agrim-rehan/reachable-vulnerability/pull/1');
    assert.deepEqual(res, {
      repo: 'me-agrim-rehan/reachable-vulnerability',
      num: 1,
      type: 'pull',
      cleanUrl: 'https://github.com/me-agrim-rehan/reachable-vulnerability',
    });
  });

  await t.test('parseGitHubInput: parses full issue URLs', () => {
    const res = parseGitHubInput('https://github.com/pallets/flask/issues/5240');
    assert.deepEqual(res, {
      repo: 'pallets/flask',
      num: 5240,
      type: 'issue',
      cleanUrl: 'https://github.com/pallets/flask',
    });
  });

  await t.test('parseGitHubInput: parses bare repository URLs without number', () => {
    const res = parseGitHubInput('https://github.com/me-agrim-rehan/reachable-vulnerability');
    assert.deepEqual(res, {
      repo: 'me-agrim-rehan/reachable-vulnerability',
      num: null,
      type: null,
      cleanUrl: 'https://github.com/me-agrim-rehan/reachable-vulnerability',
    });
  });

  await t.test('parseGitHubInput: parses shorthand repo format', () => {
    const res = parseGitHubInput('psf/requests');
    assert.deepEqual(res, {
      repo: 'psf/requests',
      num: null,
      type: null,
      cleanUrl: 'https://github.com/psf/requests',
    });
  });

  await t.test('parseGitHubInput: returns null for invalid input', () => {
    assert.equal(parseGitHubInput('not a valid url'), null);
    assert.equal(parseGitHubInput(''), null);
  });

  await t.test('sortRepoItems: correctly sorts pull requests by number, date, state, title', () => {
    const mockPRs = [
      { number: 1, title: 'chore: setup project', state: 'closed', updatedAt: '2026-10-31T14:00:00Z' },
      { number: 42, title: 'fix: buffer overflow', state: 'open', updatedAt: '2026-10-31T18:00:00Z' },
      { number: 15, title: 'feat: add analyzer', state: 'merged', updatedAt: '2026-10-31T16:00:00Z' },
    ];

    // Number descending
    const byNumDesc = sortRepoItems(mockPRs, 'number-desc');
    assert.deepEqual(byNumDesc.map((x) => x.number), [42, 15, 1]);

    // Number ascending
    const byNumAsc = sortRepoItems(mockPRs, 'number-asc');
    assert.deepEqual(byNumAsc.map((x) => x.number), [1, 15, 42]);

    // Date descending
    const byDateDesc = sortRepoItems(mockPRs, 'date-desc');
    assert.deepEqual(byDateDesc.map((x) => x.number), [42, 15, 1]);

    // State: Open first
    const byState = sortRepoItems(mockPRs, 'state-open');
    assert.equal(byState[0].number, 42); // Open PR is first

    // Title alphabetical
    const byTitle = sortRepoItems(mockPRs, 'title-asc');
    assert.deepEqual(byTitle.map((x) => x.number), [1, 15, 42]);
  });

  await t.test('handleAnalyzePR: verifies PR #1 for reachable-vulnerability', async () => {
    const req = new Request('http://localhost/functions/v1/analyze-pr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: 'me-agrim-rehan/reachable-vulnerability',
        prNumber: 1,
      }),
    });
    const res = await handleAnalyzePR(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.run.repo_full_name, 'me-agrim-rehan/reachable-vulnerability');
    assert.equal(data.run.item_number, 1);
    assert.ok(Array.isArray(data.claims));
  });
});
