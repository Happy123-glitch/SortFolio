// ==============================================================================
// Sortfolio Frontend API Client
// Handles interaction with Supabase Database and Edge Functions
// ==============================================================================

export class SortfolioAPI {
  /**
   * @param {Object} config
   * @param {string} config.supabaseUrl
   * @param {string} config.supabaseAnonKey
   * @param {Object} [config.supabaseClient]
   */
  constructor({ supabaseUrl, supabaseAnonKey, supabaseClient = null }) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseAnonKey = supabaseAnonKey;
    this.client = supabaseClient;
  }

  /**
   * Initializes the client if an external supabase instance is available.
   */
  initClient(supabaseClient) {
    this.client = supabaseClient;
  }

  /**
   * Trigger backend analysis of a public GitHub issue.
   * @param {string} repo - Format "owner/repository"
   * @param {number} issueNumber - Positive issue number
   * @returns {Promise<Object>}
   */
  async triggerAnalysis(repo, issueNumber) {
    const edgeFunctionUrl = `${this.supabaseUrl}/functions/v1/analyze-issue`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseAnonKey,
        'Authorization': `Bearer ${this.supabaseAnonKey}`,
      },
      body: JSON.stringify({ repo, issueNumber: Number(issueNumber) }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(err.error || err.message || `Analysis failed (${response.status})`);
    }

    return await response.json();
  }

  /**
   * Trigger backend analysis of a GitHub Pull Request (Secondary Workflow).
   * @param {string} repo - Format "owner/repository"
   * @param {number} prNumber - Positive pull request number
   * @returns {Promise<Object>}
   */
  async analyzePullRequest(repo, prNumber) {
    const edgeFunctionUrl = `${this.supabaseUrl}/functions/v1/analyze-pr`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseAnonKey,
        'Authorization': `Bearer ${this.supabaseAnonKey}`,
      },
      body: JSON.stringify({ repo, prNumber: Number(prNumber) }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(err.error || err.message || `PR analysis failed (${response.status})`);
    }

    return await response.json();
  }

  /**
   * Ask the Conversational Triage Assistant about the current issue or evidence.
   * @param {string} message - Maintainer question or prompt
   * @param {Object} report - Current analysis report context
   * @returns {Promise<Object>}
   */
  async askAssistant(message, report) {
    const edgeFunctionUrl = `${this.supabaseUrl}/functions/v1/chat-assistant`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseAnonKey,
        'Authorization': `Bearer ${this.supabaseAnonKey}`,
      },
      body: JSON.stringify({ message, report }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(err.error || err.message || `Assistant request failed (${response.status})`);
    }

    return await response.json();
  }


  /**
   * Fetch an existing completed analysis run with claims and evidence items.
   * @param {string} repo
   * @param {number} issueNumber
   * @returns {Promise<Object|null>}
   */
  async getAnalysis(repo, issueNumber) {
    if (!this.client) {
      // Fallback direct REST API query using anon key
      const queryUrl = `${this.supabaseUrl}/rest/v1/analysis_runs?repo_full_name=eq.${encodeURIComponent(repo)}&item_number=eq.${Number(issueNumber)}&order=created_at.desc&limit=1`;
      const res = await fetch(queryUrl, {
        headers: {
          'apikey': this.supabaseAnonKey,
          'Authorization': `Bearer ${this.supabaseAnonKey}`,
        },
      });
      if (!res.ok) return null;
      const runs = await res.json();
      if (!runs || runs.length === 0) return null;
      const run = runs[0];

      // Fetch claims
      const claimsUrl = `${this.supabaseUrl}/rest/v1/claims?run_id=eq.${run.id}&order=created_at.asc`;
      const claimsRes = await fetch(claimsUrl, {
        headers: {
          'apikey': this.supabaseAnonKey,
          'Authorization': `Bearer ${this.supabaseAnonKey}`,
        },
      });
      const claims = claimsRes.ok ? await claimsRes.json() : [];

      // Fetch evidence items for claims
      for (const claim of claims) {
        const evidenceUrl = `${this.supabaseUrl}/rest/v1/evidence_items?claim_id=eq.${claim.id}&order=created_at.asc`;
        const evidenceRes = await fetch(evidenceUrl, {
          headers: {
            'apikey': this.supabaseAnonKey,
            'Authorization': `Bearer ${this.supabaseAnonKey}`,
          },
        });
        claim.evidence = evidenceRes.ok ? await evidenceRes.json() : [];
      }

      return { run, claims };
    }

    // Using @supabase/supabase-js client if initialized
    const { data: runs, error: runError } = await this.client
      .from('analysis_runs')
      .select('*')
      .eq('repo_full_name', repo)
      .eq('item_number', issueNumber)
      .order('created_at', { ascending: false })
      .limit(1);

    if (runError || !runs || runs.length === 0) return null;
    const run = runs[0];

    const { data: claims, error: claimsError } = await this.client
      .from('claims')
      .select('*, evidence_items(*)')
      .eq('run_id', run.id)
      .order('created_at', { ascending: true });

    if (claimsError) return { run, claims: [] };

    return {
      run,
      claims: claims.map(c => ({
        ...c,
        evidence: c.evidence_items || [],
      })),
    };
  }

  /**
   * Returns curated preset sample problems for fast 1-click demos and judge review.
   * @returns {Promise<Array<Object>>}
   */
  async getPresetProblems() {
    try {
      const res = await fetch('/examples/preset_problems.json');
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback to embedded presets if fetch fails in offline or static file mode
    }

    return [
      {
        id: 'sample-flask-supported',
        title: 'Flask: add_url_rule parameter verification',
        badge: 'Supported Case',
        badgeType: 'success',
        repo: 'pallets/flask',
        issueNumber: 5240,
        claimText: 'add_url_rule accepts parameter provide_automatic_options',
        claimType: 'parameter_existence',
        targetFile: 'src/flask/app.py',
        expectedStatus: 'supported',
        description: 'Validates that Flask route function officially declares the automatic options argument.'
      },
      {
        id: 'sample-flask-contradicted',
        title: 'Flask: False claim about instance_path absence',
        badge: 'Contradicted Case',
        badgeType: 'danger',
        repo: 'pallets/flask',
        issueNumber: 4912,
        claimText: 'Flask.__init__ has no parameter named instance_path',
        claimType: 'parameter_existence',
        targetFile: 'src/flask/app.py',
        expectedStatus: 'contradicted',
        description: 'Catches a false bug report claiming instance_path is missing when it is in the signature.'
      },
      {
        id: 'sample-runtime-unverified',
        title: 'Requests: Vague OS-specific runtime crash',
        badge: 'Unverified Case',
        badgeType: 'warning',
        repo: 'psf/requests',
        issueNumber: 6180,
        claimText: 'Requests causes segfault in OpenSSL on custom embedded MIPS build',
        claimType: 'runtime_behavior',
        targetFile: 'requests/sessions.py',
        expectedStatus: 'unverified',
        description: 'Correctly flags runtime behavior as Unverified instead of guessing.'
      }
    ];
  }
}

if (typeof window !== 'undefined') {
  window.SortfolioAPI = SortfolioAPI;
}
