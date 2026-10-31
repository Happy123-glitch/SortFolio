/* Demo data: used only in demo mode. No network requests are made. */
window.DEMO = {
  history: [
    { title: "octocat/hello-world #42", sub: "Fix crash on empty input", time: "2 min ago", status: "Valid" },
    { title: "microsoft/vscode #1032", sub: "Improve startup performance", time: "1 hour ago", status: "Uncertain" },
    { title: "facebook/react #1247", sub: "Memory leak in parser", time: "3 hours ago", status: "Invalid" },
    { title: "tailwindlabs/tailwindcss #9821", sub: "Add support for new features", time: "5 hours ago", status: "Valid" }
  ],
  report: {
    repo: "octocat/hello-world", type: "issue", number: 42, seconds: 28, coverage: 92,
    claims: [
      { text: "Empty input causes a crash", status: "Supported", where: "Found in src/parser.py • Lines 42-48",
        evidence: { path: "src/parser.py", start: 42, end: 42, url: "https://github.com/octocat/hello-world",
          lines: [[40, "def parse_input(data):"], [41, "    if not data:"], [42, "        raise ValueError(\"Empty input\")"], [43, "    return process(data)"]] } },
      { text: "Python 3.13 compatibility is broken", status: "Unverified", where: "Found in requirements.txt", evidence: null },
      { text: "Performance is 40% slower", status: "Insufficient", where: "No benchmark found", evidence: null },
      { text: "Fix is already available", status: "Supported", where: "Found in PR #48", evidence: null }
    ],
    repro: { chip: "Test Passed ✓", test: "Test: empty_input_test", result: "Result: Bug Reproduced",
      text: "Demo only: an isolated test reproduced the crash. Real analyses never execute contributor code." }
  }
};
