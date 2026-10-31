import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createBackend(options = {}) {
  const calls = [];
  const profile = { id: 'user-1', full_name: 'Sample User', contact_email: 'user@example.com', created_at: '2026-01-01T00:00:00Z' };
  const user = { id: 'user-1', email: 'user@example.com', user_metadata: { full_name: 'Sample User' } };
  const query = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    maybeSingle: async () => ({ data: options.missingProfile ? null : profile, error: null }),
    insert(value) { calls.push(['insert', value]); return this; },
    upsert(value, settings) { calls.push(['upsert', value, settings]); return this; },
    single: async () => ({ data: profile, error: null }),
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      signInWithPassword: async (value) => { calls.push(['signInWithPassword', value]); return { data: { user, session: { user } }, error: null }; },
      signUp: async (value) => { calls.push(['signUp', value]); return { data: { user, session: { user } }, error: null }; },
      signInAnonymously: async (value) => { calls.push(['signInAnonymously', value]); return { data: { user, session: { user } }, error: null }; },
      updateUser: async (value) => { calls.push(['updateUser', value]); return { data: { user }, error: null }; },
      signOut: async (value) => { calls.push(['signOut', value]); return { error: null }; },
    },
    from: (table) => { calls.push(['from', table]); return query; },
  };
  const window = {
    SF_SUPABASE_URL: Object.hasOwn(options, 'url') ? options.url : 'https://example.supabase.co',
    SF_SUPABASE_KEY: Object.hasOwn(options, 'key') ? options.key : 'public-anon-key',
    supabase: { createClient: (...args) => { calls.push(['createClient', ...args]); return client; } },
  };
  const context = {
    window,
    localStorage: { getItem: () => null },
    Date,
  };
  vm.runInNewContext(fs.readFileSync(new URL('../js/backend.js', import.meta.url), 'utf8'), context);
  return { backend: window.SFBackend, calls, profile, user };
}

test('SFBackend authenticates through Supabase and preserves clear session semantics', async () => {
  const { backend, calls } = createBackend();
  assert.equal(backend.isReady(), true);
  assert.equal((await backend.getSession()).user.id, 'user-1');
  await backend.signIn('user@example.com', 'password');
  await backend.signUp('New User', 'new@example.com', 'password123');
  await backend.signInAnonymously();
  await backend.verifyPassword('current-password');
  await backend.updateAccount({ password: 'new-password' });
  await backend.signOut();
  assert.equal(calls.find(([method]) => method === 'signOut')[1].scope, 'local');
  assert.equal(calls.find(([method]) => method === 'signUp')[1].options.data.full_name, 'New User');
});

test('SFBackend reads and writes a profile scoped to the authenticated user', async () => {
  const { backend, calls, profile } = createBackend();
  assert.deepEqual(await backend.getProfile(), profile);
  assert.deepEqual(await backend.saveProfile({ full_name: 'Updated User', contact_email: 'updated@example.com' }), profile);
  assert.ok(calls.some(([method, table]) => method === 'from' && table === 'profiles'));
  const upsert = calls.find(([method]) => method === 'upsert');
  assert.equal(upsert[1].id, 'user-1');
  assert.equal(upsert[1].full_name, 'Updated User');
});

test('SFBackend reports missing configuration instead of returning success-shaped fallbacks', async () => {
  const { backend } = createBackend({ url: '', key: '' });
  assert.equal(backend.isReady(), false);
  await assert.rejects(backend.getSession(), /not configured/);
});

test('profile migration enables owner-only RLS and creates profiles for new auth users', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261101000000_profiles.sql', import.meta.url), 'utf8');
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /auth\.uid\(\) = id/g);
  assert.match(migration, /AFTER INSERT ON auth\.users/);
  assert.match(migration, /CREATE TRIGGER on_auth_user_created_profile/);
});
