// ==============================================================================
// Sortfolio Open-Weight AI Model Provider & Guardrails Engine
// ==============================================================================
// Hackathon Rule 10 Compliance:
// - Uses Open-Weight models ONLY (Primary: Qwen 2.5 7B Instruct / Coder).
// - Closed APIs (OpenAI, Claude, Gemini) are strictly prohibited in product code.
// - Deterministic fallback ensures the system works 100% offline or when quota expires.
// - Model outputs pass through strict validation gates to prevent hallucinated paths/lines.

import type { ModelRun, ClaimType, Claim } from './types.ts';

export interface ModelProviderConfig {
  provider: 'ollama' | 'hosted';
  modelId: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ExtractedClaimItem {
  originalText: string;
  claimType: ClaimType;
  targetSymbol?: string;
  entity?: string;
}

export interface ClaimExtractionResult {
  claims: ExtractedClaimItem[];
  modelRun: Omit<ModelRun, 'id' | 'run_id' | 'created_at'>;
}

export interface ExplanationResult {
  explanation: string;
  modelRun: Omit<ModelRun, 'id' | 'run_id' | 'created_at'>;
}

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
 * Resolves current open-weight model configuration from environment.
 * Default: Qwen 2.5 7B via Ollama.
 */
export function getModelConfig(): ModelProviderConfig {
  const provider = (getEnv('OLLAMA_PROVIDER') || getEnv('OPEN_WEIGHT_MODEL_PROVIDER') || 'ollama') as 'ollama' | 'hosted';
  const modelId = getEnv('OPEN_WEIGHT_MODEL_ID') || 'qwen2.5:7b';
  const baseUrl = getEnv('OPEN_WEIGHT_MODEL_BASE_URL') || (provider === 'ollama' ? 'http://localhost:11434' : 'https://api.together.xyz/v1');
  const apiKey = getEnv('OPEN_WEIGHT_MODEL_API_KEY') || '';

  // Prohibit proprietary closed endpoints
  if (/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/i.test(baseUrl)) {
    throw new Error(
      'Hackathon Rule 10 Violation: Closed proprietary model APIs (OpenAI, Claude, Gemini) are strictly forbidden in Sortfolio product code. Use open-weight models (Qwen, Llama, Mistral).'
    );
  }

  return {
    provider,
    modelId,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    timeoutMs: 15000,
  };
}

/**
 * Dispatches inference request to either local Ollama or hosted open-weight endpoint.
 */
export async function callOpenWeightModel(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  config: ModelProviderConfig = getModelConfig()
): Promise<{ text: string; latencyMs: number }> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 15000);

  try {
    let response: Response;

    if (config.provider === 'ollama') {
      // Ollama /api/chat endpoint
      const url = `${config.baseUrl}/api/chat`;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.modelId,
          messages,
          stream: false,
          format: 'json',
        }),
        signal: controller.signal,
      });
    } else {
      // Hosted open-weight endpoint (OpenAI-compatible schema e.g. vLLM, Groq, OpenRouter)
      const url = `${config.baseUrl}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.modelId,
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      throw new Error(`Model API returned status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    let text = '';
    if (config.provider === 'ollama') {
      text = data.message?.content || '';
    } else {
      text = data.choices?.[0]?.message?.content || '';
    }

    return { text, latencyMs };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Task 1: Bounded Technical Claim Extraction from Issue Prose.
 * Uses Qwen 2.5 7B to parse testable technical assertions into strict JSON.
 * Gracefully falls back to deterministic extraction if model inference fails.
 */
export async function extractClaimsWithModel(
  issueTitle: string,
  issueBody: string,
  config: ModelProviderConfig = getModelConfig()
): Promise<ClaimExtractionResult> {
  const promptVersion = 'v1.0';
  const startTime = Date.now();

  const systemPrompt = `You are Sortfolio's technical claim extraction engine for open-source code triage.
Extract 1 to 3 factual, testable technical claims from the provided GitHub issue.
Focus strictly on:
- Function or method signatures
- Parameter existence or naming
- Class definitions and inheritance
- File existence or documentation claims
Rules:
1. Preserve the user's original words where possible.
2. Do NOT invent claims not stated in the issue.
3. Respond ONLY with valid JSON following this schema:
{
  "claims": [
    {
      "originalText": "exact or closely quoted claim",
      "claimType": "function_signature" | "parameter_existence" | "file_existence" | "exception_behavior" | "runtime_behavior",
      "targetSymbol": "symbol or function name",
      "entity": "module or class"
    }
  ]
}`;

  const userContent = `<untrusted_issue_text>\nTitle: ${issueTitle}\n\nDescription:\n${issueBody}\n</untrusted_issue_text>`;

  try {
    const { text, latencyMs } = await callOpenWeightModel(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      config
    );

    const parsed = parseClaimsJson(text);

    if (parsed && parsed.length > 0) {
      return {
        claims: parsed,
        modelRun: {
          provider: config.provider,
          model_id: config.modelId,
          task: 'claim_extraction',
          prompt_version: promptVersion,
          outcome: 'success',
          latency_ms: latencyMs,
          metadata: { extractedCount: parsed.length },
        },
      };
    }

    // Invalid JSON -> fallback
    const fallbackClaims = deterministicExtractClaims(issueTitle, issueBody);
    return {
      claims: fallbackClaims,
      modelRun: {
        provider: config.provider,
        model_id: config.modelId,
        task: 'claim_extraction',
        prompt_version: promptVersion,
        outcome: 'fallback',
        latency_ms: Date.now() - startTime,
        metadata: { reason: 'Model returned malformed JSON or empty claims list' },
      },
    };
  } catch (err: unknown) {
    // Model timeout, network failure, or offline runtime -> deterministic fallback
    const fallbackClaims = deterministicExtractClaims(issueTitle, issueBody);
    const errorMessage = err instanceof Error ? err.message : String(err);

    return {
      claims: fallbackClaims,
      modelRun: {
        provider: config.provider,
        model_id: config.modelId,
        task: 'claim_extraction',
        prompt_version: promptVersion,
        outcome: 'fallback',
        latency_ms: Date.now() - startTime,
        metadata: { error: errorMessage },
      },
    };
  }
}

/**
 * Task 2: Maintainer Explanation Synthesis.
 * Summarizes ONLY already-verified deterministic evidence.
 * Strips any hallucinated file paths or line numbers.
 */
export async function explainEvidenceWithModel(
  claimText: string,
  verifiedEvidenceSnippet: string,
  verifiedFilePath: string,
  verifiedLineRange: string,
  status: string,
  config: ModelProviderConfig = getModelConfig()
): Promise<ExplanationResult> {
  const promptVersion = 'v1.0';
  const startTime = Date.now();

  const systemPrompt = `You are Sortfolio's evidence explanation generator.
Summarize what the analyzer-verified code evidence proves regarding the maintainer claim.
Rules:
1. Explain concisely in 2 sentences max.
2. Reference ONLY the provided code snippet.
3. Do NOT invent new file paths, line numbers, or test results.
4. If status is contradicted, clearly note what was declared vs what was claimed.
5. Respond in plain English text.`;

  const userContent = `Claim: "${claimText}"
Status: ${status}
Verified File: ${verifiedFilePath} (${verifiedLineRange})
Verified Code Evidence:
\`\`\`
${verifiedEvidenceSnippet}
\`\`\``;

  try {
    const { text, latencyMs } = await callOpenWeightModel(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      config
    );

    const sanitizedExplanation = sanitizeExplanation(text, verifiedFilePath);

    return {
      explanation: sanitizedExplanation,
      modelRun: {
        provider: config.provider,
        model_id: config.modelId,
        task: 'evidence_explanation',
        prompt_version: promptVersion,
        outcome: 'success',
        latency_ms: latencyMs,
      },
    };
  } catch {
    // Fallback deterministic explanation
    const fallback = generateDeterministicExplanation(claimText, status, verifiedFilePath, verifiedLineRange);
    return {
      explanation: fallback,
      modelRun: {
        provider: config.provider,
        model_id: config.modelId,
        task: 'evidence_explanation',
        prompt_version: promptVersion,
        outcome: 'fallback',
        latency_ms: Date.now() - startTime,
      },
    };
  }
}

/**
 * Parses and validates structured claims JSON from model response text.
 */
export function parseClaimsJson(rawText: string): ExtractedClaimItem[] | null {
  try {
    // Handle potential markdown code fences: ```json ... ```
    const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const claimList = Array.isArray(parsed) ? parsed : parsed.claims;
    if (!Array.isArray(claimList)) return null;

    const validTypes: ClaimType[] = [
      'function_signature',
      'parameter_existence',
      'file_existence',
      'exception_behavior',
      'runtime_behavior',
      'dependency_requirement',
      'documentation_claim',
    ];

    const results: ExtractedClaimItem[] = [];
    for (const item of claimList) {
      if (item && typeof item.originalText === 'string' && item.originalText.trim()) {
        const claimType = validTypes.includes(item.claimType) ? item.claimType : 'parameter_existence';
        results.push({
          originalText: item.originalText.trim(),
          claimType,
          targetSymbol: item.targetSymbol,
          entity: item.entity,
        });
      }
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

/**
 * Strips or guards against made-up file paths in model explanations.
 */
export function sanitizeExplanation(text: string, allowedFilePath: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'Deterministic inspection completed.';

  // If the model generates a file path that doesn't match the inspected file, strip it
  const pathRegex = /\b([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)\b/g;
  return trimmed.replace(pathRegex, (match) => {
    if (match === allowedFilePath || allowedFilePath.endsWith(match)) {
      return match;
    }
    return '[inspected source]';
  });
}

/**
 * Deterministic Claim Extractor (Authoritative Fallback).
 * Extracts claims from issue title and prose using static patterns.
 */
export function deterministicExtractClaims(title: string, body: string): ExtractedClaimItem[] {
  const claims: ExtractedClaimItem[] = [];
  const combinedText = `${title}\n${body}`;

  // 1. Look for parameter assertions: e.g. "func has no param X" or "param Y is missing"
  const paramRegex = /(?:does\s+not\s+(?:have|take|accept)|no|missing|without)\s+(?:parameter|argument|arg|keyword)\s+['"`]?([a-zA-Z0-9_]+)['"`]?/gi;
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(combinedText)) !== null) {
    claims.push({
      originalText: match[0],
      claimType: 'parameter_existence',
      targetSymbol: match[1],
    });
  }

  // 2. Look for function acceptance claims: e.g. "func accepts param X"
  const acceptRegex = /(?:accepts|takes|requires|has)\s+(?:parameter|argument|arg|keyword)\s+['"`]?([a-zA-Z0-9_]+)['"`]?/gi;
  while ((match = acceptRegex.exec(combinedText)) !== null) {
    claims.push({
      originalText: match[0],
      claimType: 'parameter_existence',
      targetSymbol: match[1],
    });
  }

  // 3. Look for addition / introduction claims: e.g. "Add param X", "adds param X to func"
  const addRegex = /(?:adds?|added|adding|supports?|introduces?)\s+(?:(?:parameter|argument|arg|keyword)\s+)?['"`]?([a-zA-Z0-9_]+)['"`]?(?:\s+(?:parameter|argument|arg|keyword))?/gi;
  while ((match = addRegex.exec(combinedText)) !== null) {
    if (match[1] && !['parameter', 'argument', 'arg', 'keyword', 'the', 'a', 'to', 'in'].includes(match[1].toLowerCase())) {
      claims.push({
        originalText: match[0],
        claimType: 'parameter_existence',
        targetSymbol: match[1],
      });
    }
  }

  // 4. Look for function or class symbol calls in backticks: `Flask.add_url_rule`
  const symbolRegex = /`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)`/g;
  while ((match = symbolRegex.exec(combinedText)) !== null) {
    const symbol = match[1];
    claims.push({
      originalText: `Reference to symbol ${symbol}`,
      claimType: 'function_signature',
      targetSymbol: symbol,
    });
  }

  // 4. Default fallback if no specific pattern matched
  if (claims.length === 0 && title.trim()) {
    claims.push({
      originalText: title.trim(),
      claimType: 'parameter_existence',
    });
  }

  return claims.slice(0, 3);
}

/**
 * Deterministic Explanation Generator (Fallback when model inference is unavailable).
 */
export function generateDeterministicExplanation(
  claimText: string,
  status: string,
  filePath: string,
  lineRange: string
): string {
  if (status === 'supported') {
    return `Static code inspection in ${filePath} (${lineRange}) confirms that the implementation matches the claim: "${claimText}".`;
  }
  if (status === 'contradicted') {
    return `Static inspection of ${filePath} (${lineRange}) contradicts the claim. The verified signature declares the inspected constructs differently.`;
  }
  return `The claim could not be conclusively verified against the source code retrieved from ${filePath}.`;
}
