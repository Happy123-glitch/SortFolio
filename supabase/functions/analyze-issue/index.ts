// ==============================================================================
// Supabase Edge Function: analyze-issue
// Orchestrates end-to-end evidence-based triage for GitHub issues
// ==============================================================================

import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseServiceClient } from '../_shared/supabase-client.ts';
import type {
  AnalysisRun,
  Claim,
  EvidenceItem,
  ModelRun,
  AnalyzeIssueRequest,
  AnalyzeIssueResponse,
} from '../_shared/types.ts';
import {
  parseGitHubIssueRef,
  fetchGitHubIssue,
  fetchRepoPinnedRef,
  extractCandidateFilePaths,
  fetchSourceFile,
  type SourceFileContent,
} from '../_shared/github.ts';
import {
  verifyClaimAgainstSource,
  type VerificationResult,
} from '../_shared/analyzer.ts';
import {
  extractClaimsWithModel,
  explainEvidenceWithModel,
} from '../_shared/model-provider.ts';

/**
 * Main request handler for the analyze-issue Edge Function.
 */
export async function handleAnalyzeIssue(req: Request): Promise<Response> {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: AnalyzeIssueRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON request payload.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { repo, issueNumber } = body;
  if (!repo || !issueNumber) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: "repo" (e.g. owner/name) and "issueNumber".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Parse & sanitize GitHub reference
  let parsedRef;
  try {
    parsedRef = parseGitHubIssueRef(repo, issueNumber);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const runId = crypto.randomUUID();
  const startTime = new Date().toISOString();

  // Create initial run record
  let currentRun: AnalysisRun = {
    id: runId,
    repo_full_name: parsedRef.repoFullName,
    item_type: parsedRef.itemType,
    item_number: parsedRef.itemNumber,
    status: 'analyzing',
    metadata: {},
    created_at: startTime,
  };

  const executedModelRuns: ModelRun[] = [];
  const processedClaims: Array<Claim & { evidence: EvidenceItem[] }> = [];

  try {
    // 3. Retrieve GitHub Issue details & pin commit SHA
    const issueData = await fetchGitHubIssue(
      parsedRef.owner,
      parsedRef.repo,
      parsedRef.itemNumber
    );

    const pinnedRef = await fetchRepoPinnedRef(
      parsedRef.owner,
      parsedRef.repo
    ).catch(() => ({
      defaultBranch: 'main',
      commitSha: 'HEAD',
    }));

    currentRun.commit_sha = pinnedRef.commitSha;
    currentRun.metadata = {
      title: issueData.title,
      author: issueData.author,
      labels: issueData.labels,
      htmlUrl: issueData.htmlUrl,
      defaultBranch: pinnedRef.defaultBranch,
    };

    // 4. Extract testable technical claims with Qwen 2.5 (with deterministic fallback)
    const extractionResult = await extractClaimsWithModel(
      issueData.title,
      issueData.body
    );

    executedModelRuns.push({
      id: crypto.randomUUID(),
      run_id: runId,
      ...extractionResult.modelRun,
      created_at: new Date().toISOString(),
    });

    // 5. Discover & safely retrieve candidate Python source files
    const candidatePaths = extractCandidateFilePaths(`${issueData.title}\n${issueData.body}`);
    const retrievedFiles: SourceFileContent[] = [];

    // Attempt retrieval of mentioned files
    for (const filePath of candidatePaths) {
      if (filePath.endsWith('.py') || filePath.endsWith('.md')) {
        try {
          const fileContent = await fetchSourceFile(
            parsedRef.owner,
            parsedRef.repo,
            pinnedRef.commitSha,
            filePath
          );
          retrievedFiles.push(fileContent);
        } catch {
          // File may not exist at this commit — deterministic analyzer handles missing files
        }
      }
    }

    // 6. Run Deterministic Static Analysis on each extracted claim
    for (const rawClaim of extractionResult.claims) {
      const claimId = crypto.randomUUID();
      const partialClaim: Partial<Claim> & { original_text: string } = {
        id: claimId,
        original_text: rawClaim.originalText,
        claim_type: rawClaim.claimType,
      };

      const verification: VerificationResult = verifyClaimAgainstSource(
        partialClaim,
        retrievedFiles,
        parsedRef.owner,
        parsedRef.repo,
        pinnedRef.commitSha
      );

      let finalExplanation = verification.explanation;

      // 7. If evidence was found, generate maintainer explanation using Qwen 2.5
      if (verification.evidence.length > 0) {
        const topEvidence = verification.evidence[0];
        const lineRange = `lines ${topEvidence.line_start}–${topEvidence.line_end}`;

        const explainResult = await explainEvidenceWithModel(
          rawClaim.originalText,
          topEvidence.snippet,
          topEvidence.file_path,
          lineRange,
          verification.status
        );

        finalExplanation = explainResult.explanation;
        executedModelRuns.push({
          id: crypto.randomUUID(),
          run_id: runId,
          ...explainResult.modelRun,
          created_at: new Date().toISOString(),
        });
      }

      const claimRecord: Claim & { evidence: EvidenceItem[] } = {
        id: claimId,
        run_id: runId,
        original_text: rawClaim.originalText,
        claim_type: rawClaim.claimType,
        status: verification.status,
        confidence_rationale: verification.confidenceRationale,
        explanation: finalExplanation,
        created_at: new Date().toISOString(),
        evidence: verification.evidence,
      };

      processedClaims.push(claimRecord);
    }

    currentRun.status = 'completed';
    currentRun.finished_at = new Date().toISOString();

    // 8. Persist to Supabase Database (with graceful catch if database unreachable)
    try {
      const supabase = getSupabaseServiceClient();

      await supabase.from('analysis_runs').insert({
        id: currentRun.id,
        repo_full_name: currentRun.repo_full_name,
        item_type: currentRun.item_type,
        item_number: currentRun.item_number,
        commit_sha: currentRun.commit_sha,
        status: currentRun.status,
        metadata: currentRun.metadata,
        created_at: currentRun.created_at,
        finished_at: currentRun.finished_at,
      });

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
          await supabase.from('evidence_items').insert({
            id: ev.id,
            claim_id: ev.claim_id,
            file_path: ev.file_path,
            line_start: ev.line_start,
            line_end: ev.line_end,
            snippet: ev.snippet,
            source_url: ev.source_url,
            relation: ev.relation,
            created_at: ev.created_at,
          });
        }
      }

      for (const mr of executedModelRuns) {
        await supabase.from('model_runs').insert({
          id: mr.id,
          run_id: mr.run_id,
          provider: mr.provider,
          model_id: mr.model_id,
          task: mr.task,
          prompt_version: mr.prompt_version,
          outcome: mr.outcome,
          latency_ms: mr.latency_ms,
          metadata: mr.metadata || {},
          created_at: mr.created_at,
        });
      }
    } catch {
      // If Supabase write fails (e.g. migration not run yet), continue returning in-memory report
    }

    const responsePayload: AnalyzeIssueResponse = {
      run: currentRun,
      claims: processedClaims,
      modelRuns: executedModelRuns,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (pipelineErr: unknown) {
    const errorMsg = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
    currentRun.status = 'failed';
    currentRun.error_message = errorMsg;
    currentRun.finished_at = new Date().toISOString();

    return new Response(
      JSON.stringify({
        error: errorMsg,
        run: currentRun,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Serve with Deno standard runtime if running inside Supabase Edge Runtime
if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(handleAnalyzeIssue);
}
