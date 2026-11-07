// Run with: node --test test/flows_model.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../assets/js/flows-model.js');

const base = (overrides = {}) => ({
  seed: 1,
  vary: false,
  backfill: false,
  sources: [],
  expenses: [
    { id: 'node', target: 1000, surplus: 'rollover', status: 'active' },
    { id: 'stipends', target: 600, surplus: 'sweep', status: 'active' },
  ],
  ...overrides,
});

const bal = (state, id) => M.total(state.lots[id] || []);
const routes = (phase) => phase.entries.map((e) => [e.from, e.to, e.amount]);
const phase = (phases, name) => phases.find((p) => p.name === name);

test('all revenue is received into intake first, one entry per inflow, and intake ends the month empty', () => {
  const config = base({
    sources: [
      { id: 'dues', monthly: 300, earmark: null },
      { id: 'sponsors', monthly: 500, earmark: 'node' },
    ],
  });
  const { state, phases } = M.step(M.createState(), config);

  assert.deepEqual(routes(phase(phases, 'receive')), [
    ['dues', 'intake', 300],
    ['sponsors', 'intake', 500],
  ]);
  assert.equal(M.total(phase(phases, 'receive').lots.intake), 800);
  assert.equal(bal(state, 'intake'), 0);
});

test('allocation pays each active expense directly from intake, in priority order, with the rest to the general fund', () => {
  const config = base({ sources: [{ id: 'dues', monthly: 2000, earmark: null }] });
  const { state, phases } = M.step(M.createState(), config);

  assert.deepEqual(routes(phase(phases, 'allocate')), [
    ['intake', 'node', 1000],
    ['intake', 'stipends', 600],
    ['intake', 'general', 400],
  ]);
  assert.equal(state.history[0].expenses.every((e) => e.shortfall === 0), true);
  assert.equal(bal(state, 'general'), 400);
});

test('proposed and discontinued expenses receive nothing', () => {
  const config = base({
    sources: [{ id: 'dues', monthly: 2000, earmark: null }],
    expenses: [
      { id: 'node', target: 1000, surplus: 'rollover', status: 'proposed' },
      { id: 'stipends', target: 600, surplus: 'sweep', status: 'discontinued' },
    ],
  });
  const { state } = M.step(M.createState(), config);

  assert.equal(bal(state, 'general'), 2000);
  assert.deepEqual(
    state.history[0].expenses.map((e) => [e.id, e.status, e.paid]),
    [
      ['node', 'proposed', 0],
      ['stipends', 'discontinued', 0],
    ]
  );
});

test('money earmarked for a proposed expense is held, still restricted, until the expense is approved', () => {
  const sources = [{ id: 'sponsors', monthly: 700, earmark: 'node' }];
  const proposed = base({
    sources,
    expenses: [{ id: 'node', target: 1000, surplus: 'rollover', status: 'proposed' }],
  });
  let { state } = M.step(M.createState(), proposed);
  assert.equal(state.history[0].held, 700);
  assert.equal(state.lots.general.every((l) => l.restricted && l.earmark === 'node'), true);

  const approved = base({
    sources,
    expenses: [{ id: 'node', target: 1000, surplus: 'rollover', status: 'active' }],
  });
  state = M.step(state, approved).state;
  assert.equal(state.history[1].expenses[0].paid, 1000);
  assert.equal(bal(state, 'node'), 400);
  assert.equal(state.history[1].held, 0);
});

test('backfill never spends money held for another purpose', () => {
  const config = base({
    backfill: true,
    sources: [{ id: 'sponsors', monthly: 500, earmark: 'node' }],
    expenses: [
      { id: 'node', target: 1000, surplus: 'rollover', status: 'proposed' },
      { id: 'stipends', target: 600, surplus: 'sweep', status: 'active' },
    ],
  });
  const { state } = M.step(M.createState(), config);
  assert.equal(state.history[0].expenses[1].shortfall, 600);
  assert.equal(state.history[0].held, 500);
});

