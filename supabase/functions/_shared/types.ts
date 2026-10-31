// ==============================================================================
// Sortfolio Backend TypeScript Types
// ==============================================================================

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

export type ClaimType = 
  | 'function_signature' 
  | 'parameter_existence' 
  | 'file_existence' 
  | 'exception_behavior' 
  | 'runtime_behavior'
  | 'dependency_requirement'
  | 'documentation_claim';

export type ClaimStatus = 
  | 'supported' 
  | 'contradicted' 
  | 'unverified' 
  | 'reproduced' 
  | 'not_reproduced';

export type EvidenceRelation = 
  | 'supporting' 
  | 'conflicting' 
  | 'insufficient';

export type ModelTask = 
  | 'claim_extraction' 
  | 'evidence_explanation' 
  | 'general_summary';

export type ModelOutcome = 
  | 'success' 
  | 'fallback' 
  | 'timeout' 
  | 'invalid_json' 
  | 'error';

export interface AnalysisRun {
  id: string;
  repo_full_name: string;
  item_type: 'issue' | 'pull_request';
  item_number: number;
  commit_sha?: string;
  status: AnalysisStatus;
  metadata?: Record<string, unknown>;
  error_message?: string;
  created_at: string;
  finished_at?: string;
}

export interface Claim {
  id: string;
  run_id: string;
  original_text: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  confidence_rationale?: string;
  explanation?: string;
  created_at: string;
}

export interface EvidenceItem {
  id: string;
  claim_id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  snippet: string;
  source_url: string;
  relation: EvidenceRelation;
  created_at: string;
}

export interface ModelRun {
  id: string;
  run_id?: string;
  provider: string;
  model_id: string;
  task: ModelTask;
  prompt_version: string;
  outcome: ModelOutcome;
  latency_ms?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface EvaluationCase {
  id: string;
  source: string;
  expected_label: string;
  observed_label?: string;
  notes?: string;
  created_at: string;
}

export interface AnalyzeIssueRequest {
  repo: string;
  issueNumber: number;
}

export interface AnalyzeIssueResponse {
  run: AnalysisRun;
  claims: Array<Claim & { evidence: EvidenceItem[] }>;
  modelRuns: ModelRun[];
}

export interface PresetProblem {
  id: string;
  title: string;
  badge: string;
  badgeType: 'success' | 'danger' | 'warning' | 'info';
  repo: string;
  issueNumber: number;
  claimText: string;
  claimType: ClaimType;
  targetFile?: string;
  expectedStatus: ClaimStatus;
  description: string;
}
