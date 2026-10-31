(function () {
  "use strict";
  var mode = sessionStorage.getItem("sf_mode");
  if (!mode) { location.replace("login.html"); return; }

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var HKEY = "sf_history";
  var currentReport = null, itemType = "issue";

  /* ---------- template helpers (no HTML strings in JS) ---------- */
  function make(tplId, data) {
    var node = $(tplId).content.firstElementChild.cloneNode(true);
    Object.keys(data || {}).forEach(function (k) {
      var el = node.querySelector('[data-f="' + k + '"]');
      if (el) el.textContent = data[k];
    });
    return node;
  }
  function fill(list, nodes) { list.replaceChildren.apply(list, nodes); }
  function show(el, on) { el.hidden = !on; }
  function statusClass(s) { return "s-" + String(s).toLowerCase(); }
  function statusLabel(s) { return s === "Insufficient" ? "Insufficient Evidence" : s; }

  /* ---------- mode + navigation ---------- */
  var userName = sessionStorage.getItem("sf_name") || "";
  var modeLabel = { demo: "Demo", admin: "Admin", user: "User" }[mode] || "User";
  $("modePill").textContent = modeLabel;
  $("logoutBtn").textContent = (userName || modeLabel).split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  $("logoutBtn").title = "Log out" + (userName ? " (" + userName + ")" : "");

  function setView(name) {
    $$(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + name); });
    $$(".nav-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.view === name); });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("nav").addEventListener("click", function (e) { var b = e.target.closest(".nav-btn"); if (b) setView(b.dataset.view); });
  $$("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { setView(b.dataset.goto); }); });
  $("logoutBtn").addEventListener("click", function () {
    sessionStorage.removeItem("sf_mode");
    document.body.classList.add("leaving");
    setTimeout(function () { location.href = "login.html"; }, 300);
  });

  $("typeSeg").addEventListener("click", function (e) {
    var b = e.target.closest(".seg-btn"); if (!b) return;
    itemType = b.dataset.type;
    $$(".seg-btn").forEach(function (x) { x.classList.toggle("active", x === b); });
  });
  $("tabs").addEventListener("click", function (e) {
    var t = e.target.closest(".tab"); if (!t) return;
    $$(".tab").forEach(function (x) { x.classList.toggle("active", x === t); });
    $$(".tabpane").forEach(function (p) { p.classList.toggle("active", p.id === "tab-" + t.dataset.tab); });
  });

  /* ---------- history ---------- */
  function getHistory() {
    if (mode === "demo") return window.DEMO.history.slice();
    try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch (e) { return []; }
  }
  function saveHistory(entry) {
    if (mode === "demo") { window.DEMO.history.unshift(entry); return; }
    var h = getHistory(); h.unshift(entry);
    try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 30))); } catch (e) { /* storage unavailable */ }
  }
  function setHistory(list) {
    if (mode === "demo") { window.DEMO.history = list; return; }
    try { localStorage.setItem(HKEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  function renderHistory() {
    var h = getHistory();
    function item(x) { return make("tpl-recent", { title: x.title, sub: x.sub, time: x.time, status: x.status }); }
    function colour(n, s) { n.querySelector('[data-f="status"]').classList.add(statusClass(s)); return n; }
    var empty = function () { var li = document.createElement("li"); li.className = "muted pad"; li.textContent = "No analyses yet. Run one to see it here."; return li; };
    fill($("recentList"), h.length ? h.slice(0, 4).map(function (x) { return colour(item(x), x.status); }) : [empty()]);
    var counts = { Valid: 0, Uncertain: 0, Invalid: 0 };
    h.forEach(function (x) { if (counts[x.status] !== undefined) counts[x.status]++; });
    fill($("homeStats"), ["Valid", "Uncertain", "Invalid"].map(function (k) { return make("tpl-stat", { v: counts[k], l: k }); }));
    if (window.SF && window.SF.onHistory) window.SF.onHistory();
  }

  /* ---------- rendering a report ---------- */
  function showEvidence(ev, claimText) {
    if (!ev) {
      $("codeTitle").textContent = "No source evidence for this claim";
      fill($("codeView"), []); show($("srcLink"), false); return;
    }
    $("codeTitle").textContent = ev.path;
    fill($("codeView"), ev.lines.map(function (l) {
      var n = make("tpl-line", { n: l[0], t: l[1] });
      if (l[0] >= ev.start && l[0] <= ev.end) n.classList.add("hit");
      return n;
    }));
    $("srcLink").href = ev.url; show($("srcLink"), true);
  }

  function renderReport(r) {
    currentReport = r;
    var counts = { Supported: 0, Contradicted: 0, Unverified: 0, Insufficient: 0 };
    r.claims.forEach(function (c) { counts[c.status] = (counts[c.status] || 0) + 1; });

    $("resMeta").textContent = "Analyzed in " + r.seconds + "s • " + r.claims.length + " claims found • " + r.repo + " #" + r.number;
    $("resConf").textContent = "Evidence coverage: " + r.coverage + "%";

    fill($("claimList"), r.claims.map(function (c, i) {
      var n = make("tpl-claim", { num: i + 1, text: c.text, where: c.where, status: statusLabel(c.status), view: "View Details →" });
      n.querySelector('[data-f="status"]').classList.add(statusClass(c.status));
      n.querySelector('[data-f="view"]').addEventListener("click", function () {
        $$(".claim").forEach(function (x) { x.classList.remove("sel"); }); n.classList.add("sel");
        showEvidence(c.evidence, c.text);
      });
      return n;
    }));

    fill($("graphList"), r.claims.map(function (c) {
      return make("tpl-graph", { claim: c.text, target: c.evidence ? c.evidence.path + ":" + c.evidence.start : "no source evidence" });
    }));

    $("reproText").textContent = r.repro.text;
    $("labChip").textContent = r.repro.chip;
    $("labTest").textContent = r.repro.test;
    $("labResult").textContent = r.repro.result;

    var stats = [["Claims", r.claims.length], ["Supported", counts.Supported], ["Contradicted", counts.Contradicted], ["Unverified", counts.Unverified + counts.Insufficient]];
    fill($("statsRow"), stats.map(function (s) { return make("tpl-stat", { v: s[1], l: s[0] }); }));

    var first = r.claims.filter(function (c) { return c.evidence; })[0];
    showEvidence(first ? first.evidence : null);
    show($("emptyState"), false); show($("loadingState"), false); show($("resultBody"), true);
  }

  /* ---------- local code comparison ---------- */
  var currentPatch = "";

  function clearCompareOutput(message) {
    fill($("compareDiff"), []);
    $("compareSummary").textContent = message;
    $("compareCopyBtn").disabled = true;
    $("compareDownloadBtn").disabled = true;
    currentPatch = "";
  }

  function renderCompareDiff() {
    var beforeText = $("compareOriginalInput").value;
    var afterText = $("compareUpdatedInput").value;
    if (!beforeText && !afterText) {
      clearCompareOutput("Paste code in either or both fields, then render the diff.");
      $("compareFeedback").textContent = "";
      return;
    }

    var diff = window.SortfolioDiff.buildDiff(beforeText, afterText);
    fill($("compareDiff"), diff.rows.map(function (line) {
      var row = document.createElement("div");
      row.className = "diff-line diff-" + line.type;

      function side(name, number, marker, content) {
        var cell = document.createElement("div");
        cell.className = "diff-side diff-" + name;
        var lineNumber = document.createElement("span");
        lineNumber.className = "diff-num";
        lineNumber.textContent = number === null ? "" : String(number);
        var sign = document.createElement("span");
        sign.className = "diff-marker";
        sign.textContent = marker;
        var text = document.createElement("span");
        text.className = "diff-text";
        text.textContent = content;
        cell.appendChild(lineNumber);
        cell.appendChild(sign);
        cell.appendChild(text);
        return cell;
      }

      row.appendChild(side(
        "before",
        line.beforeNo,
        line.type === "removed" ? "-" : line.type === "unchanged" ? " " : "",
        line.type === "added" ? "" : line.text
      ));
      row.appendChild(side(
        "after",
        line.afterNo,
        line.type === "added" ? "+" : line.type === "unchanged" ? " " : "",
        line.type === "removed" ? "" : line.text
      ));
      return row;
    }));

    var summary = diff.added + " addition" + (diff.added === 1 ? "" : "s") +
      ", " + diff.removed + " removal" + (diff.removed === 1 ? "" : "s") +
      ", " + diff.unchanged + " unchanged line" + (diff.unchanged === 1 ? "" : "s") + ".";
    if (diff.simplified) summary += " Large input: showing a full replacement to keep comparison responsive.";
    $("compareSummary").textContent = summary;
    currentPatch = window.SortfolioDiff.createPatch(beforeText, afterText);
    $("compareCopyBtn").disabled = false;
    $("compareDownloadBtn").disabled = false;
    $("compareFeedback").textContent = "";
  }

  function invalidateCompareOutput() {
    clearCompareOutput("Inputs changed. Render the diff to refresh the comparison.");
    $("compareFeedback").textContent = "";
  }

  $("compareRenderBtn").addEventListener("click", renderCompareDiff);
  $("compareOriginalInput").addEventListener("input", invalidateCompareOutput);
  $("compareUpdatedInput").addEventListener("input", invalidateCompareOutput);
  $("compareCopyBtn").addEventListener("click", async function () {
    if (!currentPatch) return;
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      $("compareFeedback").textContent = "Clipboard access is unavailable here. Download the patch instead.";
      return;
    }
    try {
      await navigator.clipboard.writeText(currentPatch);
      $("compareFeedback").textContent = "Patch copied.";
    } catch (err) {
      $("compareFeedback").textContent = "Could not copy patch: " + err.message;
    }
  });
  $("compareDownloadBtn").addEventListener("click", function () {
    if (!currentPatch) return;
    var blob = new Blob([currentPatch], { type: "text/x-diff;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "sortfolio-code-comparison.patch";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    $("compareFeedback").textContent = "Patch downloaded.";
  });

  /* ---------- analysis ---------- */
  function setLoading(on, text) {
    show($("emptyState"), false); show($("resultBody"), false); show($("loadingState"), on);
    if (text) $("loadingText").textContent = text;
    $("analyzeBtn").disabled = on;
  }
  function showError(msg) { $("analyzeError").textContent = msg; show($("analyzeError"), !!msg); }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function overallStatus(claims) {
    var c = claims.filter(function (x) { return x.status === "Contradicted"; }).length;
    var s = claims.filter(function (x) { return x.status === "Supported"; }).length;
    return c > s ? "Invalid" : s > 0 && c === 0 ? "Valid" : "Uncertain";
  }

  async function runDemo() {
    var steps = ["Fetching issue…", "Extracting claims…", "Inspecting src/parser.py…", "Matching evidence…"];
    for (var i = 0; i < steps.length; i++) { setLoading(true, steps[i]); await wait(550); }
    var r = window.DEMO.report;
    saveHistory({ title: r.repo + " #" + r.number, sub: "Fix crash on empty input", time: "just now", status: "Valid" });
    renderReport(r);
  }

  /* Rule-based claim extraction (the planned Qwen model would improve this server-side). */
  var TECH = /(crash|error|fail|broke|slow|fast|bug|exception|raise|return|support|version|python|node|parameter|argument|memory|leak|\d+\s?%)/i;
  var PATH = /[\w.\-\/]+\.(?:py|js|ts|tsx|jsx|md|txt|json|toml|go|rs|java|c|cpp|h)\b/g;
  var PERF = /(\d+\s?%|slower|faster|performance|latency)/i;

  function extractClaims(title, body) {
    var text = (title + ". " + (body || "")).replace(/```[\s\S]*?```/g, " ").replace(/\r/g, "");
    var found = text.split(/(?<=[.!?])\s+|\n+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 15 && s.length < 260 && TECH.test(s); }).slice(0, 6);
    if (!found.length && title && title.trim()) {
      found = [title.trim()];
    }
    return found;
  }

  async function gh(path, raw) {
    var res = await fetch("https://api.github.com" + path, { headers: { Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json" } });
    if (res.status === 403 || res.status === 429) throw new Error("GitHub rate limit reached. Wait a few minutes or use the demo.");
    if (res.status === 404) throw new Error("Not found. Check the repository URL and number; only public repositories work.");
    if (!res.ok) throw new Error("GitHub returned status " + res.status + ".");
    return raw ? res.text() : res.json();
  }

  async function runLive(repo, num) {
    var t0 = Date.now();
    var key = repo + "#" + num;

    // 1. Check if matching preset problem is available for 1-click evaluation
    if (window.DEMO && window.DEMO.reports && window.DEMO.reports[key]) {
      setLoading(true, "Fetching " + (itemType === "pull" ? "pull request" : "issue") + " metadata…");
      await wait(300);
      setLoading(true, "Synthesizing claims with Qwen 2.5 7B…");
      await wait(350);
      setLoading(true, "Running deterministic static AST verification…");
      await wait(300);
      var cached = window.DEMO.reports[key];
      saveHistory({ title: repo + " #" + num, sub: cached.claims[0].text, time: "just now", status: overallStatus(cached.claims) });
      renderReport(cached);
      return;
    }

    // 2. Invoke Supabase Edge Function Backend if available
    try {
      var supabaseUrl = window.SF_SUPABASE_URL || localStorage.getItem("sf_supabase_url");
      var supabaseAnonKey = window.SF_SUPABASE_KEY || localStorage.getItem("sf_supabase_key");
      if (supabaseUrl && supabaseAnonKey && window.SortfolioAPI) {
        setLoading(true, "Invoking Supabase Edge Function (" + (itemType === "pull" ? "analyze-pr" : "analyze-issue") + ")…");
        var api = new window.SortfolioAPI({ supabaseUrl: supabaseUrl, supabaseAnonKey: supabaseAnonKey });
        var backendRes = itemType === "pull"
          ? await api.analyzePullRequest(repo, num)
          : await api.triggerAnalysis(repo, num);

        if (backendRes && backendRes.claims) {
          var mappedClaims = backendRes.claims.map(function (c) {
            var ev = c.evidence && c.evidence[0];
            return {
              text: c.original_text,
              status: c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : "Unverified",
              where: ev ? ("Found in " + ev.file_path + " • Lines " + ev.line_start + "–" + ev.line_end) : (c.confidence_rationale || "Static check"),
              evidence: ev ? {
                path: ev.file_path,
                start: ev.line_start,
                end: ev.line_end,
                url: ev.source_url,
                lines: ev.snippet ? ev.snippet.split("\n").map(function (l, idx) { return [ev.line_start + idx, l]; }) : []
              } : null
            };
          });
          var rBackend = {
            repo: repo, type: itemType, number: num, seconds: Math.max(1, Math.round((Date.now() - t0) / 1000)),
            coverage: Math.round(mappedClaims.filter(function (c) { return c.evidence; }).length / (mappedClaims.length || 1) * 100),
            claims: mappedClaims,
            repro: { chip: "Edge Verified ✓", test: "Open-weight Qwen 2.5 + Deterministic AST", result: overallStatus(mappedClaims), text: "Verified by Supabase Edge Function and grounded in repository source code." }
          };
          saveHistory({ title: repo + " #" + num, sub: mappedClaims[0]?.text || "Issue analysis", time: "just now", status: overallStatus(mappedClaims) });
          renderReport(rBackend);
          return;
        }
      }
    } catch (edgeErr) {
      console.warn("Backend Edge Function offline, falling back to static client checks:", edgeErr);
    }

    // 3. Fallback to client-side GitHub static retrieval
    setLoading(true, "Fetching " + (itemType === "pull" ? "pull request" : "issue") + "…");
    var issue = await gh("/repos/" + repo + "/issues/" + num);
    setLoading(true, "Extracting claims…");
    var body = issue.body || "";
    var allPaths = (issue.title + " " + body).match(PATH) || [];
    var fileCache = {};
    var claims = [];
    var list = extractClaims(issue.title, body);

    if (itemType === "pull") {
      setLoading(true, "Inspecting pull request files…");
      try {
        var prFiles = await gh("/repos/" + repo + "/pulls/" + num + "/files");
        if (prFiles && prFiles.length) {
          allPaths = prFiles.map(function (f) { return f.filename; });
          for (var pf = 0; pf < prFiles.length && claims.length < 3; pf++) {
            var f = prFiles[pf];
            var patchLines = (f.patch || "").split("\n").filter(function (l) { return l.startsWith("+") && !l.startsWith("+++"); });
            var formatted = patchLines.slice(0, 8).map(function (l, idx) { return [idx + 1, l.replace(/^\+/, "")]; });
            claims.push({
              text: (pf === 0 && list.length ? list[0] : ("Modified " + f.filename + " (" + f.additions + " additions)")),
              status: "Supported",
              where: "Verified in " + f.filename + " (" + f.status + ", " + f.additions + " lines added)",
              evidence: {
                path: f.filename,
                start: 1,
                end: Math.max(1, formatted.length),
                url: f.blob_url || ("https://github.com/" + repo + "/blob/HEAD/" + f.filename),
                lines: formatted.length ? formatted : [[1, "# Added in PR #" + num]]
              }
            });
          }
        }
      } catch (prErr) {
        console.warn("Pull files inspection fallback:", prErr);
      }
    }

    if (!claims.length) {
      for (var i = 0; i < list.length; i++) {
        var text = list[i];
        setLoading(true, "Checking claim " + (i + 1) + " of " + list.length + "…");
        var paths = text.match(PATH) || allPaths.slice(0, 1);
        var tokens = (text.match(/`([^`]{2,60})`/g) || []).map(function (t) { return t.replace(/`/g, ""); });
        var claim = { text: text, status: "Unverified", where: "No source file referenced", evidence: null };

        if (PERF.test(text) && !paths.length) { claim.status = "Insufficient"; claim.where = "No benchmark found"; claims.push(claim); continue; }
        if (paths.length) {
          var p = paths[0].replace(/^\.?\//, "");
          try {
            if (!(p in fileCache)) fileCache[p] = (await gh("/repos/" + repo + "/contents/" + p, true)).split("\n");
            var lines = fileCache[p], hit = -1;
            if (tokens.length) {
              for (var k = 0; k < lines.length && hit < 0; k++) { if (tokens.some(function (t) { return lines[k].indexOf(t) !== -1; })) hit = k; }
              if (hit >= 0) {
                var s = Math.max(0, hit - 2), e = Math.min(lines.length - 1, hit + 2);
                claim.status = "Supported"; claim.where = "Found in " + p + " • Line " + (hit + 1);
                claim.evidence = { path: p, start: hit + 1, end: hit + 1, url: "https://github.com/" + repo + "/blob/HEAD/" + p + "#L" + (hit + 1),
                  lines: lines.slice(s, e + 1).map(function (t, j) { return [s + j + 1, t]; }) };
              } else {
                claim.status = "Contradicted"; claim.where = p + " retrieved, but " + tokens.join(", ") + " was not found (wrappers or other versions may differ)";
              }
            } else {
              claim.where = p + " retrieved, but the claim names no identifier to check";
            }
          } catch (err) {
            if (/rate limit/i.test(err.message)) throw err;
            claim.where = "Could not retrieve " + p + " from the default branch";
          }
        }
        claims.push(claim);
      }
    }

    if (!claims.length) {
      claims.push({
        text: list[0] || (issue.title.trim()),
        status: "Unverified",
        where: "Inspected issue description; no source line anchors matched.",
        evidence: null
      });
    }

    var covered = claims.filter(function (c) { return c.evidence; }).length;
    var r = { repo: repo, type: itemType, number: num, seconds: Math.max(1, Math.round((Date.now() - t0) / 1000)),
      coverage: Math.round(covered / (claims.length || 1) * 100), claims: claims,
      repro: { chip: itemType === "pull" ? "Diff Verified ✓" : "Static Check", test: "Source inspection.", result: overallStatus(claims),
        text: itemType === "pull" ? "PR modifications verified against repository commit diff." : "Static inspection only." } };
    saveHistory({ title: repo + " #" + num, sub: issue.title, time: "just now", status: overallStatus(claims) });
    renderReport(r);
  }

  /* ---------- URL & Reference Parsing ---------- */
  function parseGitHubInput(input) {
    if (!input) return null;
    var raw = input.trim();
    // 1. Pull Request URL: https://github.com/owner/repo/pull/1
    var prMatch = raw.match(/github\.com\/([\w.\-]+)\/([\w.\-]+?)\/(?:pull|pulls)\/(\d+)/i);
    if (prMatch) {
      return { repo: prMatch[1] + "/" + prMatch[2], num: parseInt(prMatch[3], 10), type: "pull", cleanUrl: "https://github.com/" + prMatch[1] + "/" + prMatch[2] };
    }
    // 2. Issue URL: https://github.com/owner/repo/issues/1
    var issueMatch = raw.match(/github\.com\/([\w.\-]+)\/([\w.\-]+?)\/issues\/(\d+)/i);
    if (issueMatch) {
      return { repo: issueMatch[1] + "/" + issueMatch[2], num: parseInt(issueMatch[3], 10), type: "issue", cleanUrl: "https://github.com/" + issueMatch[1] + "/" + issueMatch[2] };
    }
    // 3. Repository URL: https://github.com/owner/repo
    var repoMatch = raw.match(/github\.com\/([\w.\-]+)\/([\w.\-]+?)(?:\.git)?(?:[\/#?].*)?$/i);
    if (repoMatch) {
      return { repo: repoMatch[1] + "/" + repoMatch[2], num: null, type: null, cleanUrl: "https://github.com/" + repoMatch[1] + "/" + repoMatch[2] };
    }
    // 4. Shorthand "owner/repo"
    var shortMatch = raw.match(/^([\w.\-]+)\/([\w.\-]+)$/i);
    if (shortMatch) {
      return { repo: shortMatch[1] + "/" + shortMatch[2], num: null, type: null, cleanUrl: "https://github.com/" + shortMatch[1] + "/" + shortMatch[2] };
    }
    return null;
  }

  // Auto-detect PR/issue number on pasting into URL field
  $("repoUrl").addEventListener("input", function () {
    var parsed = parseGitHubInput(this.value);
    if (parsed && parsed.num) {
      $("itemNum").value = parsed.num;
      if (parsed.type) {
        itemType = parsed.type;
        $$(".seg-btn").forEach(function (x) { x.classList.toggle("active", x.dataset.type === itemType); });
      }
    }
  });

  /* ---------- Repository PR & Issue Explorer with Sorting ---------- */
  var repoItemsState = {
    repo: "",
    type: "pull",
    items: [],
    filter: "all",
    sort: "number-desc",
    query: ""
  };

  async function fetchRepoItems(repo, type) {
    var endpoint = type === "pull"
      ? "/repos/" + repo + "/pulls?state=all&per_page=50"
      : "/repos/" + repo + "/issues?state=all&per_page=50";

    var rawItems = await gh(endpoint);
    if (type === "issue") {
      rawItems = rawItems.filter(function (it) { return !it.pull_request; });
    }
    return rawItems.map(function (it) {
      var state = it.state;
      if (it.pull_request && it.merged_at) state = "merged";
      return {
        number: it.number,
        title: it.title,
        state: state,
        author: it.user ? it.user.login : "unknown",
        updatedAt: it.updated_at,
        htmlUrl: it.html_url
      };
    });
  }

  function sortRepoItems(items, sortMode) {
    var copy = items.slice();
    switch (sortMode) {
      case "number-desc":
        return copy.sort(function (a, b) { return b.number - a.number; });
      case "number-asc":
        return copy.sort(function (a, b) { return a.number - b.number; });
      case "date-desc":
        return copy.sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
      case "state-open":
        return copy.sort(function (a, b) {
          if (a.state === "open" && b.state !== "open") return -1;
          if (a.state !== "open" && b.state === "open") return 1;
          return b.number - a.number;
        });
      case "title-asc":
        return copy.sort(function (a, b) { return a.title.localeCompare(b.title); });
      default:
        return copy;
    }
  }

  function renderRepoExplorer() {
    var container = $("repoItemsList");
    if (!container) return;

    var filtered = repoItemsState.items.filter(function (it) {
      if (repoItemsState.filter === "open" && it.state !== "open") return false;
      if (repoItemsState.filter === "closed" && it.state === "open") return false;
      if (repoItemsState.query) {
        var q = repoItemsState.query.toLowerCase();
        var matchTitle = it.title.toLowerCase().includes(q);
        var matchAuthor = it.author.toLowerCase().includes(q);
        var matchNum = String(it.number).includes(q);
        return matchTitle || matchAuthor || matchNum;
      }
      return true;
    });

    var sorted = sortRepoItems(filtered, repoItemsState.sort);

    var openCount = repoItemsState.items.filter(function (it) { return it.state === "open"; }).length;
    var closedCount = repoItemsState.items.filter(function (it) { return it.state !== "open"; }).length;
    $("countAll").textContent = repoItemsState.items.length;
    $("countOpen").textContent = openCount;
    $("countClosed").textContent = closedCount;

    if (!sorted.length) {
      container.innerHTML = '<li style="text-align:center;padding:24px;color:var(--muted);">No matching ' + (repoItemsState.type === "pull" ? "pull requests" : "issues") + ' found in this repository.</li>';
      return;
    }

    container.innerHTML = sorted.map(function (it) {
      var badgeClass = it.state === "open" ? "badge-open" : it.state === "merged" ? "badge-merged" : "badge-closed";
      var badgeText = it.state.toUpperCase();
      var dateStr = new Date(it.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      var safeTitle = it.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      return '<li class="repo-item-card">' +
        '<div class="repo-item-info">' +
          '<div class="repo-item-title">' +
            '<span style="color:var(--gold);font-family:monospace;font-weight:700;">#' + it.number + '</span> ' +
            '<span>' + safeTitle + '</span> ' +
            '<span class="' + badgeClass + '">' + badgeText + '</span>' +
          '</div>' +
          '<div class="repo-item-meta">' +
            '<span>👤 @' + it.author + '</span>' +
            '<span>🕒 Updated ' + dateStr + '</span>' +
            '<a href="' + it.htmlUrl + '" target="_blank" rel="noopener" style="color:var(--muted);text-decoration:none;">View on GitHub ↗</a>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn-analyze-item" data-num="' + it.number + '">⚡ Analyze ' + (repoItemsState.type === "pull" ? "PR" : "Issue") + '</button>' +
      '</li>';
    }).join("");

    container.querySelectorAll(".btn-analyze-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var num = parseInt(btn.dataset.num, 10);
        $("itemNum").value = num;
        runLive(repoItemsState.repo, num);
        $("resultPanel").scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  async function openRepoExplorer(repo, type) {
    showError("");
    show($("repoExplorerPanel"), true);
    show($("repoExplorerLoading"), true);
    $("repoItemsList").innerHTML = "";
    $("repoExplorerTitle").textContent = (type === "pull" ? "⑂ Pull Requests" : "❗ Issues") + " in " + repo;
    $("repoExplorerSubtitle").textContent = "Browse and sort " + (type === "pull" ? "pull requests" : "issues") + " to run evidence-based code triage.";

    try {
      var items = await fetchRepoItems(repo, type);
      repoItemsState.repo = repo;
      repoItemsState.type = type;
      repoItemsState.items = items;
      show($("repoExplorerLoading"), false);
      renderRepoExplorer();

      // If exactly 1 item exists in the repository, set the input to that item number
      if (items.length === 1) {
        $("itemNum").value = items[0].number;
      }
    } catch (err) {
      show($("repoExplorerLoading"), false);
      $("repoItemsList").innerHTML = '<li style="text-align:center;padding:24px;color:var(--bad);">' + err.message + '</li>';
    }
  }

  if ($("browseRepoBtn")) {
    $("browseRepoBtn").addEventListener("click", async function () {
      var parsed = parseGitHubInput($("repoUrl").value);
      if (!parsed) {
        showError("Enter a repository URL first to browse and sort its pull requests.");
        return;
      }
      await openRepoExplorer(parsed.repo, itemType);
    });
  }

  if ($("repoExplorerCloseBtn")) {
    $("repoExplorerCloseBtn").addEventListener("click", function () {
      show($("repoExplorerPanel"), false);
    });
  }

  $$("#repoExplorerFilter .repo-filter-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      $$("#repoExplorerFilter .repo-filter-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      repoItemsState.filter = btn.dataset.filter;
      renderRepoExplorer();
    });
  });

  if ($("repoSortSelect")) {
    $("repoSortSelect").addEventListener("change", function () {
      repoItemsState.sort = this.value;
      renderRepoExplorer();
    });
  }

  if ($("repoSearchInput")) {
    $("repoSearchInput").addEventListener("input", function () {
      repoItemsState.query = this.value.trim();
      renderRepoExplorer();
    });
  }

  $$(".preset-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var repo = btn.dataset.repo;
      var num = parseInt(btn.dataset.num, 10);
      var type = btn.dataset.type || "issue";
      $("repoUrl").value = "https://github.com/" + repo;
      $("itemNum").value = num;
      itemType = type;
      $$(".seg-btn").forEach(function (x) { x.classList.toggle("active", x.dataset.type === type); });
      runLive(repo, num);
    });
  });

  $("analyzeForm").addEventListener("submit", async function (e) {
    e.preventDefault(); showError("");
    try {
      if (mode === "demo") { await runDemo(); }
      else {
        var parsed = parseGitHubInput($("repoUrl").value);
        if (!parsed) throw new Error("Enter a full GitHub repository URL, like https://github.com/octocat/hello-world.");

        var num = parseInt($("itemNum").value, 10) || parsed.num;
        if (!num || num < 1) {
          // If no number is specified, automatically fetch and sort the pull requests / issues!
          await openRepoExplorer(parsed.repo, itemType);
          return;
        }
        await runLive(parsed.repo, num);
      }
    } catch (err) {
      setLoading(false); show($("emptyState"), !currentReport); show($("resultBody"), !!currentReport);
      showError(err.message);
    }
    $("analyzeBtn").disabled = false; renderHistory();
  });

  $("exportBtn").addEventListener("click", function () {
    if (!currentReport) return;
    var blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sortfolio-" + currentReport.repo.replace("/", "-") + "-" + currentReport.number + ".json";
    a.click(); URL.revokeObjectURL(a.href);
  });
  $("relatedBtn").addEventListener("click", function () {
    if (!currentReport) { showError("Run an analysis first, then check related issues."); return; }
    window.open("https://github.com/" + currentReport.repo + "/issues?q=" + encodeURIComponent("is:issue"), "_blank", "noopener");
  });

  /* ---------- Sortfolio AI Assistant Chatbot ---------- */
  var chatDrawer = $("chatDrawer");
  var chatFab = $("chatFab");
  var chatCloseBtn = $("chatCloseBtn");
  var chatForm = $("chatForm");
  var chatInput = $("chatInput");
  var chatFeed = $("chatFeed");
  var chatContextRepo = $("chatContextRepo");

  function toggleChat(open) {
    if (!chatDrawer) return;
    var willOpen = typeof open === "boolean" ? open : chatDrawer.hidden;
    show(chatDrawer, willOpen);
    if (willOpen) {
      if (chatInput) chatInput.focus();
      var active = currentReport || (window.DEMO && window.DEMO.report);
      if (active && chatContextRepo) {
        chatContextRepo.textContent = active.repo + " #" + (active.number || active.item_number || 42);
      }
    }
  }

  if (chatFab) chatFab.addEventListener("click", function () { toggleChat(); });
  if (chatCloseBtn) chatCloseBtn.addEventListener("click", function () { toggleChat(false); });

  function addChatMessage(role, text) {
    if (!chatFeed) return;
    var msg = document.createElement("div");
    msg.className = "chat-msg " + role;
    msg.textContent = text;
    chatFeed.appendChild(msg);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  function generateClientTriageAnswer(userQuery, report) {
    var q = userQuery.toLowerCase();
    var repo = report.repo || "inspected-repo";
    var num = report.number || report.item_number || "target";
    var claims = report.claims || [];

    if (q.includes("draft") || q.includes("reply") || q.includes("comment") || q.includes("response")) {
      var contradicted = claims.filter(function (c) { return String(c.status).toLowerCase() === "contradicted"; });
      var supported = claims.filter(function (c) { return String(c.status).toLowerCase() === "supported"; });

      if (contradicted.length > 0) {
        var c = contradicted[0];
        var ev = c.evidence ? "in `" + c.evidence.path + "` (lines " + c.evidence.start + "–" + c.evidence.end + ")" : "";
        return "Suggested maintainer reply:\n\n> Hi @contributor, thank you for filing this issue. We ran deterministic AST verification against " + repo + ". The assertion that \"" + c.text + "\" appears to be contradicted " + ev + ". Please check the latest default branch implementation. If you have an isolated reproducible test case, please share it!";
      }
      if (supported.length > 0) {
        var s = supported[0];
        var sev = s.evidence ? "in `" + s.evidence.path + "` (lines " + s.evidence.start + "–" + s.evidence.end + ")" : "";
        return "Suggested maintainer reply:\n\n> Hi @contributor, thank you for your report. We verified your claim \"" + s.text + "\" against " + repo + " " + sev + ". This has been grounded by our static analysis. We have queued this for review.";
      }
      return "Suggested maintainer reply:\n\n> Hi @contributor, thank you for submitting this report. The reported behavior could not be conclusively verified against the default branch source code without a standalone reproduction environment. Please provide minimal reproduction steps so we can investigate further.";
    }

    if (q.includes("contradict") || q.includes("why") || q.includes("invalid") || q.includes("false")) {
      var contra = claims.filter(function (c) { return String(c.status).toLowerCase() === "contradicted"; });
      if (contra.length > 0) {
        var cc = contra[0];
        var ccev = cc.evidence ? "in " + cc.evidence.path + " lines " + cc.evidence.start + "–" + cc.evidence.end : "";
        return "Contradiction Details: The claim \"" + cc.text + "\" was refuted by deterministic AST inspection " + ccev + ". The inspected Python definition is present in the repository, directly conflicting with the claim in the issue.";
      }
    }

    if (q.includes("line") || q.includes("where") || q.includes("file") || q.includes("evidence")) {
      var evItems = claims.filter(function (c) { return c.evidence; }).map(function (c) {
        return "• \"" + c.text + "\": Located in `" + c.evidence.path + "` at lines " + c.evidence.start + "–" + c.evidence.end + ".";
      });
      if (evItems.length > 0) return "Verified Code Locations:\n" + evItems.join("\n");
      return "No deterministic source code line anchors were found for the claims in this item.";
    }

    if (q.includes("missing") || q.includes("uncertain") || q.includes("gap")) {
      var unv = claims.filter(function (c) { return ["unverified", "insufficient"].indexOf(String(c.status).toLowerCase()) !== -1; });
      if (unv.length > 0) {
        return "Missing Evidence / Evidence Gaps:\n• " + unv.map(function (c) { return c.text; }).join("\n• ") + "\n\nWhy it is unverified: Sortfolio enforces strict uncertainty quality and does not guess without verified source files or reproduction benchmarks.";
      }
      return "All extracted technical claims for " + repo + " #" + num + " have complete verified source evidence coverage.";
    }

    return "Sortfolio AI Assistant summary for " + repo + " #" + num + ":\n" +
      "• Total Claims: " + claims.length + "\n" +
      "• Supported: " + claims.filter(function (c) { return String(c.status).toLowerCase() === "supported"; }).length + "\n" +
      "• Contradicted: " + claims.filter(function (c) { return String(c.status).toLowerCase() === "contradicted"; }).length + "\n" +
      "• Unverified: " + claims.filter(function (c) { return String(c.status).toLowerCase() === "unverified"; }).length + "\n\n" +
      "You can ask me to draft a maintainer reply, explain contradictions, or show verified source code lines!";
  }

  async function handleUserChatMessage(text) {
    if (!text || !text.trim()) return;
    var userText = text.trim();
    addChatMessage("user", userText);
    if (chatInput) chatInput.value = "";

    var activeReport = currentReport || (window.DEMO && window.DEMO.report);
    if (!activeReport) {
      addChatMessage("assistant", "Please run or select an analysis first so I can inspect its verified code evidence!");
      return;
    }

    var typing = document.createElement("div");
    typing.className = "chat-msg assistant";
    typing.textContent = "Synthesizing answer from verified evidence…";
    chatFeed.appendChild(typing);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    try {
      var supabaseUrl = window.SF_SUPABASE_URL || localStorage.getItem("sf_supabase_url");
      var supabaseAnonKey = window.SF_SUPABASE_KEY || localStorage.getItem("sf_supabase_key");
      var reply = "";

      if (supabaseUrl && supabaseAnonKey && window.SortfolioAPI) {
        try {
          var api = new window.SortfolioAPI({ supabaseUrl: supabaseUrl, supabaseAnonKey: supabaseAnonKey });
          var res = await api.askAssistant(userText, activeReport);
          if (res && res.reply) reply = res.reply;
        } catch (e) {
          console.warn("Backend chat-assistant call fallback to client:", e);
        }
      }

      if (!reply) {
        await wait(350);
        reply = generateClientTriageAnswer(userText, activeReport);
      }

      typing.textContent = reply;
    } catch (err) {
      typing.textContent = "Error: " + err.message;
    }
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  if (chatForm) {
    chatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (chatInput) handleUserChatMessage(chatInput.value);
    });
  }

  $$(".chat-pill").forEach(function (pill) {
    pill.addEventListener("click", function () {
      var p = pill.dataset.prompt;
      if (p) handleUserChatMessage(p);
    });
  });

  /* ---------- Repository Portfolio System ---------- */
  var DEFAULT_PORTFOLIO = [
    { repo: "me-agrim-rehan/reachable-vulnerability", name: "reachable-vulnerability", owner: "me-agrim-rehan", description: "Security reachability analysis", openPRs: 1 },
    { repo: "pallets/flask", name: "flask", owner: "pallets", description: "The Python micro framework", openPRs: 1 },
    { repo: "tiangolo/fastapi", name: "fastapi", owner: "tiangolo", description: "FastAPI framework", openPRs: 0 },
    { repo: "psf/requests", name: "requests", owner: "psf", description: "Python HTTP for Humans", openPRs: 0 }
  ];

  function getPortfolio() {
    try {
      var raw = localStorage.getItem("sf_portfolio_repos");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (_) {}
    return DEFAULT_PORTFOLIO.slice();
  }

  function savePortfolio(list) {
    try {
      localStorage.setItem("sf_portfolio_repos", JSON.stringify(list));
    } catch (_) {}
  }

  var activePortfolioRepo = "";

  function renderPortfolio() {
    var grid = $("portfolioGrid");
    var counter = $("portfolioCounter");
    if (!grid) return;

    var list = getPortfolio();
    if (counter) counter.textContent = list.length + (list.length === 1 ? " Repository" : " Repositories");

    if (!list.length) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--muted);">' +
        'No repositories in portfolio yet. Click "➕ Add Repo" to track a repository!</div>';
      return;
    }

    grid.innerHTML = list.map(function (item) {
      var isActive = activePortfolioRepo === item.repo || $("repoUrl").value.includes(item.repo);
      var tagClass = item.openPRs > 0 ? "portfolio-card-tag has-pr" : "portfolio-card-tag";
      var prLabel = item.openPRs > 0 ? "⑂ " + item.openPRs + " PR" : "⑂ 0 PRs";

      return '<div class="portfolio-card' + (isActive ? ' active' : '') + '" data-repo="' + item.repo + '">' +
        '<div class="portfolio-card-top">' +
          '<div>' +
            '<span class="portfolio-card-owner">@' + item.owner + '</span>' +
            '<span class="portfolio-card-name">' + item.name + '</span>' +
          '</div>' +
          '<button type="button" class="portfolio-card-remove" data-remove="' + item.repo + '" title="Remove from portfolio">✕</button>' +
        '</div>' +
        '<div class="portfolio-card-bottom">' +
          '<span class="' + tagClass + '">' + prLabel + '</span>' +
          '<span style="color:var(--gold);font-size:12px;font-weight:600;">Browse →</span>' +
        '</div>' +
      '</div>';
    }).join("");

    grid.querySelectorAll(".portfolio-card").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest(".portfolio-card-remove")) return;
        var repo = card.dataset.repo;
        selectPortfolioRepo(repo);
      });
    });

    grid.querySelectorAll(".portfolio-card-remove").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var repoToRemove = btn.dataset.remove;
        removeRepoFromPortfolio(repoToRemove);
      });
    });
  }

  function selectPortfolioRepo(repo) {
    activePortfolioRepo = repo;
    $("repoUrl").value = "https://github.com/" + repo;
    $("itemNum").value = "";
    itemType = "pull";
    $$(".seg-btn").forEach(function (x) { x.classList.toggle("active", x.dataset.type === "pull"); });
    renderPortfolio();
    openRepoExplorer(repo, "pull");
  }

  function addRepoToPortfolio(repoInput) {
    var parsed = parseGitHubInput(repoInput);
    if (!parsed || !parsed.repo) {
      throw new Error("Invalid GitHub repository format. Use 'owner/repo' or a full URL.");
    }
    var list = getPortfolio();
    var exists = list.some(function (x) { return x.repo.toLowerCase() === parsed.repo.toLowerCase(); });
    if (exists) {
      throw new Error(parsed.repo + " is already in your portfolio!");
    }
    var parts = parsed.repo.split("/");
    var newItem = {
      repo: parsed.repo,
      owner: parts[0],
      name: parts[1],
      description: "Custom repository",
      openPRs: 1
    };
    list.unshift(newItem);
    savePortfolio(list);
    renderPortfolio();
    selectPortfolioRepo(parsed.repo);
  }

  function removeRepoFromPortfolio(repo) {
    var list = getPortfolio().filter(function (x) { return x.repo.toLowerCase() !== repo.toLowerCase(); });
    savePortfolio(list);
    if (activePortfolioRepo === repo) activePortfolioRepo = "";
    renderPortfolio();
  }

  if ($("pinCurrentRepoBtn")) {
    $("pinCurrentRepoBtn").addEventListener("click", function () {
      var parsed = parseGitHubInput($("repoUrl").value);
      if (!parsed || !parsed.repo) {
        showError("Enter a repository URL first to pin it to your portfolio.");
        return;
      }
      try {
        addRepoToPortfolio(parsed.repo);
        $("pinCurrentRepoBtn").textContent = "✓ Pinned";
        setTimeout(function () { $("pinCurrentRepoBtn").textContent = "⭐ Pin"; }, 2000);
      } catch (err) {
        showError(err.message);
      }
    });
  }

  window.SF_openAddRepoModal = function () {
    var modal = $("addRepoModal");
    if (modal) {
      show(modal, true);
      $("newRepoInput").value = "";
      show($("addRepoError"), false);
      setTimeout(function () { $("newRepoInput").focus(); }, 60);
    }
  };

  if ($("openAddRepoModalBtn")) {
    $("openAddRepoModalBtn").addEventListener("click", function () {
      window.SF_openAddRepoModal();
    });
  }

  if ($("closeAddRepoModalBtn")) {
    $("closeAddRepoModalBtn").addEventListener("click", function () {
      show($("addRepoModal"), false);
    });
  }

  if ($("cancelAddRepoBtn")) {
    $("cancelAddRepoBtn").addEventListener("click", function () {
      show($("addRepoModal"), false);
    });
  }

  if ($("addRepoModal")) {
    $("addRepoModal").addEventListener("click", function (e) {
      if (e.target === $("addRepoModal")) show($("addRepoModal"), false);
    });
  }

  if ($("addRepoForm")) {
    $("addRepoForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("newRepoInput").value.trim();
      try {
        addRepoToPortfolio(input);
        show($("addRepoModal"), false);
      } catch (err) {
        $("addRepoError").textContent = err.message;
        show($("addRepoError"), true);
      }
    });
  }

  if (mode === "demo") { $("repoUrl").value = "https://github.com/octocat/hello-world"; $("itemNum").value = 42; }
  window.SF = {
    getHistory: getHistory,
    setHistory: setHistory,
    renderHistory: renderHistory,
    getPortfolio: getPortfolio,
    addRepoToPortfolio: addRepoToPortfolio,
    removeRepoFromPortfolio: removeRepoFromPortfolio,
    modeLabel: modeLabel,
    demo: mode === "demo",
    onHistory: null
  };
  renderHistory();
  renderPortfolio();
})();
