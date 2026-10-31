import test from "node:test";
import assert from "node:assert/strict";
import "../js/github-merge.js";

const SortfolioGitHubMerge = globalThis.SortfolioGitHubMerge;

test("GitHub Merge: validateTokenWithGitHub successfully identifies valid token & scopes", async () => {
  const mockFetch = async (url, opts) => {
    assert.match(url, /api\.github\.com\/user/);
    assert.equal(opts.headers.Authorization, "token ghp_mock_valid_key");
    return {
      status: 200,
      ok: true,
      headers: {
        get: (h) => (h === "x-oauth-scopes" ? "repo, read:user" : "")
      },
      json: async () => ({ login: "maintainer-alice", name: "Alice Maintainer", avatar_url: "https://example.com/avatar.png" })
    };
  };

  const result = await SortfolioGitHubMerge.validateTokenWithGitHub("ghp_mock_valid_key", mockFetch);
  assert.equal(result.valid, true);
  assert.equal(result.user, "maintainer-alice");
  assert.equal(result.hasRepoScope, true);
  assert.ok(result.scopes.includes("repo"));
});

test("GitHub Merge: validateTokenWithGitHub rejects empty or invalid token", async () => {
  await assert.rejects(
    () => SortfolioGitHubMerge.validateTokenWithGitHub(""),
    /Please provide a valid GitHub Personal Access Token/
  );

  const mockFailFetch = async () => ({
    status: 401,
    ok: false,
    headers: { get: () => "" },
    json: async () => ({ message: "Bad credentials" })
  });

  await assert.rejects(
    () => SortfolioGitHubMerge.validateTokenWithGitHub("ghp_invalid_token", mockFailFetch),
    /Invalid GitHub token/
  );
});

test("GitHub Merge: generateMergeAuditDoc creates comprehensive in-repository documentation", () => {
  const prItem = {
    number: 42,
    title: "feat: Update query handler signature and AST schema bindings",
    author: "core-dev",
    html_url: "https://github.com/org/repo/pull/42"
  };
  const diag = {
    aiSummary: "Updates query parsing parameters to enforce strict type checking.",
    statusBadge: "Verified ✓",
    issues: [
      {
        title: "Signature Mismatch",
        severity: "medium",
        description: "Old signature lacked typing annotations.",
        solutionGuide: "Annotated signature with type hints."
      }
    ]
  };
  const claims = [
    { text: "Handler accepts optional filters", status: "Supported", evidence: { path: "src/query.py" } },
    { text: "Legacy parameters are deprecated", status: "Supported", evidence: { path: "src/query.py" } }
  ];

  const doc = SortfolioGitHubMerge.generateMergeAuditDoc("org/repo", prItem, diag, claims, {
    mergedBy: "lead-maintainer",
    customRationale: "Verified via AST analysis; all 2 claims supported with zero contradictions."
  });

  assert.ok(doc.includes("# SortFolio Merge Audit: PR #42 — feat: Update query handler signature and AST schema bindings"));
  assert.ok(doc.includes("## 2. Why This Pull Request Was Merged"));
  assert.ok(doc.includes("Verified via AST analysis"));
  assert.ok(doc.includes("## 3. Technical Claims & Authoritative Grounding"));
  assert.ok(doc.includes("| Handler accepts optional filters | **Supported** | `src/query.py` | ✔ Verified by AST |"));
  assert.ok(doc.includes("## 4. Issues Addressed & Resolved"));
  assert.ok(doc.includes("Issue 1: Signature Mismatch `[MEDIUM]`"));
  assert.ok(doc.includes("## 5. Open-Source AI Model & Governance Disclosure"));
  assert.ok(doc.includes("Models used in project: Qwen 2.5 7B (Open-weight)"));
});

test("GitHub Merge: generateMergeCommitMessage produces compliant commit title & body", () => {
  const prItem = {
    number: 104,
    title: "refactor: Clean up AST parser utilities",
    head: { ref: "patch-ast-cleanup" }
  };
  const diag = { aiSummary: "Refactors AST traversal to reduce cycle count." };
  const claims = [{ text: "Valid syntax", status: "Supported" }];

  const res = SortfolioGitHubMerge.generateMergeCommitMessage("org/repo", prItem, diag, claims, {
    customRationale: "Clean static analysis pass; no AST contradictions."
  });

  assert.equal(res.commitTitle, "Merge pull request #104 from patch-ast-cleanup (Verified by SortFolio)");
  assert.ok(res.commitMessage.includes("Rationale for merge:"));
  assert.ok(res.commitMessage.includes("Clean static analysis pass; no AST contradictions."));
  assert.ok(res.commitMessage.includes("Coding agent: Antigravity"));
  assert.ok(res.commitMessage.includes("Models used in project: Qwen 2.5 7B"));
});

