// ==============================================================================
// Supabase Edge Function: analyze-pr
// Secondary Workflow: Evidence-Based Triage for Pull Requests and Git Diffs
// ==============================================================================

import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseServiceClient } from '../_shared/supabase-client.ts';
import type {
  AnalysisRun,
  Claim,
  EvidenceItem,
  ModelRun,
  AnalyzeIssueResponse,
} from '../_shared/types.ts';
import {
  parseGitHubIssueRef,
  generateGitHubPermalink,
} from '../_shared/github.ts';
import {
  extractClaimsWithModel,
  explainEvidenceWithModel,
} from '../_shared/model-provider.ts';

export interface DiffFileChunk {
  filePath: string;
  patch: string;
  addedLines: number[];
}

/**
 * Parses unified git diff into individual file chunks and line numbers.
 */
export function parseGitDiff(rawDiff: string): DiffFileChunk[] {
  if (!rawDiff || !rawDiff.trim()) return [];

  const chunks: DiffFileChunk[] = [];
  const fileSections = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const fileMatch = section.match(/^a\/(.*?)\s+b\/(.*?)$/m);
    if (!fileMatch) continue;

    const filePath = fileMatch[2];
    const patchLines = section.split('\n');
    const addedLines: number[] = [];

    let currentLine = 1;
    for (const line of patchLines) {
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        currentLine = parseInt(hunkMatch[2], 10);
        continue;
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        addedLines.push(currentLine);
        currentLine++;
      } else if (!line.startsWith('-')) {
        currentLine++;
      }
    }

    chunks.push({
      filePath,
      patch: section,
      addedLines,
    });
  }

  return chunks;
}

/**
 * Main request handler for analyze-pr Edge Function.
 */
