import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createUsersStore(options = {}) {
  const values = new Map();
  if (options.initialUsers) values.set('sf_users', JSON.stringify(options.initialUsers));
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (options.blockWrites) throw new Error('Storage unavailable');
      values.set(key, value);
    },
  };
  const context = { window: {}, localStorage };
  vm.runInNewContext(fs.readFileSync(new URL('../js/users.js', import.meta.url), 'utf8'), context);
  return context.window.SFUsers;
}

test('SFUsers.update saves profile edits without replacing account metadata', () => {
  const users = createUsersStore();
  const account = { name: 'Old Name', email: 'old@example.com', hash: 'password-hash', created: 123 };
  assert.equal(users.add(account), true);

  assert.equal(users.update(account.email, { name: 'New Name', email: 'new@example.com' }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(users.find('new@example.com'))), {
    name: 'New Name',
    email: 'new@example.com',
    hash: 'password-hash',
    created: 123,
  });
  assert.equal(users.find('old@example.com'), null);
});

test('SFUsers.update reports missing accounts and blocked storage writes', () => {
  assert.equal(createUsersStore().update('missing@example.com', { name: 'Name' }), false);

  const users = createUsersStore({
    blockWrites: true,
    initialUsers: [{ name: 'Existing', email: 'existing@example.com', hash: 'hash', created: 123 }],
  });
  assert.equal(users.update('existing@example.com', { name: 'Name' }), false);
});