test("GitHub Merge: commitMergeAuditDocToRepo correctly formats GitHub Contents API PUT payload", async () => {
  let capturedEndpoint = "";
  let capturedPayload = null;

  const mockFetch = async (url, opts) => {
    if (opts.method === "PUT") {
      capturedEndpoint = url;
      capturedPayload = JSON.parse(opts.body);
      return {
        status: 201,
        ok: true,
        json: async () => ({
          content: { html_url: "https://github.com/org/repo/blob/main/docs/triage/PR-42-MERGE-AUDIT.md" },
          commit: { sha: "abc123sha" }
        })
      };
    }
    // GET check file
    return { status: 404, ok: false };
  };

  const docContent = "# Test Audit Documentation";
  const result = await SortfolioGitHubMerge.commitMergeAuditDocToRepo(
    "org/repo",
    42,
    docContent,
    "ghp_valid_token",
    { branch: "main" },
    mockFetch
  );

  assert.equal(result.success, true);
  assert.equal(result.path, "docs/triage/PR-42-MERGE-AUDIT.md");
  assert.ok(capturedEndpoint.includes("/repos/org/repo/contents/docs/triage/PR-42-MERGE-AUDIT.md"));
  assert.ok(capturedPayload.message.includes("docs: add SortFolio merge audit rationale for PR #42"));
  assert.ok(capturedPayload.content.length > 0);
  assert.equal(capturedPayload.branch, "main");
});

test("GitHub Merge: executeOfficialMerge calls merge endpoint with rationale and returns merge sha", async () => {
  let putMergeEndpoint = "";
  let putMergePayload = null;
  let postedComment = null;

  const mockFetch = async (url, opts) => {
    if (url.includes("/comments") && opts.method === "POST") {
      postedComment = JSON.parse(opts.body);
      return { status: 201, ok: true, json: async () => ({ id: 999, html_url: "https://github.com/org/repo/issues/1#issuecomment-999" }) };
    }
    if (url.includes("/contents/") && opts.method === "PUT") {
      return { status: 201, ok: true, json: async () => ({ content: { html_url: "https://github.com/org/repo/blob/main/docs/triage/PR-1-MERGE-AUDIT.md" } }) };
    }
    if (url.includes("/merge") && opts.method === "PUT") {
      putMergeEndpoint = url;
      putMergePayload = JSON.parse(opts.body);
      return {
        status: 200,
        ok: true,
        json: async () => ({ sha: "6d8c9f0e1a", merged: true, message: "Pull Request successfully merged" })
      };
    }
    return { status: 404, ok: false };
  };

  const options = {
    mergeMethod: "squash",
    commitTitle: "Merge PR #1 into main via SortFolio",
    commitMessage: "Full AST verification report.\n\nModels used: Qwen 2.5 7B",
    customRationale: "All checks green",
    createDocs: true,
    docContent: "# Docs content",
    postComment: true
  };

  const result = await SortfolioGitHubMerge.executeOfficialMerge("org/repo", 1, "ghp_valid_token", options, mockFetch);

  assert.equal(result.merged, true);
  assert.equal(result.sha, "6d8c9f0e1a");
  assert.ok(putMergeEndpoint.endsWith("/repos/org/repo/pulls/1/merge"));
  assert.equal(putMergePayload.merge_method, "squash");
  assert.equal(putMergePayload.commit_title, "Merge PR #1 into main via SortFolio");
  assert.ok(postedComment.body.includes("Merged Officially via SortFolio"));
});

test("GitHub Merge: executeOfficialMerge throws descriptive error on merge conflicts (405)", async () => {
  const mockConflictFetch = async (url) => {
    if (url.includes("/merge")) {
      return {
        status: 405,
        ok: false,
        json: async () => ({ message: "Pull Request is not mergeable" })
      };
    }
    return { status: 200, ok: true, json: async () => ({}) };
  };

  await assert.rejects(
    () => SortfolioGitHubMerge.executeOfficialMerge("org/repo", 2, "ghp_valid_token", { createDocs: false, postComment: false }, mockConflictFetch),
    /cannot be merged\. It may have unresolved merge conflicts/
  );
});
