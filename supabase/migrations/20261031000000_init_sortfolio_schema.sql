-- ==============================================================================
-- Sortfolio Database Schema (PostgreSQL 15+)
-- Problem 02: Evidence-Based Open Source Issue and Pull Request Triage
-- ==============================================================================

-- 1. Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Analysis Runs Table
-- Represents an individual triage analysis of a GitHub issue or pull request.
CREATE TABLE IF NOT EXISTS public.analysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_full_name TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('issue', 'pull_request')),
    item_number INTEGER NOT NULL,
    commit_sha TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),
    metadata JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_repo_item 
    ON public.analysis_runs (repo_full_name, item_number);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_status 
    ON public.analysis_runs (status);

-- 3. Claims Table
-- Stores individual testable technical claims extracted from the issue/PR prose.
CREATE TABLE IF NOT EXISTS public.claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
    original_text TEXT NOT NULL,
    claim_type TEXT NOT NULL CHECK (claim_type IN (
        'function_signature', 
        'parameter_existence', 
        'file_existence', 
        'exception_behavior', 
        'runtime_behavior',
        'dependency_requirement',
        'documentation_claim'
    )),
    status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN (
        'supported', 
        'contradicted', 
        'unverified', 
        'reproduced', 
        'not_reproduced'
    )),
    confidence_rationale TEXT,
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_run_id 
    ON public.claims (run_id);

CREATE INDEX IF NOT EXISTS idx_claims_status 
    ON public.claims (status);

-- 4. Evidence Items Table
-- Grounded evidence found by deterministic inspection of actual source code/docs.
CREATE TABLE IF NOT EXISTS public.evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    snippet TEXT NOT NULL,
    source_url TEXT NOT NULL,
    relation TEXT NOT NULL DEFAULT 'insufficient' CHECK (relation IN (
        'supporting', 
        'conflicting', 
        'insufficient'
    )),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_claim_id 
    ON public.evidence_items (claim_id);

-- 5. Model Runs Table
-- Audit trail recording open-weight LLM calls for transparency and compliance.
CREATE TABLE IF NOT EXISTS public.model_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    task TEXT NOT NULL CHECK (task IN ('claim_extraction', 'evidence_explanation', 'general_summary')),
    prompt_version TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'fallback', 'timeout', 'invalid_json', 'error')),
    latency_ms INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_runs_run_id 
    ON public.model_runs (run_id);

-- 6. Evaluation Cases Table (Optional benchmark testing)
CREATE TABLE IF NOT EXISTS public.evaluation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    expected_label TEXT NOT NULL,
    observed_label TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- Row Level Security (RLS) Configuration
-- ==============================================================================

ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_cases ENABLE ROW LEVEL SECURITY;

-- Anonymous users (browser UI) can view completed analyses and related evidence
DROP POLICY IF EXISTS "Public can view completed analysis runs" ON public.analysis_runs;
CREATE POLICY "Public can view completed analysis runs" 
    ON public.analysis_runs 
    FOR SELECT 
    USING (status = 'completed');

DROP POLICY IF EXISTS "Public can view claims of completed runs" ON public.claims;
CREATE POLICY "Public can view claims of completed runs" 
    ON public.claims 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.analysis_runs 
            WHERE public.analysis_runs.id = public.claims.run_id 
              AND public.analysis_runs.status = 'completed'
        )
    );

DROP POLICY IF EXISTS "Public can view evidence of completed runs" ON public.evidence_items;
CREATE POLICY "Public can view evidence of completed runs" 
    ON public.evidence_items 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.claims 
            JOIN public.analysis_runs ON public.analysis_runs.id = public.claims.run_id 
            WHERE public.claims.id = public.evidence_items.claim_id 
              AND public.analysis_runs.status = 'completed'
        )
    );

DROP POLICY IF EXISTS "Public can view model runs for completed analyses" ON public.model_runs;
CREATE POLICY "Public can view model runs for completed analyses" 
    ON public.model_runs 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.analysis_runs 
            WHERE public.analysis_runs.id = public.model_runs.run_id 
              AND public.analysis_runs.status = 'completed'
        )
    );

DROP POLICY IF EXISTS "Public can view evaluation cases" ON public.evaluation_cases;
CREATE POLICY "Public can view evaluation cases" 
    ON public.evaluation_cases 
    FOR SELECT 
    USING (true);

-- Service Role Key (Backend Edge Functions) has full access
DROP POLICY IF EXISTS "Service role full access on analysis_runs" ON public.analysis_runs;
CREATE POLICY "Service role full access on analysis_runs" 
    ON public.analysis_runs 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on claims" ON public.claims;
CREATE POLICY "Service role full access on claims" 
    ON public.claims 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on evidence_items" ON public.evidence_items;
CREATE POLICY "Service role full access on evidence_items" 
    ON public.evidence_items 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on model_runs" ON public.model_runs;
CREATE POLICY "Service role full access on model_runs" 
    ON public.model_runs 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on evaluation_cases" ON public.evaluation_cases;
CREATE POLICY "Service role full access on evaluation_cases" 
    ON public.evaluation_cases 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);