test('discontinuing an expense returns its leftovers; restricted money stays restricted', () => {
  const sources = [
    { id: 'sponsors', monthly: 1500, earmark: 'node' },
    { id: 'dues', monthly: 0, earmark: null },
  ];
  let { state } = M.step(M.createState(), base({ sources }));
  assert.equal(bal(state, 'node'), 500);

  const config = base({
    sources: [],
    expenses: [
      { id: 'node', target: 1000, surplus: 'rollover', status: 'discontinued' },
      { id: 'stipends', target: 600, surplus: 'sweep', status: 'active' },
    ],
  });
  state = M.step(state, config).state;
  assert.equal(bal(state, 'node'), 0);
  assert.equal(state.history[1].held, 500);
});

test('earmarked surplus stays restricted in its active expense and is never swept', () => {
  const config = base({ sources: [{ id: 'grants', monthly: 900, earmark: 'stipends' }] });
  const { state } = M.step(M.createState(), config);

  assert.equal(bal(state, 'stipends'), 300);
  assert.equal(state.lots.stipends.every((l) => l.restricted), true);
  assert.equal(bal(state, 'general'), 0);
});

test('a short month records the shortfall; backfill from the general fund covers it', () => {
  const sources = [{ id: 'dues', monthly: 2000, earmark: null }];
  let { state } = M.step(M.createState(), base({ sources }));
  assert.equal(bal(state, 'general'), 400);

  const lean = [{ id: 'dues', monthly: 1200, earmark: null }];
  const withoutBackfill = M.step(state, base({ sources: lean })).state;
  assert.equal(withoutBackfill.history[1].expenses[1].shortfall, 400);

  const withBackfill = M.step(state, base({ sources: lean, backfill: true })).state;
  assert.equal(withBackfill.history[1].expenses[1].shortfall, 0);
  assert.equal(bal(withBackfill, 'general'), 0);
});

test('rolled-over reserves reduce next month need', () => {
  const config = base({ sources: [{ id: 'sponsors', monthly: 1500, earmark: 'node' }] });
  let { state } = M.step(M.createState(), config);
  assert.equal(bal(state, 'node'), 500);

  const dues = base({ sources: [{ id: 'dues', monthly: 700, earmark: null }] });
  state = M.step(state, dues).state;
  // node needed only 500 of the 700; the other 200 went straight to stipends
  assert.equal(state.history[1].expenses[0].paid, 1000);
  assert.equal(state.history[1].expenses[1].paid, 200);
});

test('restricted money is spent before unrestricted money', () => {
  const config = base({
    sources: [
      { id: 'dues', monthly: 600, earmark: null },
      { id: 'sponsors', monthly: 600, earmark: 'node' },
    ],
  });
  const { state } = M.step(M.createState(), config);
  assert.deepEqual(state.history[0].expenses[0].bySource, { sponsors: 600, dues: 400 });
});

test('every dollar is accounted for across two years of varying months and changing statuses', () => {
  const sources = [
    { id: 'dues', monthly: 150, earmark: null },
    { id: 'donations', monthly: 400, earmark: null },
    { id: 'sponsors', monthly: 700, earmark: 'node' },
    { id: 'grants', monthly: 500, earmark: 'stipends' },
  ];
  let state = M.createState();
  for (let i = 0; i < 24; i++) {
    const config = base({
      vary: true,
      backfill: i % 2 === 0,
      sources,
      expenses: [
        { id: 'node', target: 1000, surplus: 'rollover', status: M.STATUSES[i % 3] },
        { id: 'stipends', target: 600, surplus: 'sweep', status: M.STATUSES[(i + 1) % 3] },
      ],
    });
    state = M.step(state, config).state;
    assert.equal(M.holdings(state), M.totalInflow(state), `month ${state.month}`);
    assert.equal(bal(state, 'intake'), 0, `intake empty in month ${state.month}`);
  }
  assert.ok(M.totalInflow(state) > 0);
});

test('the same seed replays the same months', () => {
  const config = base({ vary: true, sources: [{ id: 'dues', monthly: 1000, earmark: null }] });
  const a = M.step(M.step(M.createState(), config).state, config).state;
  const b = M.step(M.step(M.createState(), config).state, config).state;
  assert.deepEqual(a.history, b.history);
});
