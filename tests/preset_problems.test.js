import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SortfolioAPI } from '../js/api.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

test('Feature: Preset Sample Problems for Demo & Evaluation', async (t) => {
  const presetFilePath = path.join(ROOT_DIR, 'examples', 'preset_problems.json');

  await t.test('examples/preset_problems.json exists and is valid JSON', () => {
    assert.ok(fs.existsSync(presetFilePath), 'preset_problems.json must exist in examples/');
    const raw = fs.readFileSync(presetFilePath, 'utf8');
    const data = JSON.parse(raw);
    assert.ok(Array.isArray(data), 'Preset problems must be an array');
    assert.ok(data.length >= 3, 'Must have at least 3 curated demo scenarios');
  });

  await t.test('Preset problems cover all required triage outcomes', () => {
    const raw = fs.readFileSync(presetFilePath, 'utf8');
    const presets = JSON.parse(raw);

    const statuses = presets.map((p) => p.expectedStatus);
    assert.ok(statuses.includes('supported'), 'Must include a Supported demo case');
    assert.ok(statuses.includes('contradicted'), 'Must include a Contradicted demo case');
    assert.ok(statuses.includes('unverified'), 'Must include an Unverified demo case');
  });

  await t.test('Preset items include valid metadata and target repositories', () => {
    const raw = fs.readFileSync(presetFilePath, 'utf8');
    const presets = JSON.parse(raw);

    for (const item of presets) {
      assert.ok(item.id, 'Every preset must have an id');
      assert.ok(item.title, 'Every preset must have a title');
      assert.match(item.repo, /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Repo must be owner/name');
      assert.ok(typeof item.issueNumber === 'number' && item.issueNumber > 0, 'Issue number must be positive number');
      assert.ok(item.claimText, 'Claim text must not be empty');
      assert.ok(item.description, 'Description must explain the scenario');
    }
  });

  await t.test('SortfolioAPI getPresetProblems() returns available demo cases', async () => {
    const api = new SortfolioAPI({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'mock-key',
    });

    const presets = await api.getPresetProblems();
    assert.ok(Array.isArray(presets));
    assert.ok(presets.length >= 3);
    assert.equal(typeof presets[0].title, 'string');
    assert.ok(presets[0].repo);
  });
});
