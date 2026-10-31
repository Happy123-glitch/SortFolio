// ==============================================================================
// Sortfolio Deterministic Static Analysis Engine
// ==============================================================================
// Authoritative static inspection for Python codebases.
// Parses functions, parameters, classes, and file structures.
// Generates exact line numbers, code snippets, and evidence relations.
// ZERO runtime execution of untrusted code.

import type { Claim, EvidenceItem, ClaimStatus, EvidenceRelation } from './types.ts';
import type { SourceFileContent } from './github.ts';
import { generateGitHubPermalink } from './github.ts';

export interface PythonParameter {
  name: string;
  raw: string;
  defaultValue?: string;
  typeHint?: string;
}

export interface PythonFunctionDef {
  name: string;
  kind: 'function' | 'method';
  className?: string;
  parameters: PythonParameter[];
  returnTypeHint?: string;
  isAsync: boolean;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  filePath: string;
}

export interface PythonClassDef {
  name: string;
  bases: string[];
  methods: string[];
  lineStart: number;
  lineEnd: number;
  snippet: string;
  filePath: string;
}

export interface AnalysisFacts {
  filePath: string;
  functions: PythonFunctionDef[];
  classes: PythonClassDef[];
}

export interface VerificationResult {
  status: ClaimStatus;
  confidenceRationale: string;
  explanation: string;
  evidence: EvidenceItem[];
}

/**
 * Parses Python source code to extract all classes, functions, and method definitions
 * with precise line numbers and parameter lists.
 */
export function parsePythonSource(content: string, filePath: string): AnalysisFacts {
  const lines = content.split('\n');
  const functions: PythonFunctionDef[] = [];
  const classes: PythonClassDef[] = [];

  let currentClass: { name: string; indent: number } | null = null;
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check indentation level to track whether we're inside a class
    const indentMatch = rawLine.match(/^(\s*)/);
    const indentLevel = indentMatch ? indentMatch[1].length : 0;

    if (currentClass && indentLevel <= currentClass.indent && trimmed.length > 0) {
      currentClass = null; // Exited class scope
    }

    // 1. Detect Class Definition
    const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\((.*?)\))?\s*:/);
    if (classMatch) {
      const className = classMatch[1];
      const basesRaw = classMatch[2] || '';
      const bases = basesRaw
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean);

      const lineStart = i + 1;
      const snippet = rawLine;

      classes.push({
        name: className,
        bases,
        methods: [],
        lineStart,
        lineEnd: lineStart,
        snippet,
        filePath,
      });

      currentClass = { name: className, indent: indentLevel };
      i++;
      continue;
    }

    // 2. Detect Function or Method Definition (handles multi-line signatures and type annotations)
    const funcStartMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
    if (funcStartMatch) {
      const isAsync = trimmed.startsWith('async');
      const funcName = funcStartMatch[1];
      const lineStart = i + 1;

      // Track parenthesis depth to locate the true closing colon outside brackets
      let parenDepth = 0;
      let foundColon = false;
      let j = i;
      const signatureLines = [rawLine];

      const startIdx = rawLine.indexOf('(');
      for (let k = startIdx; k < rawLine.length; k++) {
        const ch = rawLine[k];
        if (ch === '(' || ch === '[' || ch === '{') parenDepth++;
        else if (ch === ')' || ch === ']' || ch === '}') parenDepth = Math.max(0, parenDepth - 1);
        else if (parenDepth === 0 && ch === ':') {
          foundColon = true;
          break;
        }
      }

      while (!foundColon && j + 1 < lines.length) {
        j++;
        const nextLine = lines[j];
        signatureLines.push(nextLine);
        for (let k = 0; k < nextLine.length; k++) {
          const ch = nextLine[k];
          if (ch === '(' || ch === '[' || ch === '{') parenDepth++;
          else if (ch === ')' || ch === ']' || ch === '}') parenDepth = Math.max(0, parenDepth - 1);
          else if (parenDepth === 0 && ch === ':') {
            foundColon = true;
            break;
          }
        }
      }

      const lineEnd = j + 1;
      const snippet = signatureLines.join('\n');
      const signatureText = snippet;

      // Extract parameter body inside outermost parentheses: def func(...) -> ...:
      const paramsMatch = signatureText.match(/def\s+[a-zA-Z0-9_]+\s*\(([\s\S]*?)\)(?:\s*->\s*([^:]+))?\s*:/);
      const paramsRaw = paramsMatch ? paramsMatch[1] : '';
      const returnTypeHint = paramsMatch && paramsMatch[2] ? paramsMatch[2].trim() : undefined;

      const parameters = parseParameterList(paramsRaw);
      const kind: 'function' | 'method' = currentClass ? 'method' : 'function';

      const funcDef: PythonFunctionDef = {
        name: funcName,
        kind,
        className: currentClass ? currentClass.name : undefined,
        parameters,
        returnTypeHint,
        isAsync,
        lineStart,
        lineEnd,
        snippet,
        filePath,
      };

      functions.push(funcDef);

      if (currentClass) {
        const parentClass = classes.find((c) => c.name === currentClass?.name);
        if (parentClass) {
          parentClass.methods.push(funcName);
        }
      }

      i = j + 1;
      continue;
    }

    i++;
  }

  return { filePath, functions, classes };
}

