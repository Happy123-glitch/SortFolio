import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SortfolioAPI } from '../js/api.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

test('Phase 1: Database Schema & Client Contract', async (t) => {
  const migrationPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261031000000_init_sortfolio_schema.sql'
  );

  await t.test('Migration SQL file exists', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration SQL file must exist');
  });

  const sql = fs.readFileSync(migrationPath, 'utf8');

  await t.test('All required tables are defined with exact schema names', () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.analysis_runs/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.claims/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.evidence_items/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.model_runs/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.evaluation_cases/i);
  });

  await t.test('Foreign keys and cascade deletions are configured', () => {
    assert.match(sql, /REFERENCES public\.analysis_runs\(id\) ON DELETE CASCADE/i);
    assert.match(sql, /REFERENCES public\.claims\(id\) ON DELETE CASCADE/i);
  });

  await t.test('Claim statuses include supported, contradicted, unverified', () => {
    assert.match(sql, /'supported'/);
    assert.match(sql, /'contradicted'/);
    assert.match(sql, /'unverified'/);
  });

  await t.test('Row Level Security (RLS) is enabled on all tables', () => {
    assert.match(sql, /ALTER TABLE public\.analysis_runs ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /ALTER TABLE public\.claims ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /ALTER TABLE public\.evidence_items ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /ALTER TABLE public\.model_runs ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /ALTER TABLE public\.evaluation_cases ENABLE ROW LEVEL SECURITY;/);
  });

  await t.test('SortfolioAPI client handles initialization and methods', () => {
    const api = new SortfolioAPI({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'mock-key',
    });
    assert.equal(api.supabaseUrl, 'https://example.supabase.co');
    assert.equal(api.supabaseAnonKey, 'mock-key');
    assert.equal(typeof api.triggerAnalysis, 'function');
    assert.equal(typeof api.getAnalysis, 'function');
  });
});
