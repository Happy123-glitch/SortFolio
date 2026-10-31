# HACKATHON.md

## Team

-   **Team name:** Quadrax
-   **Team members:** Dhairya, Aayush Dhiman, and Happy Rawat

## Selected Problem

-   **Problem number:** 02
-   **Problem title:** Evidence-Based Open Source Issue and Pull Request
    Triage
-   **Project name:** Sortfolio
-   **Tagline:** Every claim deserves evidence.

### Problem statement

Open-source maintainers receive bug reports and pull requests that may
contain incorrect assumptions, misleading descriptions, incomplete
reproduction steps, or technical claims that cannot be verified.
Reviewing these reports takes time.

Sortfolio is designed to help maintainers assess individual technical
claims against repository source code and documentation. It does not try
to determine whether a report was written by a human or an AI, and it
does not label an entire issue as fake because one claim is unsupported.
It presents evidence, limitations, and uncertainty so that maintainers
can make informed decisions.

### Planned solution

1.  Accept a public GitHub repository and an issue number as the first
    MVP workflow.
2.  Retrieve the issue title, body, labels, and other relevant details
    through the GitHub REST API.
3.  Extract a small set of factual, testable technical claims.
4.  Retrieve relevant source files and project documentation from the
    inspected repository version.
5.  Run deterministic source checks and identify evidence locations,
    including file paths, line numbers, and snippets where available.
6.  Compare each claim with the inspected evidence and assign a clear
    status.
7.  Use the planned open-weight Qwen Instruct model for bounded language
    tasks: claim extraction and explanation of evidence already
    collected.
8.  Display an auditable report with source links, explanations,
    limitations, and a JSON export.

An unsupported claim is not automatically false. If evidence is missing,
inaccessible, ambiguous, or outside the analyzer's supported scope,
Sortfolio should report **Unverified** rather than guess.
## New Features and Differentiators

Sortfolio will extend its core evidence-based claim verification workflow with the following features. These additions are designed to help maintainers understand how a claim was assessed, inspect its evidence, and identify what remains unverified.

### 1. Evidence Graph

**Purpose:** Show the relationship between a technical claim and the evidence collected for it.

The Evidence Graph will connect:
- The original claim from a GitHub issue or pull request.
- Relevant source files and code locations.
- Related documentation.
- Existing tests and their recorded results.
- The final assessment and its limitations.

Only relationships supported by retrieved repository data will be displayed. The graph must not invent evidence or imply that a relationship proves a claim automatically.

### 2. Reproducibility Lab

**Purpose:** Help maintainers inspect attempts to reproduce a reported bug.

The Reproducibility Lab will display:
- The behaviour being investigated.
- The test or check attempted.
- Whether execution was attempted.
- Actual test output and exit status, when available.
- The environment and conditions used.
- Limitations or reasons a test could not run.

Possible outcomes include **Reproduced**, **Not Reproduced**, **Not Attempted**, and **Execution Failed**.

A failure to reproduce a bug does not automatically mean the claim is false.

Unknown contributor code must never run inside the main application or Supabase Edge Function. Reproduction requires a separate, isolated execution environment without secrets or network access. If that environment is unavailable, Sortfolio will rely on supported static checks and clearly disclose the limitation.

### 3. Fix and Version Tracker

**Purpose:** Help maintainers investigate whether a reported problem may already have been addressed.

Where evidence is available, Sortfolio will identify:
- Potentially related commits and pull requests.
- Changes to relevant source files.
- Tests associated with a possible fix.
- The commit or branch inspected.
- Whether evidence establishes that the fix is present in the affected version.

A merged pull request alone is not sufficient proof that a bug is fixed in every version. Sortfolio must explain uncertainty when the connection between a reported issue and a proposed fix cannot be established.

This feature is planned as a later enhancement if time permits.

### 4. Evidence Gap Detector

**Purpose:** Explain why a technical claim cannot yet be verified and what additional evidence could help.