/**
 * Splits parameter strings taking into account default values, tuples, and type hints.
 */
function parseParameterList(rawParams: string): PythonParameter[] {
  if (!rawParams || !rawParams.trim()) return [];

  const params: PythonParameter[] = [];
  const tokens = splitParametersByComma(rawParams);

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    let name = trimmed;
    let defaultValue: string | undefined;
    let typeHint: string | undefined;

    // Check for default value (name: type = default)
    if (trimmed.includes('=')) {
      const [left, right] = trimmed.split(/=(.+)/);
      name = left.trim();
      defaultValue = right.trim();
    }

    // Check for type annotation (name: type)
    if (name.includes(':')) {
      const [pName, pType] = name.split(/:/);
      name = pName.trim();
      typeHint = pType.trim();
    }

    // Strip * or ** from clean parameter identifier
    const cleanName = name.replace(/^(\*{1,2})/, '');

    params.push({
      name: cleanName,
      raw: trimmed,
      defaultValue,
      typeHint,
    });
  }

  return params;
}

/**
 * Splits a parameter string by commas while ignoring commas inside brackets or braces.
 */
function splitParametersByComma(input: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1);
      current += char;
    } else if (char === ',' && depth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current);
  }

  return result;
}

/**
 * Checks if a technical claim expresses a negative assertion (e.g. absent, missing, has no).
 */
export function isNegativeClaim(text: string): boolean {
  return /\b(does\s+not\s+(?:have|take|accept|support)|no\s+(?:parameter|arg|argument|method|function)|missing|not\s+found|absent|removed|cannot\s+accept|without)\b/i.test(
    text
  );
}

/**
 * Authoritative verification engine comparing extracted claim semantics against
 * deterministic facts derived from inspected source files.
 */