export async function handleAnalyzePR(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: { repo: string; prNumber: number };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON request payload.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { repo, prNumber } = body;
  if (!repo || !prNumber) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: "repo" and "prNumber".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let parsedRef;
  try {
    parsedRef = parseGitHubIssueRef(repo, prNumber);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const runId = crypto.randomUUID();
  const startTime = new Date().toISOString();

  const currentRun: AnalysisRun = {
    id: runId,
    repo_full_name: parsedRef.repoFullName,
    item_type: 'pull_request',
    item_number: parsedRef.itemNumber,
    status: 'analyzing',
    metadata: {},
    created_at: startTime,
  };

  const executedModelRuns: ModelRun[] = [];
  const processedClaims: Array<Claim & { evidence: EvidenceItem[] }> = [];

  try {
    const githubToken = typeof Deno !== 'undefined' && Deno.env ? Deno.env.get('GITHUB_TOKEN') : process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'User-Agent': 'Sortfolio-PR-Agent',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

    // 1. Fetch Pull Request metadata
    const prUrl = `https://api.github.com/repos/${parsedRef.owner}/${parsedRef.repo}/pulls/${parsedRef.itemNumber}`;
    const prRes = await fetch(prUrl, { headers });
    if (!prRes.ok) {
      throw new Error(`Unable to fetch PR #${parsedRef.itemNumber} (${prRes.status}).`);
    }

    const prData = await prRes.json();
    const headSha = prData.head?.sha || 'HEAD';
    currentRun.commit_sha = headSha;
    currentRun.metadata = {
      title: prData.title,
      author: prData.user?.login || 'unknown',
      htmlUrl: prData.html_url,
      headRef: prData.head?.ref,
      baseRef: prData.base?.ref,
    };

    // 2. Fetch Pull Request unified diff
    const diffRes = await fetch(prUrl, {
      headers: { ...headers, 'Accept': 'application/vnd.github.v3.diff' },
    });
    const rawDiff = diffRes.ok ? await diffRes.text() : '';
    const diffChunks = parseGitDiff(rawDiff);

    // 3. Extract claims from PR description using Qwen 2.5
    const extraction = await extractClaimsWithModel(prData.title, prData.body || '');
    executedModelRuns.push({
      id: crypto.randomUUID(),
      run_id: runId,
      ...extraction.modelRun,
      created_at: new Date().toISOString(),
    });

    // 4. Match claims against actual PR diff changes
    for (const rawClaim of extraction.claims) {
      const claimId = crypto.randomUUID();
      let status: 'supported' | 'contradicted' | 'unverified' = 'unverified';
      let rationale = 'The claimed changes could not be conclusively located in the PR diff.';
      let explanation = 'PR prose does not match modified file hunks.';
      const evidenceItems: EvidenceItem[] = [];

      // Check if any changed file in the PR touches the target symbol or claim text
      for (const chunk of diffChunks) {
        const symbolMatch = Boolean(rawClaim.targetSymbol && chunk.patch.includes(rawClaim.targetSymbol));
        const textMatch = chunk.patch.toLowerCase().includes(rawClaim.originalText.toLowerCase());
        const words = (rawClaim.originalText.match(/\b[a-zA-Z_][a-zA-Z0-9_]{3,}\b/g) || [])
          .filter((w) => !['this', 'adds', 'with', 'from', 'that', 'have', 'been', 'parameter', 'routing', 'method', 'function', 'class'].includes(w.toLowerCase()));
        const identifierMatch = words.some((w) => chunk.patch.includes(w));

        if (symbolMatch || textMatch || identifierMatch) {
          status = 'supported';
          const lineStart = chunk.addedLines[0] || 1;
          const lineEnd = chunk.addedLines[chunk.addedLines.length - 1] || lineStart;
          const sourceUrl = generateGitHubPermalink(parsedRef.owner, parsedRef.repo, headSha, chunk.filePath, lineStart, lineEnd);

          const snippet = chunk.patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).slice(0, 10).join('\n');

          const ev: EvidenceItem = {
            id: crypto.randomUUID(),
            claim_id: claimId,
            file_path: chunk.filePath,
            line_start: lineStart,
            line_end: lineEnd,
            snippet,
            source_url: sourceUrl,
            relation: 'supporting',
            created_at: new Date().toISOString(),
          };
          evidenceItems.push(ev);

          rationale = `PR diff modifies ${chunk.filePath} at lines ${lineStart}–${lineEnd} matching claimed changes.`;
          explanation = `Verified: The PR introduces modifications in ${chunk.filePath} corresponding to "${rawClaim.originalText}".`;
          break;
        }
      }

      // If evidence found, summarize with Qwen 2.5
      if (evidenceItems.length > 0) {
        const explainResult = await explainEvidenceWithModel(
          rawClaim.originalText,
          evidenceItems[0].snippet,
          evidenceItems[0].file_path,
          `lines ${evidenceItems[0].line_start}–${evidenceItems[0].line_end}`,
          status
        );
        explanation = explainResult.explanation;
        executedModelRuns.push({
          id: crypto.randomUUID(),
          run_id: runId,
          ...explainResult.modelRun,
          created_at: new Date().toISOString(),
        });
      }

      processedClaims.push({
        id: claimId,
        run_id: runId,
        original_text: rawClaim.originalText,
        claim_type: rawClaim.claimType,
        status,
        confidence_rationale: rationale,
        explanation,
        created_at: new Date().toISOString(),
        evidence: evidenceItems,
      });
    }

    currentRun.status = 'completed';
    currentRun.finished_at = new Date().toISOString();

    // 5. Persist to Supabase Database
    try {
      const supabase = getSupabaseServiceClient();
      await supabase.from('analysis_runs').insert(currentRun);
      for (const c of processedClaims) {
        await supabase.from('claims').insert({
          id: c.id,
          run_id: c.run_id,
          original_text: c.original_text,
          claim_type: c.claim_type,
          status: c.status,
          confidence_rationale: c.confidence_rationale,
          explanation: c.explanation,
          created_at: c.created_at,
        });
        for (const ev of c.evidence) {
          await supabase.from('evidence_items').insert(ev);
        }
      }
    } catch {
      // Continue returning in-memory results
    }

    const payload: AnalyzeIssueResponse = {
      run: currentRun,
      claims: processedClaims,
      modelRuns: executedModelRuns,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    currentRun.status = 'failed';
    currentRun.error_message = errorMsg;
    currentRun.finished_at = new Date().toISOString();

    return new Response(
      JSON.stringify({ error: errorMsg, run: currentRun }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(handleAnalyzePR);
}