Examples of missing evidence include:
- No relevant source file could be retrieved.
- No suitable test or reproduction steps are available.
- A performance claim lacks comparable benchmark results.
- The affected software version is unknown.
- The available code does not establish the reported runtime behaviour.

For each evidence gap, Sortfolio will explain what is missing and suggest a relevant next step.

The system must not invent missing results or change an Unverified assessment into a definite verdict without adequate evidence.

### 5. Evidence Timeline

**Purpose:** Present relevant events in chronological order when their timestamps and relationships can be established.

Possible timeline events include:
- Issue creation.
- Relevant commit creation.
- Pull request creation or merge.
- Changes to related source files.
- Test execution during the current analysis.

Each event must link to its actual source where possible. Sortfolio must distinguish historical repository events from checks performed during the current analysis.

### Implementation Priority

**MVP — Required first:**
1. Claim-by-claim assessment.
2. Traceable source evidence.
3. Clear explanations of missing evidence and uncertainty.

**Next — Strong differentiators:**
1. Evidence Graph.
2. Evidence Gap Detector.
3. Reproducibility Lab, only when safe execution is available.

**Later — If time permits:**
1. Fix and Version Tracker.
2. Evidence Timeline.

The existing issue-analysis workflow remains the priority. New features must reuse the existing claim and evidence data rather than duplicate the analysis pipeline.

## AI Models and Why We Use Them

### Planned primary model

-   **Model family:** Qwen Instruct
-   **Exact model identifier:** To be finalized after the team selects
    and tests the specific variant.
-   **Runtime / inference route:** To be finalized --- compatible hosted
    open-weight inference endpoint or local inference.
-   **Planned tasks:**
    -   Extract concise, atomic, testable technical claims from GitHub
        issue text.
    -   Summarize only the evidence already retrieved and checked by
        Sortfolio.
    -   Explain relevant limitations in clear language for maintainers.
-   **Why this model:** Qwen Instruct is the planned open-weight model
    for the project's bounded language tasks. The team will confirm the
    exact variant, licence, availability, inference route, and event
    eligibility before integration.
-   **Verification responsibility:** Deterministic source inspection and
    evidence matching remain responsible for source facts, file paths,
    line numbers, snippets, and claim status. The model must not invent
    evidence or test results.

### Model disclosure and accuracy

No model integration is present in the repository yet. Qwen Instruct is
a plan, not a model currently used by the product. Once integrated,
record the exact model identifier, version, runtime, and purpose here.
Do not claim a model is used until the submitted code actually calls it.

Qwen Instruct is **planned**, not represented here as already
integrated. Before submission, update this section with the exact model
identifier and actual runtime used by the submitted code. Record a model
and version in project records only when it was genuinely called.

The project AI workflow is planned around an open-weight model. It does
not use OpenAI, Claude, or Gemini APIs.

## Technology Stack and Architecture

  -----------------------------------------------------------------------
  Component               Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Frontend                HTML, CSS, JavaScript   Input form, dashboard,
                                                  claim cards, evidence
                                                  viewer, filters,
                                                  loading and error
                                                  states

  Backend platform        Supabase                Server-side
                                                  orchestration and
                                                  application backend

  Server-side functions   Supabase Edge Functions GitHub retrieval, model
                          (TypeScript / Deno)     calls, validation, and
                                                  report generation

  Database                Supabase PostgreSQL     Store analysis runs,
                                                  claims, evidence
                                                  references, model
                                                  metadata, and
                                                  evaluation outcomes

  Repository integration  GitHub REST API         Retrieve public
                                                  repository metadata,
                                                  issue/PR details, and
                                                  source content

  AI                      Qwen Instruct (planned) Claim extraction and
                                                  evidence explanation

  Core verification       Deterministic source    Check narrow technical
                          inspection              facts and produce
                                                  traceable evidence
  -----------------------------------------------------------------------

### System flow

