/* Demo data: used only in demo mode. No network requests are made. */
window.DEMO = {
  history: [
    { title: "pallets/flask #5240", sub: "Flask: add_url_rule parameter verification", time: "just now", status: "Valid" },
    { title: "pallets/flask #4912", sub: "Flask: False claim about instance_path absence", time: "10 min ago", status: "Invalid" },
    { title: "psf/requests #6180", sub: "Requests: Vague OS-specific runtime crash", time: "1 hour ago", status: "Uncertain" },
    { title: "tiangolo/fastapi #9820", sub: "FastAPI: APIRouter dependencies declaration", time: "2 hours ago", status: "Valid" }
  ],
  report: {
    repo: "pallets/flask", type: "issue", number: 5240, seconds: 2, coverage: 100,
    claims: [
      { 
        text: "add_url_rule accepts parameter provide_automatic_options", 
        status: "Supported", 
        where: "Found in src/flask/app.py • Lines 14–21",
        evidence: { 
          path: "src/flask/app.py", 
          start: 14, 
          end: 21, 
          url: "https://github.com/pallets/flask/blob/main/src/flask/app.py#L14-L21",
          lines: [
            [14, "    def add_url_rule("],
            [15, "        self,"],
            [16, "        rule: str,"],
            [17, "        endpoint: str = None,"],
            [18, "        view_func = None,"],
            [19, "        provide_automatic_options: bool = None,"],
            [20, "        **options"],
            [21, "    ):"]
          ] 
        } 
      },
      { 
        text: "Flask route function officially declares the automatic options argument", 
        status: "Supported", 
        where: "Grounded by Python AST static inspection", 
        evidence: { 
          path: "src/flask/app.py", 
          start: 14, 
          end: 21, 
          url: "https://github.com/pallets/flask/blob/main/src/flask/app.py#L14-L21",
          lines: [
            [19, "        provide_automatic_options: bool = None,"]
          ] 
        } 
      }
    ],
    repro: { 
      chip: "Static Proof ✓", 
      test: "Deterministic AST Inspection", 
      result: "Result: Supported by Source Code",
      text: "Sortfolio verified the signature statically in src/flask/app.py. Open-weight Qwen 2.5 7B synthesized the maintainer audit summary." 
    }
  },
  reports: {
    "pallets/flask#5240": {
      repo: "pallets/flask", type: "issue", number: 5240, seconds: 2, coverage: 100,
      claims: [
        { 
          text: "add_url_rule accepts parameter provide_automatic_options", 
          status: "Supported", 
          where: "Found in src/flask/app.py • Lines 14–21",
          evidence: { 
            path: "src/flask/app.py", start: 14, end: 21, 
            url: "https://github.com/pallets/flask/blob/main/src/flask/app.py#L14-L21",
            lines: [[14, "    def add_url_rule("], [15, "        self,"], [16, "        rule: str,"], [17, "        endpoint: str = None,"], [18, "        view_func = None,"], [19, "        provide_automatic_options: bool = None,"], [20, "        **options"], [21, "    ):"]]
          }
        }
      ],
      repro: { chip: "Verified ✓", test: "AST Signature Match", result: "Supported", text: "Verified statically against pallets/flask default branch." }
    },
    "pallets/flask#4912": {
      repo: "pallets/flask", type: "issue", number: 4912, seconds: 1, coverage: 100,
      claims: [
        { 
          text: "Flask.__init__ has no parameter named instance_path", 
          status: "Contradicted", 
          where: "Contradicted by src/flask/app.py • Lines 5–10",
          evidence: { 
            path: "src/flask/app.py", start: 5, end: 10, 
            url: "https://github.com/pallets/flask/blob/main/src/flask/app.py#L5-L10",
            lines: [[5, "    def __init__("], [6, "        self,"], [7, "        import_name: str,"], [8, "        static_url_path: str = None,"], [9, "        instance_path: str = None,"], [10, "    ) -> None:"]]
          }
        }
      ],
      repro: { chip: "Contradicted ✗", test: "AST Contradiction Check", result: "Contradicted", text: "The claim asserts instance_path is missing, but it is explicitly declared in Flask.__init__." }
    },
    "psf/requests#6180": {
      repo: "psf/requests", type: "issue", number: 6180, seconds: 1, coverage: 0,
      claims: [
        { 
          text: "Requests causes segfault in OpenSSL on custom embedded MIPS build", 
          status: "Unverified", 
          where: "Cannot verify without reproducible hardware environment",
          evidence: null
        }
      ],
      repro: { chip: "Unverified ?", test: "Execution Guardrail", result: "Unverified", text: "Sortfolio does not execute unknown code. Ambiguous runtime behavior correctly left unverified." }
    },
    "tiangolo/fastapi#9820": {
      repo: "tiangolo/fastapi", type: "issue", number: 9820, seconds: 2, coverage: 100,
      claims: [
        { 
          text: "APIRouter accepts dependencies parameter in definition", 
          status: "Supported", 
          where: "Found in fastapi/routing.py • Lines 18–24",
          evidence: { 
            path: "fastapi/routing.py", start: 18, end: 24, 
            url: "https://github.com/tiangolo/fastapi/blob/main/fastapi/routing.py#L18-L24",
            lines: [[18, "class APIRouter(routing.Router):"], [19, "    def __init__("], [20, "        self,"], [21, "        routes: Optional[Sequence[BaseRoute]] = None,"], [22, "        dependencies: Optional[Sequence[Depends]] = None,"], [23, "        default_response_class: Type[Response] = Default(JSONResponse),"], [24, "    ) -> None:"]]
          }
        }
      ],
      repro: { chip: "Verified ✓", test: "AST Class Inspection", result: "Supported", text: "Confirmed in fastapi/routing.py APIRouter.__init__." }
    },
    "pallets/flask#100": {
      repo: "pallets/flask", type: "pull", number: 100, seconds: 2, coverage: 100,
      claims: [
        { 
          text: "This PR adds provide_automatic_options to add_url_rule in src/flask/app.py", 
          status: "Supported", 
          where: "Modified in src/flask/app.py diff chunk",
          evidence: { 
            path: "src/flask/app.py", start: 10, end: 14, 
            url: "https://github.com/pallets/flask/pull/100",
            lines: [[10, "         rule: str,"], [11, "+        provide_automatic_options: bool = None,"], [12, "+        endpoint: str = None,"], [13, "         view_func = None"]]
          }
        }
      ],
      repro: { chip: "Diff Verified ✓", test: "Git Unified Diff Check", result: "Supported", text: "Unified diff inspection confirms the added lines in PR #100." }
    }
  }
};

