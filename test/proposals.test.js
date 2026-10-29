// Run with: node --test test/proposals.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../assets/js/proposals.js');

const issue = (n, overrides = {}) => ({
  number: n,
  title: `Proposal: Thing ${n}`,
  html_url: `https://github.com/visibledao/website/issues/${n}`,
  user: { login: 'member' },
  created_at: `2026-10-${String(n).padStart(2, '0')}T00:00:00Z`,
  comments: 0,
  reactions: { '+1': 0 },
  state: 'open',
  labels: [{ name: 'proposal' }],
  ...overrides,
});

test('a status label decides the group', () => {
  const groups = P.group([
    issue(1, { labels: [{ name: 'proposal' }, { name: 'status: active' }] }),
    issue(2, { labels: [{ name: 'proposal' }, { name: 'Status: Discontinued' }], state: 'closed' }),
    issue(3, { labels: ['proposal', 'status: proposed'] }),
  ]);
  assert.deepEqual(groups.active.map((p) => p.number), [1]);
  assert.deepEqual(groups.discontinued.map((p) => p.number), [2]);
  assert.deepEqual(groups.proposed.map((p) => p.number), [3]);
});

test('without a status label, open means proposed and closed means declined', () => {
  const groups = P.group([issue(1), issue(2, { state: 'closed' })]);
  assert.deepEqual(groups.proposed.map((p) => p.number), [1]);
  assert.deepEqual(groups.declined.map((p) => p.number), [2]);
});

test('pull requests are skipped, titles lose the "Proposal:" prefix, newest comes first', () => {
  const groups = P.group([issue(1), issue(2, { pull_request: {} }), issue(3, { reactions: { '+1': 4 } })]);
  assert.deepEqual(groups.proposed.map((p) => [p.number, p.title, p.support]), [
    [3, 'Thing 3', 4],
    [1, 'Thing 1', 0],
  ]);
});