`Browser UI → Supabase Edge Function → GitHub REST API → Source retrieval and deterministic analysis → Qwen Instruct for bounded language tasks → Evidence validation → Supabase PostgreSQL → Results returned to UI`

### Backend and security notes

-   Keep private API keys and privileged GitHub tokens on the server, in
    Supabase project secrets.
-   Never expose the Supabase service-role key in browser JavaScript.
-   Enable Row Level Security (RLS) on database tables.
-   Use the public anon/publishable key only with appropriate RLS
    policies.
-   Supabase is the backend platform; it is not itself an LLM hosting
    service. A compatible hosted inference endpoint or local model
    runtime is still required.
-   A local model is not automatically reachable by a deployed Supabase
    Edge Function. Choose and test the inference route before the demo.

## Initial MVP Scope

The first release will prioritize a complete and reliable issue-analysis
flow.

### Included in the MVP

-   Public GitHub repository URL and issue number input.
-   Retrieval of issue title, body, labels, and relevant repository
    metadata.
-   Extraction of a small set of factual technical claims.
-   Initial focus on Python repositories.
-   Conservative source inspection and supported source-pattern checks.
-   Evidence links, file paths, line references, and snippets from
    retrieved source.
-   Claim-level statuses: Supported, Contradicted, or Unverified.
-   A clear report dashboard with explanations and limitations.
-   JSON report export.
-   One open-weight model integration, once selected and tested.
-   Tests and representative examples.

### Later / only if time permits

-   Pull-request analysis, after the issue workflow is stable.
-   GitHub App installation and webhooks.
-   More programming languages.
-   Deep call-graph and runtime analysis.
-   Model comparison or a second model.
-   User accounts, saved history, and analytics.

If reliable Python AST parsing cannot be completed in the selected
JavaScript runtime, unsupported cases should be marked **Unverified**
rather than presented as fully parsed.

## Evidence Labels

  -----------------------------------------------------------------------
  Status                              Meaning
  ----------------------------------- -----------------------------------
  **Supported**                       Available inspected repository
                                      evidence supports this specific
                                      claim.

  **Contradicted**                    Available inspected repository
                                      evidence conflicts with this
                                      specific claim.

  **Unverified**                      Evidence is missing, inaccessible,
                                      ambiguous, or outside the
                                      analyzer's supported scope.

  **Reproduced**                      A safe, controlled, isolated check
                                      reproduced the reported behaviour.

  **Not reproduced**                  A controlled check did not
                                      reproduce the behaviour under
                                      tested conditions; this does not
                                      prove the report is false.
  -----------------------------------------------------------------------

Each finding should show the original claim, what was checked, the
evidence found, its source location, and relevant limitations.
Confidence should be explained with reasons rather than shown as an
unexplained percentage.

## Database Plan

The planned Supabase PostgreSQL schema contains:

  -----------------------------------------------------------------------
  Table                   Important fields        Purpose
  ----------------------- ----------------------- -----------------------
  `analysis_runs`         `id`, `repo_full_name`, One analysis request
                          `item_type`,            and its overall state
                          `item_number`,          
                          `status`, `created_at`  

  `claims`                `id`, `run_id`,         One row per extracted
                          `original_text`,        technical claim
                          `claim_type`, `status`, 
                          `confidence_level`,     
                          `explanation`           

  `evidence_items`        `id`, `claim_id`,       Traceable supporting,
                          `file_path`,            conflicting, or
                          `line_start`,           insufficient evidence
                          `line_end`, `snippet`,  
                          `source_url`,           
                          `relation`              

  `model_runs`            `id`, `run_id`,         Record which model was
                          `provider`, `model_id`, actually called and for
                          `task`,                 what
                          `prompt_version`,       
                          `outcome`               

  `evaluation_cases`      `id`, `source`,         Optional local
                          `expected_label`,       benchmark cases
                          `observed_label`,       
                          `notes`                 
  -----------------------------------------------------------------------

