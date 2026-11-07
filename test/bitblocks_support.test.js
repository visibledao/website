// Run with: node --test test/bitblocks_support.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../assets/js/bitblocks-support.js');

const body = (overrides = {}) => ({
  data: {
    costs: [{ item: 'Bitcoin SV full node and hosting', usd: 1200 }],
    monthly_target_usd: 1200,
    bsv_address: '1Hs9u37fyWZNHKC9LCmup3m1TroNzKHGoT',
    received_sats_total: 50000000,
    received_sats_30d: 10000000,
    received_usd_30d: 300,
    ...overrides,
  },
});

test('the meter is received over target, shown as money and BSV', () => {
  const v = S.view(body());
  assert.equal(v.live, true);
  assert.equal(v.target, '$1,200');
  assert.equal(v.received, '$300');
  assert.equal(v.percent, 25);
  assert.equal(v.received30d, '0.1 BSV');
  assert.equal(v.receivedTotal, '0.5 BSV');
  assert.deepEqual(v.costs, [{ item: 'Bitcoin SV full node and hosting', usd: '$1,200' }]);
});

test('zero is a real answer: nobody has paid yet', () => {
  const v = S.view(body({ received_usd_30d: 0, received_sats_30d: 0, received_sats_total: 0 }));
  assert.equal(v.received, '$0');
  assert.equal(v.received30d, '0 BSV');
  assert.equal(v.percent, 0);
});

test('a null field shows as a dash, never as zero, and leaves the meter empty', () => {
  const v = S.view(body({ received_usd_30d: null, received_sats_total: null, bsv_address: null }));
  assert.equal(v.received, S.DASH);
  assert.equal(v.receivedTotal, S.DASH);
  assert.equal(v.percent, null);
  assert.equal(v.address, null);
  assert.equal(v.target, '$1,200');
});

test('a failed fetch shows dashes everywhere and no address', () => {
  for (const failed of [null, undefined, {}, { data: null }]) {
    const v = S.view(failed);
    assert.equal(v.live, false);
    for (const key of ['target', 'received', 'received30d', 'receivedTotal']) {
      assert.equal(v[key], S.DASH, key);
    }
    assert.equal(v.percent, null);
    assert.deepEqual(v.costs, []);
    assert.equal(v.address, null);
  }
});

test('the meter stops at 100 percent when a month is oversubscribed', () => {
  assert.equal(S.view(body({ received_usd_30d: 5000 })).percent, 100);
});

test('small amounts keep their cents', () => {
  assert.equal(S.usd(12.34), '$12.34');
  assert.equal(S.usd(1234.56), '$1,235');
});
