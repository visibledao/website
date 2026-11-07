// Stock-and-flow model of Visible DAO funds, stepped one month at a time.
//
// A month has two distinct halves:
//   1. Intake: every inflow is received into one stock, "intake", as its own entry.
//   2. Allocation: intake is split across expenses, each independently,
//      in priority order. Whatever no expense needs goes to the general fund.
//
// Expenses are modules with a status: proposed, active, or discontinued.
// Only active expenses hold or spend money.
//
// Every dollar is a "lot" that remembers where it came from (its source),
// whether it is earmarked for an expense (restricted), and which month it arrived.
// Every movement is written to the ledger, so the view can show provenance and receipts.
//
// Pure and synchronous: no DOM, no randomness beyond the seeded generator.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INTAKE = 'intake';
  const GENERAL = 'general';
  const PAID = 'paid';
  const STATUSES = ['proposed', 'active', 'discontinued'];

  // mulberry32: small seeded PRNG so a given seed replays the same months
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const total = (lots) => lots.reduce((sum, lot) => sum + lot.amount, 0);
  const isActive = (expense) => (expense.status || 'active') === 'active';

  function pushLot(lots, lot) {
    if (lot.amount <= 0) return;
    const same = lots.find(
      (l) => l.source === lot.source && l.earmark === lot.earmark && l.month === lot.month
    );
    if (same) same.amount += lot.amount;
    else {
      lots.push({
        source: lot.source,
        earmark: lot.earmark,
        restricted: lot.restricted,
        month: lot.month,
        amount: lot.amount,
      });
    }
  }

  // Spend/move order: restricted money first (its purpose is being met), then oldest first.
  function spendOrder(a, b) {
    if (a.restricted !== b.restricted) return a.restricted ? -1 : 1;
    return a.month - b.month;
  }

  // Remove up to `amount` from `lots` (mutating), returning the lots taken.
  function takeLots(lots, amount, filter) {
    const taken = [];
    let remaining = amount;
    const ordered = lots.filter(filter || (() => true)).sort(spendOrder);
    for (const lot of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(lot.amount, remaining);
      lot.amount -= take;
      remaining -= take;
      taken.push({ ...lot, amount: take });
    }
    for (let i = lots.length - 1; i >= 0; i--) if (lots[i].amount <= 0) lots.splice(i, 1);
    return taken;
  }

  function createState() {
    return {
      month: 0,
      seq: 0,
      lots: { [INTAKE]: [], [GENERAL]: [] },
      paid: [],
      ledger: [],
      history: [],
    };
  }

  function inflowAmount(source, config, rand) {
    const factor = config.vary ? 0.6 + 0.8 * rand() : 1;
    return Math.max(0, Math.round(source.monthly * factor));
  }

  // Advance one month. Returns { state, phases } where each phase carries the
  // ledger entries it produced and a snapshot of the stocks after it ran.
  function step(prev, config) {
    const s = clone(prev);
    const m = (s.month += 1);
    const rand = rng((config.seed || 1) * 1000 + m);
    const expenses = config.expenses;
    const byId = new Map(expenses.map((e) => [e.id, e]));
    const active = expenses.filter(isActive);
    s.lots[INTAKE] = s.lots[INTAKE] || [];
    expenses.forEach((e) => (s.lots[e.id] = s.lots[e.id] || []));

    const phases = [];
    let entries = [];
    const record = (from, to, lot, phase) => {
      const e = {
        seq: ++s.seq,
        month: m,
        phase,
        from,
        to,
        amount: lot.amount,
        source: lot.source,
        restricted: lot.restricted,
      };
      s.ledger.push(e);
      entries.push(e);
    };
    const move = (from, to, lot, phase) => {
      record(from, to, lot, phase);
      pushLot(s.lots[to], lot);
    };
    const close = (name) => {
      phases.push({ name, entries, lots: clone(s.lots), paid: clone(s.paid) });
      entries = [];
    };
    const need = (e) => Math.max(0, e.target - total(s.lots[e.id]));

    // 1. Intake: every inflow is received, as its own entry, before anything is allocated.
    //    An earmark only counts if it names an expense that exists.
    const inflows = config.sources.map((src) => ({ src, amount: inflowAmount(src, config, rand) }));
    for (const { src, amount } of inflows) {
      if (amount <= 0) continue;
      const earmark = src.earmark && byId.has(src.earmark) ? src.earmark : null;
      move(src.id, INTAKE, { source: src.id, earmark, restricted: !!earmark, month: m, amount }, 'receive');
    }
    close('receive');

    // 2. Allocation: each expense draws from intake on its own, never from another expense.
    //    a. Earmarked money held in the general fund is released to its expense once it is active.
    for (const lot of takeLots(s.lots[GENERAL], Infinity, (l) => l.restricted && isActive(byId.get(l.earmark) || {}))) {
      move(GENERAL, lot.earmark, lot, 'allocate');
    }
    //    b. This month's earmarked money goes to its expense if active, otherwise it is held,
    //       still restricted, in the general fund: the giver's intent travels with the coin.
    for (const lot of takeLots(s.lots[INTAKE], Infinity, (l) => l.restricted)) {
      move(INTAKE, isActive(byId.get(lot.earmark)) ? lot.earmark : GENERAL, lot, 'allocate');
    }
    //    c. Unrestricted money covers each active expense's need in priority order.
    for (const e of active) {
      for (const lot of takeLots(s.lots[INTAKE], need(e))) move(INTAKE, e.id, lot, 'allocate');
    }
    //    d. Whatever is left goes to the general fund. Intake ends every month empty.
    for (const lot of takeLots(s.lots[INTAKE], Infinity)) move(INTAKE, GENERAL, lot, 'allocate');
    close('allocate');

    // 3. Optionally, unrestricted money in the general fund tops up underfunded active expenses.
    if (config.backfill) {
      for (const e of active) {
        for (const lot of takeLots(s.lots[GENERAL], need(e), (l) => !l.restricted)) {
          move(GENERAL, e.id, lot, 'backfill');
        }
      }
    }
    close('backfill');

    // 4. Each active expense pays its monthly target, or whatever it holds.
    const summary = [];
    for (const e of expenses) {
      const status = e.status || 'active';
      if (!isActive(e)) {
        summary.push({ id: e.id, status, target: e.target, paid: 0, shortfall: 0, bySource: {} });
        continue;
      }
      const spent = takeLots(s.lots[e.id], e.target);
      const bySource = {};
      for (const lot of spent) {
        record(e.id, PAID, lot, 'spend');
        pushLot(s.paid, { ...lot, month: m });
        bySource[lot.source] = (bySource[lot.source] || 0) + lot.amount;
      }
      const paid = total(spent);
      summary.push({ id: e.id, status, target: e.target, paid, shortfall: e.target - paid, bySource });
    }
    close('spend');

    // 5. Return leftovers to the general fund.
    //    Expenses that are not active hold nothing: all of it returns, and restricted money stays restricted.
    //    Active expenses set to "sweep" return unrestricted leftovers; restricted leftovers roll over.
    for (const e of expenses) {
      const filter = isActive(e) ? (e.surplus === 'sweep' ? (l) => !l.restricted : () => false) : null;
      for (const lot of takeLots(s.lots[e.id], Infinity, filter)) move(e.id, GENERAL, lot, 'return');
    }
    close('return');

    s.history.push({
      month: m,
      inflows: Object.fromEntries(inflows.map(({ src, amount }) => [src.id, amount])),
      expenses: summary,
      general: total(s.lots[GENERAL]),
      held: total(s.lots[GENERAL].filter((l) => l.restricted)),
    });

    return { state: s, phases };
  }

  // Sum of every stock; should always equal the sum of every inflow.
  function holdings(state) {
    return Object.values(state.lots).reduce((sum, lots) => sum + total(lots), 0) + total(state.paid);
  }

  function totalInflow(state) {
    return state.history.reduce(
      (sum, h) => sum + Object.values(h.inflows).reduce((a, b) => a + b, 0),
      0
    );
  }

  return { INTAKE, GENERAL, PAID, STATUSES, createState, step, total, holdings, totalInflow, rng };
});
