import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGitHubIssueRef,
  extractCandidateFilePaths,
  generateGitHubPermalink,
  fetchGitHubIssue,
  fetchRepoPinnedRef,
  fetchSourceFile,
} from '../supabase/functions/_shared/github.ts';

test('Phase 2: GitHub API Integration & Safe Source Retrieval', async (t) => {
  await t.test('parseGitHubIssueRef: parses full issue URL', () => {
    const ref = parseGitHubIssueRef('https://github.com/pallets/flask/issues/100');
    assert.deepEqual(ref, {
      owner: 'pallets',
      repo: 'flask',
      repoFullName: 'pallets/flask',
      itemNumber: 100,
      itemType: 'issue',
    });
  });

  await t.test('parseGitHubIssueRef: parses pull request URL', () => {
    const ref = parseGitHubIssueRef('https://github.com/django/django/pull/5432');
    assert.deepEqual(ref, {
      owner: 'django',
      repo: 'django',
      repoFullName: 'django/django',
      itemNumber: 5432,
      itemType: 'pull_request',
    });
  });

  await t.test('parseGitHubIssueRef: parses shorthand hash reference', () => {
    const ref = parseGitHubIssueRef('psf/requests#42');
    assert.deepEqual(ref, {
      owner: 'psf',
      repo: 'requests',
      repoFullName: 'psf/requests',
      itemNumber: 42,
      itemType: 'issue',
    });
  });

  await t.test('parseGitHubIssueRef: parses repo path with separate issue number', () => {
    const ref = parseGitHubIssueRef('fastapi/fastapi', 200);
    assert.deepEqual(ref, {
      owner: 'fastapi',
      repo: 'fastapi',
      repoFullName: 'fastapi/fastapi',
      itemNumber: 200,
      itemType: 'issue',
    });
  });

  await t.test('parseGitHubIssueRef: rejects invalid reference', () => {
    assert.throws(() => parseGitHubIssueRef('not-a-valid-repo'), /Invalid GitHub reference/);
  });

  await t.test('extractCandidateFilePaths: detects filenames in backticks and prose', () => {
    const prose = `
      There is a regression in \`src/flask/app.py\` when initializing the server.
      Also check \`README.md\` and \`config.toml\`.
      The traceback points to helpers.py around line 35.
      Ignore random words like python.org.
    `;
    const paths = extractCandidateFilePaths(prose);
    assert.ok(paths.includes('src/flask/app.py'));
    assert.ok(paths.includes('README.md'));
    assert.ok(paths.includes('config.toml'));
    assert.ok(paths.includes('helpers.py'));
  });

  await t.test('extractCandidateFilePaths: prevents path traversal security risks', () => {
    const malicious = 'File at `../../../etc/passwd` or `/root/secret.py`';
    const paths = extractCandidateFilePaths(malicious);
    assert.equal(paths.length, 0, 'Must reject path traversal patterns');
  });

  await t.test('generateGitHubPermalink: produces correct canonical line anchors', () => {
    const linkRange = generateGitHubPermalink('pallets', 'flask', 'abcdef123', 'src/flask/app.py', 10, 25);
    assert.equal(linkRange, 'https://github.com/pallets/flask/blob/abcdef123/src/flask/app.py#L10-L25');

    const linkSingle = generateGitHubPermalink('pallets', 'flask', 'abcdef123', 'src/flask/app.py', 50, 50);
    assert.equal(linkSingle, 'https://github.com/pallets/flask/blob/abcdef123/src/flask/app.py#L50');

    const linkBase = generateGitHubPermalink('pallets', 'flask', 'abcdef123', 'src/flask/app.py');
    assert.equal(linkBase, 'https://github.com/pallets/flask/blob/abcdef123/src/flask/app.py');
  });

  await t.test('fetchGitHubIssue: correctly maps issue fields', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        if (url.toString().includes('issues/42')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              title: 'Bug in Flask request handling',
              body: 'Reproduce by calling app.route with invalid method',
              state: 'open',
              user: { login: 'octocat' },
              html_url: 'https://github.com/pallets/flask/issues/42',
              labels: [{ name: 'bug' }, { name: 'triage' }],
              pull_request: null,
              created_at: '2026-10-31T12:00:00Z',
            }),
          };
        }
        return { ok: false, status: 404 };
      };

      const issue = await fetchGitHubIssue('pallets', 'flask', 42);
      assert.equal(issue.title, 'Bug in Flask request handling');
      assert.equal(issue.author, 'octocat');
      assert.deepEqual(issue.labels, ['bug', 'triage']);
      assert.equal(issue.isPullRequest, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('fetchGitHubIssue: handles 404 error cleanly', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: false,
        status: 404,
        headers: new Headers(),
      });

      await assert.rejects(
        () => fetchGitHubIssue('nonexistent', 'repo', 999),
        /GitHub issue #999 not found in nonexistent\/repo/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('fetchRepoPinnedRef: pins default branch and commit SHA', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        const u = url.toString();
        if (u.endsWith('/commits/main')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ sha: 'a1b2c3d4e5f67890' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ default_branch: 'main' }),
        };
      };

      const pinned = await fetchRepoPinnedRef('pallets', 'flask');
      assert.equal(pinned.defaultBranch, 'main');
      assert.equal(pinned.commitSha, 'a1b2c3d4e5f67890');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('fetchSourceFile: fetches file and calculates line count', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => 'def hello():\n    return "world"\n',
      });

      const file = await fetchSourceFile('pallets', 'flask', 'a1b2c3d4', 'src/flask/app.py');
      assert.equal(file.filePath, 'src/flask/app.py');
      assert.equal(file.lineCount, 3);
      assert.match(file.content, /def hello\(\):/);
      assert.equal(file.permalink, 'https://github.com/pallets/flask/blob/a1b2c3d4/src/flask/app.py');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