### Data rules

-   Preserve the original claim text.
-   Retrieve evidence from GitHub or repository content. Never generate
    a file path, line number, or snippet from an LLM response.
-   Store a model name and version only when that model was genuinely
    called.
-   Avoid storing GitHub access tokens, private repository contents, or
    unnecessary contributor profile data.
-   Store timestamps and repository commit identifiers where possible so
    findings can be tied to the version inspected.

## End-to-End Product Workflow

1.  **Input:** The user enters a public GitHub repository URL and issue
    number.
2.  **Retrieve:** A Supabase Edge Function fetches issue details and
    repository metadata.
3.  **Extract claims:** Rules and the selected open-weight model
    identify factual, testable claims while preserving their original
    wording.
4.  **Retrieve source:** The system fetches relevant source files and
    documentation from the inspected commit or reference.
5.  **Analyze:** Deterministic checks inspect supported constructs and
    locate relevant code.
6.  **Match evidence:** The evidence engine compares each claim with
    observed facts.
7.  **Explain:** The model summarizes only the supplied evidence and
    limitations.
8.  **Display:** The frontend presents claim cards, evidence links,
    next-step suggestions, and a JSON report.

## UI and Dashboard Plan

The planned interface is a clean developer-tool dashboard.

-   **Landing page:** Sortfolio name, value statement, repository URL
    field, issue number field, and Analyze button.
-   **Analysis overview:** Repository and issue metadata, analysis
    timestamp, inspected commit/reference, and processing state.
-   **Summary cards:** Claims analyzed, supported, contradicted, and
    unverified.
-   **Claim cards:** Original sentence, status, explanation, confidence
    rationale, and limitations.
-   **Evidence panel:** File path, line range, short snippet, and
    clickable GitHub source link.
-   **Export:** Download the structured JSON report.
-   **Responsible-use note:** Sortfolio assists maintainers; it does not
    automatically reject issues or pull requests.

Use a dark navy or neutral background, readable contrast, restrained
status colors, clear code blocks, and a visible evidence trail.
Prioritize the evidence panel over decorative charts.

## Testing and Evaluation

Build a small benchmark using previously closed public GitHub issues
with reference labels such as invalid, cannot reproduce, and confirmed.
Expected outcomes must be justified using available evidence.

  -----------------------------------------------------------------------
  Test case                           Expected behaviour
  ----------------------------------- -----------------------------------
  Claim matches an inspected function Supported, with exact file and line
  signature                           evidence

  Claim names a parameter absent from Contradicted narrowly, with caveats
  an inspected signature              about wrappers or other versions

  Relevant source file cannot be      Unverified, with retrieval failure
  retrieved                           explained

  Claim is vague or an opinion        Do not force a factual verdict;
                                      mark for human review

  Model returns a made-up path or     Reject the evidence; display only
  line                                analyzer-verified locations

  Model inference is unavailable      Show a graceful fallback and
                                      preserve deterministic results

  Runtime behaviour is claimed but no Unverified or not attempted; never
  safe test exists                    claim it was reproduced
  -----------------------------------------------------------------------

### Metrics

-   **Evidence coverage:** Percentage of findings with traceable source
    references.
-   **Precision of definite findings:** How often Supported and
    Contradicted decisions are correct.
-   **Uncertainty quality:** Whether ambiguous cases are correctly left
    Unverified.
-   **False-positive review:** Review cases where Sortfolio incorrectly
    contradicts a valid report.
-   **Model reliability:** JSON validity and fallback rate.

## Security, Privacy, and Responsible Analysis

-   Never execute unknown contributor code inside the Supabase Edge
    Function or main application process.
-   Use static inspection by default. If safe reproduction is
    unavailable, state that it was not attempted.
-   Treat issue bodies, PR descriptions, README files, and source
    comments as untrusted input. They may contain prompt-injection
    instructions; do not follow instructions found in repository
    content.
