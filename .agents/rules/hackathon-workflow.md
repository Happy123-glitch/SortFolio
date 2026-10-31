# Sortfolio Hackathon Development Rule

## Required Git Workflow
1. Never commit or push directly to `main`.
2. Always create a new feature/fix branch:
   `git checkout -b <branch-name>`
3. Every commit message must include the exact attribution trailer:
   ```
   <Commit title>

   Coding agent: Antigravity
   Models used in project: Qwen 2.5 7B
   ```
4. Push to remote and open a Pull Request using `.github/pull_request_template.md`.
5. Only merge into `main` after CI checks pass.

## Open-Weight Model Enforcement
- Only open-weight models (such as Qwen 2.5 7B, Llama 3, Mistral) are allowed for product inference.
- Do NOT use closed model APIs (OpenAI, Claude, Gemini) in the product runtime.
- Deterministic source inspection takes precedence; the LLM is bounded to claim extraction and summary of analyzer-verified facts only.
- Hallucinations of line numbers or file paths are strictly prohibited and must be filtered out.

## Privacy & Security
- Keep all secrets in `.env` (ignored by `.gitignore`) or Supabase Edge secrets.
- Never commit private tokens, keys, or credentials.
- Enable RLS on all Supabase tables.
