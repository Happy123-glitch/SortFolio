// ==============================================================================
// Sortfolio GitHub REST API Client & Safe Source Retriever
// ==============================================================================

export interface GitHubIssueRef {
  owner: string;
  repo: string;
  repoFullName: string;
  itemNumber: number;
  itemType: 'issue' | 'pull_request';
}

export interface GitHubIssueData {
  title: string;
  body: string;
  state: string;
  author: string;
  htmlUrl: string;
  labels: string[];
  isPullRequest: boolean;
  createdAt: string;
}

export interface PinnedRepoRef {
  defaultBranch: string;
  commitSha: string;
}

export interface SourceFileContent {
  filePath: string;
  content: string;
  lineCount: number;
  permalink: string;
  sizeBytes: number;
}

const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB safeguard against large file retrieval

/**
 * Retrieves environment variable safely across Deno and Node environments.
 */
function getEnv(key: string): string | undefined {
  if (typeof Deno !== 'undefined' && Deno.env) {
    return Deno.env.get(key);
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Parses user input into a standardized GitHub reference.
 * Supports:
 * - "owner/repo#123"
 * - "owner/repo", 123
 * - "https://github.com/owner/repo/issues/123"
 * - "https://github.com/owner/repo/pull/123"
 */
export function parseGitHubIssueRef(input: string, issueNum?: number): GitHubIssueRef {
  const trimmed = input.trim();

  // Full URL matching: https://github.com/:owner/:repo/(issues|pull)/:number
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/(issues|pull)\/(\d+)\/?$/
  );
  if (urlMatch) {
    const [, owner, repo, typeStr, numStr] = urlMatch;
    return {
      owner,
      repo,
      repoFullName: `${owner}/${repo}`,
      itemNumber: parseInt(numStr, 10),
      itemType: typeStr === 'pull' ? 'pull_request' : 'issue',
    };
  }

  // Shorthand with hash: "owner/repo#123"
  const hashMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)$/);
  if (hashMatch) {
    const [, owner, repo, numStr] = hashMatch;
    return {
      owner,
      repo,
      repoFullName: `${owner}/${repo}`,
      itemNumber: parseInt(numStr, 10),
      itemType: 'issue',
    };
  }

  // Repository path with separate issue number argument
  const repoMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (repoMatch && issueNum && !isNaN(issueNum) && issueNum > 0) {
    const [, owner, repo] = repoMatch;
    return {
      owner,
      repo,
      repoFullName: `${owner}/${repo}`,
      itemNumber: Math.floor(issueNum),
      itemType: 'issue',
    };
  }

  throw new Error(
    `Invalid GitHub reference: "${input}". Please provide "owner/repo" with an issue number or a full GitHub issue URL.`
  );
}

/**
 * Constructs standard headers for GitHub API requests.
 */
function getGitHubHeaders(token?: string): Record<string, string> {
  const authToken = token || getEnv('GITHUB_TOKEN');
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Sortfolio-Triage-Agent (Hacktoberfest-Problem-02)',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return headers;
}

/**
 * Fetches issue or pull request metadata from the GitHub REST API.
 */
export async function fetchGitHubIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  token?: string
): Promise<GitHubIssueData> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`;
  const response = await fetch(url, {
    headers: getGitHubHeaders(token),
  });

  if (response.status === 404) {
    throw new Error(`GitHub issue #${issueNumber} not found in ${owner}/${repo}.`);
  }
  if (response.status === 403) {
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    if (rateLimitRemaining === '0') {
      throw new Error(
        'GitHub API rate limit exceeded. Please provide a GITHUB_TOKEN in environment secrets to continue.'
      );
    }
    throw new Error('Access to GitHub repository forbidden (403).');
  }
  if (!response.ok) {
    throw new Error(`GitHub API error (${response.status}): ${response.statusText}`);
  }

  const data = await response.json();
  const labels = Array.isArray(data.labels)
    ? data.labels.map((l: { name?: string } | string) => (typeof l === 'string' ? l : l.name || ''))
    : [];

  return {
    title: data.title || '',
    body: data.body || '',
    state: data.state || 'open',
    author: data.user?.login || 'unknown',
    htmlUrl: data.html_url || '',
    labels: labels.filter(Boolean),
    isPullRequest: Boolean(data.pull_request),
    createdAt: data.created_at || new Date().toISOString(),
  };
}

/**
 * Retrieves the repository default branch and pins the exact HEAD commit SHA.
 */