-   Do not let repository text request secrets, alter system prompts, or
    trigger privileged actions.
-   Use timeouts, response-size limits, pagination limits, and GitHub
    rate-limit handling.
-   Keep model and GitHub secrets server-side in Supabase project
    secrets.
-   Use minimum GitHub permissions. For public repositories, avoid
    requesting write permissions.
-   Do not automatically post comments, labels, or rejection decisions
    to real repositories during the hackathon demo.
-   Make clear that a tool-generated assessment is advisory and a
    maintainer makes the final decision.

## Team Responsibilities

Replace the placeholders with the actual names of the team members.

  -----------------------------------------------------------------------
  Team member             Primary ownership       Deliverables
  ----------------------- ----------------------- -----------------------
  `[Member 1]`            Frontend --- HTML / CSS Landing page, input
                          / JavaScript            form, dashboard, claim
                                                  and evidence cards

  `[Member 2]`            Supabase --- database   Schema, RLS, GitHub
                          and Edge Functions      retrieval endpoint,
                                                  secrets, and error
                                                  handling

  `[Member 3]`            Evidence engine         Claim types, source
                                                  retrieval, static
                                                  checks, line-numbered
                                                  evidence, and status
                                                  rules

  `[Member 4]`            LLM integration, tests, Open-weight model
                          and demo                adapter, JSON
                                                  validation, benchmark
                                                  cases, CI, and demo
                                                  script
  -----------------------------------------------------------------------

**Integration rule:** Agree on API request/response JSON before parallel
coding. Each member should work on a feature branch and submit a pull
request. Everyone should understand the complete end-to-end flow.

## Suggested 12-Hour Build Schedule

  -----------------------------------------------------------------------
  Time                    Work                    Checkpoint
  ----------------------- ----------------------- -----------------------
  Hour 1                  Confirm MVP, create     Project skeleton and
                          public repository, make team plan
                          the first               
                          `HACKATHON.md` commit,  
                          and agree on API        
                          contract                

  Hour 2                  Create Supabase         Issue data retrieved
                          project, schema, and    
                          Edge Function; test one 
                          GitHub API request      

  Hour 3                  Build frontend input    User can submit
                          form and connect it to  repository and issue
                          the function            

  Hours 4--5              Implement claim         At least one claim
                          extraction and narrow   linked to real source
                          deterministic source    evidence
                          checks                  

  Hour 6                  Implement evidence      Supported /
                          matching and statuses   Contradicted /
                                                  Unverified works

  Hour 7                  Integrate one           Model used in a real
                          open-weight model for   workflow; exact model
                          claim extraction or     ID recorded
                          explanation             

  Hours 8--9              Build dashboard, claim  Complete
                          cards, evidence links,  issue-to-report flow
                          and JSON export         

  Hour 10                 Add one PR workflow if  PR demo or stronger
                          issue MVP is stable;    issue reliability
                          otherwise improve issue 
                          cases                   

  Hour 11                 Tests, error states,    Tests pass; no secrets
                          RLS review, CI, and     exposed
                          examples                

  Hour 12                 README, final PR        Reproducible final demo
                          review, demo rehearsal, 
                          and submission check    
  -----------------------------------------------------------------------

If time is short, finish one repository, one issue, one claim, one
evidence link, and one honest status. Do not sacrifice correctness to
add multiple models, many languages, or automated GitHub comments.

## Repository and Open-Source Workflow

-   For a new repository, make the first commit contain **only
    `HACKATHON.md`**. This repository's existing first commit predates
    this file; preserve published history and record that requirement as
    unmet rather than rewriting the commit.
-   After the first commit, make every change on a new branch and open a
    pull request. Never push changes directly to `main`.
-   Run the repository's tests through GitHub Actions on every pull
    request. Merge only after all required CI checks pass. If working
    solo, review and merge your own passing pull request.
