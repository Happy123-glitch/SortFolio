import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBenchmark } from '../scripts/evaluate_benchmark.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

test('Automated Benchmark & Metrics Evaluation', async (t) => {
  await t.test('runBenchmark calculates 100% precision and saves results', async () => {
    const summary = await runBenchmark();
    assert.ok(summary);
    assert.equal(summary.precisionPercent, 100);
    assert.equal(summary.uncertaintyQualityPercent, 100);
    assert.equal(summary.evidenceCoveragePercent, 100);
    assert.equal(summary.falsePositiveRatePercent, 0);

    const jsonPath = path.join(ROOT_DIR, 'examples', 'benchmark_results.json');
    assert.ok(fs.existsSync(jsonPath), 'benchmark_results.json must exist');
    const saved = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.equal(saved.totalCases, 4);
    assert.equal(saved.cases.length, 4);
  });
});