export async function fetchRepoPinnedRef(
  owner: string,
  repo: string,
  token?: string
): Promise<PinnedRepoRef> {
  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const repoRes = await fetch(repoUrl, {
    headers: getGitHubHeaders(token),
  });

  if (!repoRes.ok) {
    throw new Error(`Unable to fetch repository metadata for ${owner}/${repo} (${repoRes.status}).`);
  }

  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch || 'main';

  // Fetch the latest commit on the default branch to pin the analysis
  const branchUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(defaultBranch)}`;
  const branchRes = await fetch(branchUrl, {
    headers: getGitHubHeaders(token),
  });

  if (!branchRes.ok) {
    throw new Error(`Unable to retrieve HEAD commit for ${owner}/${repo}@${defaultBranch}.`);
  }

  const branchData = await branchRes.json();
  const commitSha = branchData.sha;

  return {
    defaultBranch,
    commitSha,
  };
}

/**
 * Scans issue description and prose for candidate source file paths (e.g. .py, .md).
 */
export function extractCandidateFilePaths(prose: string): string[] {
  if (!prose) return [];

  const candidates = new Set<string>();

  // 1. Match file paths enclosed in backticks: `path/to/file.py`
  const backtickRegex = /`([^`\n\r\t]+\.(?:py|md|txt|json|toml|yaml|yml))`/gi;
  let match: RegExpExecArray | null;
  while ((match = backtickRegex.exec(prose)) !== null) {
    const cleaned = sanitizeFilePath(match[1]);
    if (cleaned) candidates.add(cleaned);
  }

  // 2. Match standalone file paths or filenames preceded by whitespace/punctuation
  const pathRegex = /(?:^|[\s("'])((?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(?:py|md|txt|json|toml|yaml|yml))(?=[\s)"',:;!?]|$)/gi;
  while ((match = pathRegex.exec(prose)) !== null) {
    const cleaned = sanitizeFilePath(match[1]);
    if (cleaned) candidates.add(cleaned);
  }

  return Array.from(candidates);
}

/**
 * Validates and sanitizes file path to prevent traversal or malicious access.
 */
function sanitizeFilePath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  // Strictly disallow path traversal, absolute paths, or protocol prefixes
  if (
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    trimmed.includes(':') ||
    trimmed.startsWith('~')
  ) {
    return null;
  }

  // Normalize leading ./
  const normalized = trimmed.replace(/^\.\//, '');
  if (!normalized || normalized.includes('..')) {
    return null;
  }

  return normalized;
}

/**
 * Generates canonical GitHub permalink with exact line number anchors.
 */
export function generateGitHubPermalink(
  owner: string,
  repo: string,
  commitSha: string,
  filePath: string,
  lineStart?: number,
  lineEnd?: number
): string {
  const base = `https://github.com/${owner}/${repo}/blob/${commitSha}/${filePath}`;
  if (!lineStart) return base;
  if (!lineEnd || lineStart === lineEnd) {
    return `${base}#L${lineStart}`;
  }
  return `${base}#L${lineStart}-L${lineEnd}`;
}

/**
 * Safely fetches raw file content from the pinned GitHub commit ref.
 * Guarantees memory limits and zero code execution.
 */
export async function fetchSourceFile(
  owner: string,
  repo: string,
  commitSha: string,
  filePath: string,
  token?: string
): Promise<SourceFileContent> {
  const cleanPath = sanitizeFilePath(filePath);
  if (!cleanPath) {
    throw new Error(`Invalid or unsafe file path: "${filePath}"`);
  }

  // Use GitHub raw endpoint pinned to the immutable commit SHA
  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(commitSha)}/${cleanPath}`;
  const response = await fetch(rawUrl, {
    headers: getGitHubHeaders(token),
  });

  if (response.status === 404) {
    throw new Error(`File "${cleanPath}" was not found in ${owner}/${repo}@${commitSha.substring(0, 7)}.`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch file content (${response.status}): ${response.statusText}`);
  }

  const content = await response.text();
  const sizeBytes = new TextEncoder().encode(content).length;

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File "${cleanPath}" exceeds size limit of ${MAX_FILE_SIZE_BYTES / 1024}KB (actual: ${Math.round(sizeBytes / 1024)}KB).`
    );
  }

  const lines = content.split('\n');
  const permalink = generateGitHubPermalink(owner, repo, commitSha, cleanPath);

  return {
    filePath: cleanPath,
    content,
    lineCount: lines.length,
    permalink,
    sizeBytes,
  };
}