export function verifyClaimAgainstSource(
  claim: Partial<Claim> & { original_text: string },
  sourceFiles: SourceFileContent[],
  owner: string,
  repo: string,
  commitSha: string
): VerificationResult {
  const claimText = claim.original_text;
  const isNegative = isNegativeClaim(claimText);

  // If no source files were retrieved, we must communicate uncertainty
  if (!sourceFiles || sourceFiles.length === 0) {
    return {
      status: 'unverified',
      confidenceRationale: 'No source files were available to inspect for this claim.',
      explanation: 'Evidence could not be retrieved from the repository at this commit.',
      evidence: [],
    };
  }

  // Parse all provided source files into symbols
  const allFacts: AnalysisFacts[] = sourceFiles.map((sf) => parsePythonSource(sf.content, sf.filePath));
  const allFunctions = allFacts.flatMap((f) => f.functions);
  const allClasses = allFacts.flatMap((f) => f.classes);

  // 1. Parameter existence checks
  // Look for target function names mentioned in the claim prose
  for (const func of allFunctions) {
    const funcRegex = new RegExp(`\\b${escapeRegExp(func.name)}\\b`, 'i');
    if (!funcRegex.test(claimText)) continue;

    // Check if any parameter of this function is mentioned in the claim
    for (const param of func.parameters) {
      const paramRegex = new RegExp(`\\b${escapeRegExp(param.name)}\\b`, 'i');
      if (paramRegex.test(claimText)) {
        // The parameter IS present in the inspected function!
        const sourceUrl = generateGitHubPermalink(owner, repo, commitSha, func.filePath, func.lineStart, func.lineEnd);

        if (isNegative) {
          // Claim asserted parameter is missing, but it is present -> Contradicted!
          const evidence: EvidenceItem = {
            id: crypto.randomUUID(),
            claim_id: claim.id || '',
            file_path: func.filePath,
            line_start: func.lineStart,
            line_end: func.lineEnd,
            snippet: func.snippet,
            source_url: sourceUrl,
            relation: 'conflicting',
            created_at: new Date().toISOString(),
          };

          return {
            status: 'contradicted',
            confidenceRationale: `Direct inspection of function "${func.name}" in ${func.filePath} confirms parameter "${param.name}" is present.`,
            explanation: `The claim states that "${func.name}" lacks parameter "${param.name}", but the function signature in ${func.filePath} (lines ${func.lineStart}–${func.lineEnd}) explicitly declares it.`,
            evidence: [evidence],
          };
        } else {
          // Claim asserted parameter exists, and it is present -> Supported!
          const evidence: EvidenceItem = {
            id: crypto.randomUUID(),
            claim_id: claim.id || '',
            file_path: func.filePath,
            line_start: func.lineStart,
            line_end: func.lineEnd,
            snippet: func.snippet,
            source_url: sourceUrl,
            relation: 'supporting',
            created_at: new Date().toISOString(),
          };

          return {
            status: 'supported',
            confidenceRationale: `Inspected function "${func.name}" in ${func.filePath} explicitly includes parameter "${param.name}".`,
            explanation: `Deterministic analysis located parameter "${param.name}" in "${func.name}" at ${func.filePath} lines ${func.lineStart}–${func.lineEnd}.`,
            evidence: [evidence],
          };
        }
      }
    }

    // Function was found, but the claimed parameter was NOT in the parameters list
    const claimedParamMatch = claimText.match(/parameter\s+['"`]?([a-zA-Z0-9_]+)['"`]?/i) ||
                              claimText.match(/argument\s+['"`]?([a-zA-Z0-9_]+)['"`]?/i) ||
                              claimText.match(/keyword\s+['"`]?([a-zA-Z0-9_]+)['"`]?/i);

    if (claimedParamMatch) {
      const claimedParam = claimedParamMatch[1];
      const hasParam = func.parameters.some((p) => p.name === claimedParam);

      if (!hasParam) {
        const sourceUrl = generateGitHubPermalink(owner, repo, commitSha, func.filePath, func.lineStart, func.lineEnd);

        if (isNegative) {
          // Claim said parameter is NOT present, and it indeed is not -> Supported!
          const evidence: EvidenceItem = {
            id: crypto.randomUUID(),
            claim_id: claim.id || '',
            file_path: func.filePath,
            line_start: func.lineStart,
            line_end: func.lineEnd,
            snippet: func.snippet,
            source_url: sourceUrl,
            relation: 'supporting',
            created_at: new Date().toISOString(),
          };

          return {
            status: 'supported',
            confidenceRationale: `Inspected function signature "${func.name}" in ${func.filePath} does not declare parameter "${claimedParam}".`,
            explanation: `The claim is supported: "${claimedParam}" is absent from "${func.name}" in ${func.filePath} (lines ${func.lineStart}–${func.lineEnd}).`,
            evidence: [evidence],
          };
        } else {
          // Claim said parameter exists, but it does NOT -> Contradicted!
          const evidence: EvidenceItem = {
            id: crypto.randomUUID(),
            claim_id: claim.id || '',
            file_path: func.filePath,
            line_start: func.lineStart,
            line_end: func.lineEnd,
            snippet: func.snippet,
            source_url: sourceUrl,
            relation: 'conflicting',
            created_at: new Date().toISOString(),
          };

          return {
            status: 'contradicted',
            confidenceRationale: `Inspection of "${func.name}" confirms parameter "${claimedParam}" is not declared.`,
            explanation: `The claim asserts "${claimedParam}" is accepted by "${func.name}", but it is missing from the inspected signature in ${func.filePath}.`,
            evidence: [evidence],
          };
        }
      }
    }
  }

  // 2. Class existence check
  for (const cls of allClasses) {
    const classRegex = new RegExp(`\\b(?:class\\s+)?${escapeRegExp(cls.name)}\\b`, 'i');
    if (classRegex.test(claimText)) {
      const sourceUrl = generateGitHubPermalink(owner, repo, commitSha, cls.filePath, cls.lineStart, cls.lineEnd);
      const evidence: EvidenceItem = {
        id: crypto.randomUUID(),
        claim_id: claim.id || '',
        file_path: cls.filePath,
        line_start: cls.lineStart,
        line_end: cls.lineEnd,
        snippet: cls.snippet,
        source_url: sourceUrl,
        relation: isNegative ? 'conflicting' : 'supporting',
        created_at: new Date().toISOString(),
      };

      return {
        status: isNegative ? 'contradicted' : 'supported',
        confidenceRationale: `Class "${cls.name}" was found in ${cls.filePath} at line ${cls.lineStart}.`,
        explanation: `Deterministic analysis confirmed definition of class "${cls.name}" in ${cls.filePath}.`,
        evidence: [evidence],
      };
    }
  }

  // 3. Fallback: If no deterministic proof can be tied to the claim, return Unverified
  return {
    status: 'unverified',
    confidenceRationale: 'The claim references symbols or behaviors not deterministically matched in the inspected files.',
    explanation: 'Static source inspection could neither conclusively support nor contradict this claim within the retrieved scope.',
    evidence: [],
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
