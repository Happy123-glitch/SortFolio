import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

test('Project file integrity & hackathon rules compliance', async (t) => {
  await t.test('.gitignore exists and blocks sensitive secrets', () => {
    const gitignorePath = path.join(ROOT_DIR, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.match(content, /\.env/, '.gitignore must block .env files');
    assert.match(content, /secrets\//, '.gitignore must block secrets/');
    assert.match(content, /\.DS_Store/, '.gitignore must block .DS_Store');
  });

  await t.test('HACKATHON.md exists and specifies Problem 02', () => {
    const hackathonPath = path.join(ROOT_DIR, 'HACKATHON.md');
    assert.ok(fs.existsSync(hackathonPath), 'HACKATHON.md must exist');
    const content = fs.readFileSync(hackathonPath, 'utf8');
    assert.match(content, /Problem number[:*\s]+02/i, 'Must define Problem 02');
    assert.match(content, /Sortfolio/i, 'Must specify Sortfolio');
  });

  await t.test('.github/pull_request_template.md enforces AI model disclosure', () => {
    const prTemplatePath = path.join(ROOT_DIR, '.github', 'pull_request_template.md');
    assert.ok(fs.existsSync(prTemplatePath), 'PR template must exist');
    const content = fs.readFileSync(prTemplatePath, 'utf8');
    assert.match(content, /Models the product uses in this PR/i, 'Must ask for models used');
    assert.match(content, /AI coding assistants that helped write it/i, 'Must ask for AI assistants');
  });

  await t.test('AGENTS.md defines mandatory PR & commit rules', () => {
    const agentsRulePath = path.join(ROOT_DIR, 'AGENTS.md');
    assert.ok(fs.existsSync(agentsRulePath), 'AGENTS.md must exist');
    const content = fs.readFileSync(agentsRulePath, 'utf8');
    assert.match(content, /Coding agent:/, 'Must mandate coding agent in commit footer');
    assert.match(content, /Models used in project:/, 'Must mandate project models in commit footer');
  });
});
