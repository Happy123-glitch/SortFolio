(function (root) {
  "use strict";

  var MAX_DIFF_CELLS = 250000;

  function linesOf(text) {
    var normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!normalized) return [];
    if (normalized.endsWith("\n")) normalized = normalized.slice(0, -1);
    return normalized.split("\n");
  }

  function buildDiff(beforeText, afterText) {
    var before = linesOf(beforeText);
    var after = linesOf(afterText);
    var rows = [];
    var removed = 0;
    var added = 0;
    var simplified = before.length * after.length > MAX_DIFF_CELLS;

    if (simplified) {
      before.forEach(function (text, index) {
        rows.push({ type: "removed", beforeNo: index + 1, afterNo: null, text: text });
        removed++;
      });
      after.forEach(function (text, index) {
        rows.push({ type: "added", beforeNo: null, afterNo: index + 1, text: text });
        added++;
      });
    } else {
      var dp = Array.from({ length: before.length + 1 }, function () {
        return new Uint32Array(after.length + 1);
      });

      for (var i = before.length - 1; i >= 0; i--) {
        for (var j = after.length - 1; j >= 0; j--) {
          dp[i][j] = before[i] === after[j]
            ? dp[i + 1][j + 1] + 1
            : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }

      var beforeIndex = 0;
      var afterIndex = 0;
      while (beforeIndex < before.length && afterIndex < after.length) {
        if (before[beforeIndex] === after[afterIndex]) {
          rows.push({
            type: "unchanged",
            beforeNo: beforeIndex + 1,
            afterNo: afterIndex + 1,
            text: before[beforeIndex]
          });
          beforeIndex++;
          afterIndex++;
        } else if (dp[beforeIndex + 1][afterIndex] >= dp[beforeIndex][afterIndex + 1]) {
          rows.push({ type: "removed", beforeNo: beforeIndex + 1, afterNo: null, text: before[beforeIndex] });
          beforeIndex++;
          removed++;
        } else {
          rows.push({ type: "added", beforeNo: null, afterNo: afterIndex + 1, text: after[afterIndex] });
          afterIndex++;
          added++;
        }
      }

      while (beforeIndex < before.length) {
        rows.push({ type: "removed", beforeNo: beforeIndex + 1, afterNo: null, text: before[beforeIndex] });
        beforeIndex++;
        removed++;
      }
      while (afterIndex < after.length) {
        rows.push({ type: "added", beforeNo: null, afterNo: afterIndex + 1, text: after[afterIndex] });
        afterIndex++;
        added++;
      }
    }

    return {
      rows: rows,
      added: added,
      removed: removed,
      unchanged: rows.length - added - removed,
      beforeCount: before.length,
      afterCount: after.length,
      simplified: simplified
    };
  }

  function createPatch(beforeText, afterText) {
    var diff = buildDiff(beforeText, afterText);
    var oldStart = diff.beforeCount ? 1 : 0;
    var newStart = diff.afterCount ? 1 : 0;
    var patch = [
      "diff --git a/before b/after",
      "--- a/before",
      "+++ b/after",
      "@@ -" + oldStart + "," + diff.beforeCount + " +" + newStart + "," + diff.afterCount + " @@"
    ];

    diff.rows.forEach(function (row) {
      var marker = row.type === "added" ? "+" : row.type === "removed" ? "-" : " ";
      patch.push(marker + row.text);
    });

    return patch.join("\n") + "\n";
  }

  function suggestFixes(diffRows, language) {
    if (language !== "javascript" && language !== "typescript") return [];
    var suggestions = [];

    diffRows.forEach(function (row) {
      if (row.type !== "added") return;
      var text = row.text;
      var logMatch = text.match(/^(\s*)console\.log\([^;\n]*\);?\s*$/);
      if (logMatch) {
        suggestions.push({
          kind: "remove-debug-log",
          title: "Remove debug logging",
          reason: "This added line writes to the browser or server console.",
          lineNo: row.afterNo,
          before: text,
          after: ""
        });
        return;
      }

      if (/\bnull\s*(?:==|!=)|(?:==|!=)\s*null\b/.test(text)) return;
      var match = /(?<![=!])(?:==|!=)(?!=)/.exec(text);
      if (!match) return;
      var operator = match[0];
      suggestions.push({
        kind: "strict-equality",
        title: "Use strict equality",
        reason: "Loose equality can coerce values before comparing them. Check that strict equality matches the intended behavior.",
        lineNo: row.afterNo,
        before: text,
        after: text.slice(0, match.index) + (operator === "==" ? "===" : "!==") + text.slice(match.index + operator.length)
      });
    });

    return suggestions;
  }

  function applySuggestion(text, suggestion) {
    var source = String(text || "");
    var newline = source.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
    var normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var hasTrailingNewline = normalized.endsWith("\n");
    var lines = normalized.split("\n");
    if (hasTrailingNewline) lines.pop();
    var index = suggestion.lineNo - 1;
    if (index < 0 || index >= lines.length || lines[index] !== suggestion.before) return null;

    if (suggestion.kind === "remove-debug-log") lines.splice(index, 1);
    else if (suggestion.kind === "strict-equality") lines[index] = suggestion.after;
    else return null;

    var result = lines.join(newline);
    if (hasTrailingNewline && lines.length) result += newline;
    return result;
  }

  function applySuggestions(text, suggestions) {
    var corrected = String(text || "");
    var applied = 0;
    suggestions.slice().sort(function (left, right) { return right.lineNo - left.lineNo; })
      .forEach(function (suggestion) {
        var result = applySuggestion(corrected, suggestion);
        if (result !== null) {
          corrected = result;
          applied++;
        }
      });
    return { text: corrected, applied: applied };
  }

  function generateCorrections(text, language) {
    var source = String(text || "");
    var rows = buildDiff("", source).rows;
    var suggestions = suggestFixes(rows, language);
    var result = applySuggestions(source, suggestions);
    return { text: result.text, applied: result.applied, suggestions: suggestions };
  }

  root.SortfolioDiff = {
    buildDiff: buildDiff,
    createPatch: createPatch,
    suggestFixes: suggestFixes,
    applySuggestion: applySuggestion,
    applySuggestions: applySuggestions,
    generateCorrections: generateCorrections
  };
})(typeof window !== "undefined" ? window : globalThis);
