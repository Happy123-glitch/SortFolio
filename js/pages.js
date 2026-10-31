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
  var demoProfile = load("sf_demo_profile", { name: "", email: "demo@sortfolio.local" });
  var profileData = null;
  var profileUsesDatabase = false;

  function displayName() { return sessionStorage.getItem("sf_name") || settings.name || SF.modeLabel; }
  function applyAccent(key) {
    var a = ACCENTS[key] || ACCENTS.gold, r = document.documentElement.style;
    r.setProperty("--gold", a[0]); r.setProperty("--gold2", a[1]); r.setProperty("--gold-hi", a[2]); r.setProperty("--gold-lo", a[3]);
    $$(".sw").forEach(function (b) { b.classList.toggle("active", b.dataset.accent === key); });
  }
  function applySettings(initial) {
    applyAccent(settings.accent);
    document.body.classList.toggle("calm", !!settings.calm);
    $("avatarBtn").textContent = displayName().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
    $("avatarBtn").title = "View profile (" + displayName() + ")";
    $("acName").textContent = displayName();
    $("acMode").textContent = SF.modeLabel;
    $("acStore").textContent = SF.demo ? "Sample data, resets on reload" : "This browser (localStorage)";
    if (initial) {
      if (!SF.demo && !$("repoUrl").value) $("repoUrl").value = settings.repo;
      var seg = document.querySelector('.seg-btn[data-type="' + settings.type + '"]'); if (seg) seg.click();
    }
  }
  function clearProfilePassword() {
    $("profileCurrentPassword").value = "";
    $("profileNewPassword").value = "";
    $("profileConfirmPassword").value = "";
  }
  function closeProfile() {
    $("profileModal").hidden = true;
    clearProfilePassword();
  }
  function initials(name) {
    return String(name || "User").trim().split(/\s+/).map(function (word) { return word[0]; }).join("").slice(0, 2).toUpperCase();
  }
  function updateProfilePreview() {
    var name = $("profileName").value.trim() || "Your name";
    var email = $("profileEmail").value.trim() || "Your email";
    $("profileAvatar").textContent = initials(name);
    $("profileDisplayName").textContent = name;
    $("profileDisplayEmail").textContent = email;
  }
  async function openProfile() {
    var demo = SF.demo;
    var editable = demo || SF.modeLabel === "User";
    profileUsesDatabase = !!(window.SFBackend && window.SFBackend.isReady());
    profileData = null;
    $("profileName").disabled = true;
    $("profileEmail").disabled = true;
    $("profilePassword").disabled = true;
    $("saveProfileBtn").hidden = true;
    $("profileReadOnly").hidden = editable;
    $("profileDemoNote").hidden = !demo;
    $("profileBadge").textContent = demo ? (profileUsesDatabase ? "Demo account" : "Offline demo") : "Supabase account";
    $("profileMode").textContent = demo ? (profileUsesDatabase ? "Demo · Database" : "Demo · This browser") : "User · Supabase";
    $("profileCreated").textContent = "Loading…";
    $("profileError").hidden = true;
    $("profileError").textContent = "";
    $("profileSaved").textContent = "";
    clearProfilePassword();
    $("profileModal").hidden = false;
    $("closeProfileModalBtn").focus();

    try {
      if (profileUsesDatabase) {
        var authUser = await window.SFBackend.getCurrentUser();
        if (authUser.email) sessionStorage.setItem("sf_email", authUser.email);
        profileData = await window.SFBackend.getProfile();
      } else if (demo) {
        profileData = {
          full_name: demoProfile.name || sessionStorage.getItem("sf_name") || "Demo",
          contact_email: demoProfile.email || "demo@sortfolio.local",
          created_at: demoProfile.created || null
        };
      } else {
        throw new Error("Supabase is unavailable. Your account profile could not be loaded.");
      }

      $("profileName").value = profileData.full_name || sessionStorage.getItem("sf_name") || (demo ? "Demo" : "");
      $("profileEmail").value = profileData.contact_email || sessionStorage.getItem("sf_email") || "";
      $("profileName").disabled = !editable;
      $("profileEmail").disabled = !editable;
      $("profilePassword").disabled = !editable || demo || !profileUsesDatabase;
      $("profilePassword").hidden = demo || !editable || !profileUsesDatabase;
      $("saveProfileBtn").hidden = !editable;
      $("profileDemoNote").textContent = profileUsesDatabase
        ? "Demo profile edits are saved to your Supabase account."
        : "Demo profile edits are saved in this browser only; configure Supabase to sync them.";
      var created = profileData.created_at;
      $("profileCreated").textContent = created ? new Date(created).toLocaleDateString() : demo ? "Demo session" : "Not available";
      updateProfilePreview();
      if (editable) $("profileName").focus();
    } catch (error) {
      $("profileError").textContent = error.message || "Could not load your profile.";
      $("profileError").hidden = false;
    }
  }
  $("avatarBtn").addEventListener("click", openProfile);
  $("closeProfileModalBtn").addEventListener("click", closeProfile);
  $("cancelProfileBtn").addEventListener("click", closeProfile);
  $("profileModal").addEventListener("click", function (e) {
    if (e.target === $("profileModal")) closeProfile();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("profileModal").hidden) closeProfile();
  });
  $("profileName").addEventListener("input", updateProfilePreview);
  $("profileEmail").addEventListener("input", updateProfilePreview);
  $("profileForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var demo = SF.demo;
    var editable = demo || SF.modeLabel === "User";
    if (!editable || !profileData) return;

    var name = $("profileName").value.trim();
    var updatedEmail = $("profileEmail").value.trim().toLowerCase();
    var currentPassword = $("profileCurrentPassword").value;
    var newPassword = $("profileNewPassword").value;
    var confirmPassword = $("profileConfirmPassword").value;
    var error = "";
    $("profileError").textContent = "";
    if (name.length < 2) error = "Enter your full name.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updatedEmail)) error = "Enter a valid email address.";

    var changingPassword = !demo && !!(currentPassword || newPassword || confirmPassword);
    if (!error && changingPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) error = "Fill in all password fields to change your password.";
      else if (newPassword.length < 8) error = "Use a new password with at least 8 characters.";
      else if (newPassword !== confirmPassword) error = "The new passwords do not match.";
    }
    if (error) {
      $("profileError").textContent = error;
      $("profileError").hidden = false;
      $("profileSaved").textContent = "";
      return;
    }

    var accountChanged = false;
    var emailChangeRequested = false;
    try {
      if (profileUsesDatabase) {
        if (changingPassword) {
          await window.SFBackend.verifyPassword(currentPassword);
        }
        var changes = !demo ? { data: { full_name: name } } : {};
        if (!demo && updatedEmail !== (sessionStorage.getItem("sf_email") || "")) {
          changes.email = updatedEmail;
          emailChangeRequested = true;
        }
        if (changingPassword) changes.password = newPassword;
        if (Object.keys(changes).length) {
          await window.SFBackend.updateAccount(changes);
          accountChanged = true;
        }
        profileData = await window.SFBackend.saveProfile({ full_name: name, contact_email: updatedEmail });
      } else if (demo) {
        demoProfile = { name: name, email: updatedEmail, created: demoProfile.created || Date.now() };
        if (!store("sf_demo_profile", demoProfile)) {
          throw new Error("Could not save your profile. Allow browser storage and try again.");
        }
        profileData = {
          full_name: demoProfile.name,
          contact_email: demoProfile.email,
          created_at: new Date(demoProfile.created).toISOString()
        };
      } else {
        throw new Error("Supabase is unavailable. Your profile was not saved.");
      }
    } catch (saveError) {
      $("profileError").textContent = accountChanged
        ? "Your account details changed, but the profile could not be saved: " + (saveError.message || "Unknown error.")
        : (saveError.message || "Could not save your profile.");
      $("profileError").hidden = false;
      $("profileSaved").textContent = "";
      return;
    }

    sessionStorage.setItem("sf_name", name);
    settings.name = name;
    draft.name = name;
    var settingsSaved = store("sf_settings", settings);
    if (!settingsSaved) {
      $("profileError").textContent = "Profile saved, but the display name preference could not be saved.";
      $("profileError").hidden = false;
    }
    applySettings(false);
    $("profileError").hidden = !$("profileError").textContent;
    $("profileSaved").textContent = $("profileError").hidden
      ? profileUsesDatabase
        ? "Profile saved to Supabase." + (emailChangeRequested ? " Confirm your new email using the message Supabase sent." : "")
        : "Profile saved in this browser only."
      : "";
    $("profileEmail").value = updatedEmail;
    $("profileCreated").textContent = profileData.created_at
      ? new Date(profileData.created_at).toLocaleDateString()
      : demo ? "Demo session" : "Not available";
    updateProfilePreview();
    clearProfilePassword();
  });
  function fillSettings() {
    $("setName").value = sessionStorage.getItem("sf_name") || draft.name || "";
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
