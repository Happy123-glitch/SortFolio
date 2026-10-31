(function (root) {
  "use strict";

  var FB_STORAGE_KEY = "sf_improvements_v1";

  var CATEGORIES = {
    evidence: { label: "Evidence Accuracy", icon: "🔍", desc: "AST parser precision & line numbers" },
    verdict: { label: "Triage Verdict", icon: "⚖️", desc: "Supported / Contradicted / Unverified accuracy" },
    model: { label: "AI Model Output", icon: "🤖", desc: "Qwen 2.5 summary clarity & groundedness" },
    extraction: { label: "Claim Extraction", icon: "📋", desc: "Missed or false claims" },
    diff: { label: "Code Comparison", icon: "⇄", desc: "Git diff & patch alignment" },
    ui: { label: "UI & Usability", icon: "🎨", desc: "Workflow, speed & accessibility" },
    feature: { label: "Feature Suggestion", icon: "💡", desc: "New capabilities" }
  };

  var DEFAULT_FEEDBACK = [
    {
      id: "fb-1",
      category: "evidence",
      categoryLabel: "🔍 Evidence Accuracy",
      target: "pallets/flask #5240",
      rating: 5,
      text: "Support AST extraction for multiline decorator arguments and typed routing parameters in Flask.",
      suggestion: "src/flask/app.py lines 14–21",
      author: "@flask-maintainer",
      status: "Implemented",
      upvotes: 14,
      upvoted: false,
      timestamp: "1 day ago"
    },
    {
      id: "fb-2",
      category: "diff",
      categoryLabel: "⇄ Code Comparison",
      target: "General Platform",
      rating: 5,
      text: "Align side-by-side git diff view with patch download in a dedicated Compare Code tab.",
      suggestion: "Add unified patch generator",
      author: "@contributor-ujjwal",
      status: "Implemented",
      upvotes: 21,
      upvoted: false,
      timestamp: "3 hours ago"
    },
    {
      id: "fb-3",
      category: "verdict",
      categoryLabel: "⚖️ Triage Verdict",
      target: "psf/requests #6180",
      rating: 4,
      text: "Unverified cases due to lack of environment reproduction should explicitly link to relevant issue discussion.",
      suggestion: "Show execution guardrail notice",
      author: "@security-auditor",
      status: "Under Review",
      upvotes: 9,
      upvoted: false,
      timestamp: "Just now"
    }
  ];

  function getStorage(customStorage) {
    if (customStorage) return customStorage;
    if (typeof localStorage !== "undefined") return localStorage;
    return null;
  }

  function getRatingLabel(rating) {
    var val = parseInt(rating, 10);
    switch (val) {
      case 5: return "5 / 5 - Highly Accurate";
      case 4: return "4 / 5 - Good Quality";
      case 3: return "3 / 5 - Acceptable";
      case 2: return "2 / 5 - Needs Improvement";
      case 1: return "1 / 5 - Discrepancy Found";
      default: return val + " / 5";
    }
  }

  function loadFeedback(customStorage) {
    var s = getStorage(customStorage);
    if (!s) return DEFAULT_FEEDBACK.slice();
    try {
      var raw = s.getItem(FB_STORAGE_KEY);
      if (!raw) return DEFAULT_FEEDBACK.slice();
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_FEEDBACK.slice();
    } catch (e) {
      return DEFAULT_FEEDBACK.slice();
    }
  }

  function saveFeedback(customStorage, list) {
    var s = getStorage(customStorage);
    if (!s) return false;
    try {
      s.setItem(FB_STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function validateFeedback(item) {
    if (!item) return { valid: false, error: "Feedback item is required." };
    var text = String(item.text || "").trim();
    if (!text) return { valid: false, error: "Please enter what can be improved." };
    if (text.length < 5) return { valid: false, error: "Please provide a little more detail (at least 5 characters)." };
    if (text.length > 500) return { valid: false, error: "Feedback must be 500 characters or fewer." };
    return { valid: true };
  }

  function addFeedback(customStorage, data) {
    var validation = validateFeedback(data);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    var list = loadFeedback(customStorage);
    var catKey = data.category && CATEGORIES[data.category] ? data.category : "feature";
    var catMeta = CATEGORIES[catKey];
    var ratingVal = Math.max(1, Math.min(5, parseInt(data.rating, 10) || 5));

    var newItem = {
      id: "fb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      category: catKey,
      categoryLabel: catMeta.icon + " " + catMeta.label,
      target: String(data.target || "General Platform").trim(),
      rating: ratingVal,
      text: String(data.text || "").trim(),
      suggestion: String(data.suggestion || "").trim(),
      author: String(data.author || "").trim() || "@contributor",
      status: "Under Review",
      upvotes: 1,
      upvoted: true,
      timestamp: "Just now"
    };

    list.unshift(newItem);
    saveFeedback(customStorage, list);
    return newItem;
  }

  function toggleUpvote(customStorage, id) {
    var list = loadFeedback(customStorage);
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        found = list[i];
        if (found.upvoted) {
          found.upvotes = Math.max(0, (found.upvotes || 1) - 1);
          found.upvoted = false;
        } else {
          found.upvotes = (found.upvotes || 0) + 1;
          found.upvoted = true;
        }
        break;
      }
    }
    if (found) {
      saveFeedback(customStorage, list);
    }
    return found;
  }

  root.SortfolioFeedback = {
    FB_STORAGE_KEY: FB_STORAGE_KEY,
    CATEGORIES: CATEGORIES,
    DEFAULT_FEEDBACK: DEFAULT_FEEDBACK,
    getRatingLabel: getRatingLabel,
    loadFeedback: loadFeedback,
    saveFeedback: saveFeedback,
    validateFeedback: validateFeedback,
    addFeedback: addFeedback,
    toggleUpvote: toggleUpvote
  };
})(typeof window !== "undefined" ? window : globalThis);
