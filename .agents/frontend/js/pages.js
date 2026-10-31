/* Editable Settings, History and About pages. Markup lives in index.html templates. */
(function () {
  "use strict";
  var SF = window.SF;
  if (!SF) return;
  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var ACCENTS = { gold: ["#e8b765", "#c8924a", "#f0c57c", "#d49c4f"], emerald: ["#5fd3a0", "#2f9d73", "#8ae8c0", "#35a67a"],
                  azure: ["#6db8ff", "#3b82d6", "#9bd0ff", "#4a90e0"], rose: ["#f08aa6", "#c85577", "#f7aabf", "#d4607f"] };
  var DEFAULTS = { name: "", type: "issue", repo: "", keep: 30, accent: "gold", calm: false };
  var ABOUT_DEFAULTS = { team: "", members: "", model: "Qwen Instruct (planned, exact model ID not finalized)", route: "Hosted", integrated: false };

  function load(key, def) { try { return Object.assign({}, def, JSON.parse(localStorage.getItem(key)) || {}); } catch (e) { return Object.assign({}, def); } }
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
  function make(tplId, data) {
    var node = $(tplId).content.firstElementChild.cloneNode(true);
    Object.keys(data || {}).forEach(function (k) { var el = node.querySelector('[data-f="' + k + '"]'); if (el) el.textContent = data[k]; });
    return node;
  }
  function fill(list, nodes) { list.replaceChildren.apply(list, nodes); }
  function flash(el, msg) {
    el.textContent = msg; el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove("show"); }, 2500);
  }

  /* ================= SETTINGS ================= */
  var settings = load("sf_settings", DEFAULTS);
  var draft = Object.assign({}, settings);

  function displayName() { return settings.name || sessionStorage.getItem("sf_name") || SF.modeLabel; }
  function applyAccent(key) {
    var a = ACCENTS[key] || ACCENTS.gold, r = document.documentElement.style;
    r.setProperty("--gold", a[0]); r.setProperty("--gold2", a[1]); r.setProperty("--gold-hi", a[2]); r.setProperty("--gold-lo", a[3]);
    $$(".sw").forEach(function (b) { b.classList.toggle("active", b.dataset.accent === key); });
  }
  function applySettings(initial) {
    applyAccent(settings.accent);
    document.body.classList.toggle("calm", !!settings.calm);
    $("logoutBtn").textContent = displayName().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
    $("acName").textContent = displayName();
    $("acMode").textContent = SF.modeLabel;
    $("acStore").textContent = SF.demo ? "Sample data, resets on reload" : "This browser (localStorage)";
    if (initial) {
      if (!SF.demo && !$("repoUrl").value) $("repoUrl").value = settings.repo;
      var seg = document.querySelector('.seg-btn[data-type="' + settings.type + '"]'); if (seg) seg.click();
    }
  }
  function fillSettings() {
    $("setName").value = draft.name || sessionStorage.getItem("sf_name") || "";
    $("setType").value = draft.type; $("setRepo").value = draft.repo;
    $("setKeep").value = String(draft.keep); $("setCalm").checked = !!draft.calm;
    applyAccent(draft.accent);
  }
  $("swatches").addEventListener("click", function (e) {
    var b = e.target.closest(".sw"); if (!b) return;
    draft.accent = b.dataset.accent; applyAccent(draft.accent);
  });
  $("settingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    draft.name = $("setName").value.trim(); draft.type = $("setType").value; draft.repo = $("setRepo").value.trim();
    draft.keep = parseInt($("setKeep").value, 10); draft.calm = $("setCalm").checked;
    settings = Object.assign({}, draft);
    if (settings.name) sessionStorage.setItem("sf_name", settings.name);
    var list = SF.getHistory();
    if (list.length > settings.keep) { SF.setHistory(list.slice(0, settings.keep)); SF.renderHistory(); }
    applySettings(false);
    flash($("settingsSaved"), store("sf_settings", settings) ? "Settings saved." : "Could not save: this browser blocked storage.");
  });
  $("resetSettings").addEventListener("click", function () {
    draft = Object.assign({}, DEFAULTS); settings = Object.assign({}, DEFAULTS);
    store("sf_settings", settings); fillSettings(); applySettings(false);
    flash($("settingsSaved"), "Defaults restored.");
  });

  /* ================= HISTORY ================= */
  var editing = false, clearTimer = null;

  function repoOf(x) { return x.title.split(" #")[0]; }
  function persist(i, patch) {
    var list = SF.getHistory();
    if (!list[i]) return;
    Object.assign(list[i], patch); SF.setHistory(list);
    editing = true; SF.renderHistory(); editing = false;
  }
  function renderStats() {
    var list = SF.getHistory(), c = { Valid: 0, Uncertain: 0, Invalid: 0 }, repos = {};
    list.forEach(function (x) { if (c[x.status] !== undefined) c[x.status]++; repos[repoOf(x)] = (repos[repoOf(x)] || 0) + 1; });
    fill($("histStats"), ["Valid", "Uncertain", "Invalid"].map(function (k) { return make("tpl-stat", { v: c[k], l: k }); }));
    var top = Object.keys(repos).sort(function (a, b) { return repos[b] - repos[a]; })[0];
    $("histTop").textContent = top ? "Most analyzed: " + top + " (" + repos[top] + ")" : "No analyses yet.";
  }
  function buildItem(x, i) {
    var n = make("tpl-hist", { title: x.title, sub: x.sub, time: x.time });
    var sel = n.querySelector('[data-r="status"]'), note = n.querySelector('[data-r="note"]');
    sel.value = x.status; sel.classList.add("s-" + String(x.status).toLowerCase());
    note.value = x.note || "";
    sel.addEventListener("change", function () {
      sel.className = "select in s-" + sel.value.toLowerCase(); persist(i, { status: sel.value });
    });
    note.addEventListener("change", function () { persist(i, { note: note.value.trim() }); });
    n.querySelector('[data-r="del"]').addEventListener("click", function () {
      n.classList.add("removing");
      setTimeout(function () { var l = SF.getHistory(); l.splice(i, 1); SF.setHistory(l); SF.renderHistory(); renderList(); }, 260);
    });
    return n;
  }
  function renderList() {
    var q = $("histSearch").value.trim().toLowerCase(), f = $("histFilter").value;
    var rows = SF.getHistory().map(function (x, i) { return { x: x, i: i }; }).filter(function (r) {
      return (f === "all" || r.x.status === f) && (!q || (r.x.title + " " + r.x.sub + " " + (r.x.note || "")).toLowerCase().indexOf(q) !== -1);
    });
    var nodes = rows.map(function (r) { return buildItem(r.x, r.i); });
    if (!nodes.length) {
      var li = document.createElement("li"); li.className = "muted pad";
      li.textContent = SF.getHistory().length ? "No analyses match your search or filter." : "No analyses yet. Run one from Home to see it here.";
      nodes = [li];
    }
    fill($("historyList"), nodes);
  }
  SF.onHistory = function () { renderStats(); if (!editing) renderList(); };

  $("histSearch").addEventListener("input", renderList);
  $("histFilter").addEventListener("change", renderList);
  $("clearHistory").addEventListener("click", function () {
    var b = $("clearHistory");
    if (!clearTimer) {
      b.textContent = "Click again to confirm";
      clearTimer = setTimeout(function () { b.textContent = "Clear history"; clearTimer = null; }, 3000);
      return;
    }
    clearTimeout(clearTimer); clearTimer = null; b.textContent = "Clear history";
    SF.setHistory([]); SF.renderHistory(); renderList();
  });
  $("exportHistory").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(SF.getHistory(), null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sortfolio-history.json";
    a.click(); URL.revokeObjectURL(a.href);
  });

  /* ================= ABOUT ================= */
  var about = load("sf_about", ABOUT_DEFAULTS);

  function readAbout() {
    about = { team: $("abTeam").value.trim(), members: $("abMembers").value, model: $("abModel").value.trim(),
              route: $("abRoute").value, integrated: $("abIntegrated").checked };
  }
  function buildDoc() {
    var members = about.members.split("\n").map(function (m) { return m.trim(); }).filter(Boolean);
    var lines = ["# HACKATHON.md", "", "Team: " + (about.team || "(add team name)"), "Members:"];
    (members.length ? members : ["(add members)"]).forEach(function (m) { lines.push("- " + m); });
    lines.push("", "Project: Sortfolio", "Selected problem: Problem 02, Evidence-Based Open Source Issue and PR Triage", "");
    if (about.integrated) {
      lines.push("AI model (integrated): " + (about.model || "(add exact model ID)"), "Inference route: " + about.route,
        "Tasks: claim extraction and evidence explanation.");
    } else {
      lines.push("AI model: none integrated yet.", "Planned: " + (about.model || "(add model)") + " via " + about.route.toLowerCase() + " inference.");
    }
    lines.push("Deterministic checks own source paths, line numbers, snippets and claim statuses; the model never invents evidence.");
    return lines.join("\n");
  }
  function fillAbout() {
    $("abTeam").value = about.team; $("abMembers").value = about.members; $("abModel").value = about.model;
    $("abRoute").value = about.route; $("abIntegrated").checked = !!about.integrated;
    $("abPreview").textContent = buildDoc();
  }
  $("aboutForm").addEventListener("input", function () { readAbout(); $("abPreview").textContent = buildDoc(); });
  $("aboutForm").addEventListener("submit", function (e) {
    e.preventDefault(); readAbout();
    flash($("aboutSaved"), store("sf_about", about) ? "Details saved." : "Could not save: this browser blocked storage.");
  });
  $("abCopy").addEventListener("click", function () {
    var text = $("abPreview").textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash($("aboutSaved"), "Copied to clipboard."); },
        function () { flash($("aboutSaved"), "Copy failed. Select the text above and copy it manually."); });
    } else { flash($("aboutSaved"), "Copy is not available here. Select the text above and copy it manually."); }
  });

  /* ---------- init ---------- */
  fillSettings(); applySettings(true); fillAbout(); renderStats(); renderList();
})();