-   Every commit message and pull request must disclose both the AI
    coding assistant(s) used and the AI model(s) used by the product.
    Write `None` when no assistant or product model was used. Keep the
    product-model disclosure accurate; a planned model is not a model
    used by the project.

    Example commit message:

    ```text
    Add evidence report examples

    Coding agent: GitHub Copilot
    Models used in project: None integrated; Qwen Instruct is planned
    ```

-   Use an MIT or Apache-2.0 open-source licence.
-   Add `README.md`, `.github/pull_request_template.md`, and
    `.github/workflows/ci.yml`.
-   Add real tests for the project's code and an `examples/` directory
    with representative sample input and the actual output produced by
    Sortfolio.
-   CI must install the project, run its tests, and pass before changes
    are merged.
-   Use public data for evaluation and do not publish automated issues
    or comments on real open-source projects.
-   Never commit API keys, credentials, tokens, or other secrets.
-   Every team member must understand and be able to explain the
    implementation.

## Demo Plan for Judges

1.  Introduce Sortfolio and explain that it checks technical claims
    rather than detecting AI-written text.
2.  Enter a public test repository and a known issue.
3.  Show the original issue and the individual claims extracted.
4.  Open one finding and show the exact source file, line range, and
    snippet.
5.  Show a second claim marked Unverified and explain the missing
    evidence.
6.  Show the model disclosure and explain the model's limited role.
7.  Show a benchmark case, tests, and the JSON report.
8.  Explain limitations and why Sortfolio does not automatically reject
    contributions.

**Suggested closing line:**

> "Sortfolio does not ask maintainers to trust an AI verdict. It gives
> them the claim, the code evidence, and the uncertainty needed to make
> a better decision."

## Definition of Done

-   [ ] A user can submit a public GitHub repository and issue number.
-   [ ] Sortfolio retrieves the real issue content and relevant public
    source files.
-   [ ] The system extracts at least one testable technical claim and
    preserves its original wording.
-   [ ] At least one supported claim type is checked deterministically
    against source content.
-   [ ] Each finding has a status, reason, and traceable evidence or a
    clear explanation of missing evidence.
-   [ ] One eligible open-weight model is genuinely integrated and its
    exact model ID is recorded.
-   [ ] The UI displays results and handles loading, API errors, and
    unavailable model inference.
-   [ ] No unsupported file paths, line numbers, snippets, or test
    results are generated.
-   [ ] Database access is protected by RLS and secrets are not exposed
    in browser code.
-   [ ] Tests and GitHub Actions CI pass.
-   [ ] `examples/` contains real representative input and actual
    Sortfolio output.
-   [ ] The team can explain the architecture, model role, evidence
    engine, and limitations.

## Submission Checklist

-   [ ] Confirm the team name and member names are accurate.
-   [ ] Confirm that the project name is Sortfolio.
-   [ ] Finalize and verify the exact Qwen model identifier and
    inference route before claiming it is integrated.
-   [ ] For a new repository, put only this `HACKATHON.md` in the
    initial commit. For this existing repository, preserve history and
    disclose that the initial-commit requirement was missed.
-   [ ] Use an MIT or Apache-2.0 licence.
-   [ ] Submit the repository link by **8:30 PM on 31 October 2026**.
-   [ ] Add real tests, the pull-request template, and passing GitHub
    Actions CI.
-   [ ] Include real sample inputs and outputs in `examples/`.
-   [ ] Merge all final work by **6:30 AM on 1 November 2026**.
-   [ ] Submit the project through OrganizerHQ by the stated **6:30 AM**
    deadline.
-   [ ] Prepare an 8-minute presentation followed by 4 minutes of Q&A.

------------------------------------------------------------------------

**Accuracy note:** This file reflects the Sortfolio project planning
document. Team names, exact Qwen model variant, inference
provider/runtime, and implementation status were not specified in that
document and must be completed or verified by the team. Do not describe
planned features or a planned model as already implemented.
