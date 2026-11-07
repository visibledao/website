// View for /lab/flows: draws intake, expenses and the general fund, animates coins
// along the ledger entries each month produces, and chains a SHA-256 receipt over
// every entry. All accounting lives in flows-model.js; this file only reads its output.
(function () {
  'use strict';

  const M = window.FlowModel;
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Illustrative defaults. The node's $1,200/month is a real bill; everything else is a placeholder.
  const DEFAULTS = {
    seed: 7,
    vary: true,
    backfill: false,
    sources: [
      { id: 'dues', name: 'Membership dues', color: '#1e293b', monthly: 150, earmark: null },
      { id: 'donations', name: 'Donations', color: '#ffffff', monthly: 400, earmark: null },
      { id: 'sponsors', name: 'Node sponsors', color: '#f97316', monthly: 700, earmark: 'node' },
      { id: 'grants', name: 'Grants', color: '#92400e', monthly: 500, earmark: 'stipends' },
    ],
    expenses: [
      {
        id: 'tools',
        name: 'Tools & hosting',
        target: 100,
        surplus: 'rollover',
        status: 'active',
        note: 'Placeholder. The domain and services the DAO already uses.',
      },
      {
        id: 'community',
        name: 'Community',
        target: 200,
        surplus: 'sweep',
        status: 'active',
        note: 'Placeholder. Office Hours, onboarding, and small events.',
      },
      {
        id: 'node',
        name: 'Bitblocks node',
        target: 1200,
        surplus: 'rollover',
        status: 'proposed',
        note: 'The full node behind bitblocks.app, a free public BSV explorer and API. One member pays it today. Should the DAO take it on?',
      },
      {
        id: 'stipends',
        name: 'Contributor stipends',
        target: 600,
        surplus: 'sweep',
        status: 'proposed',
        note: 'Placeholder. Paying whoever keeps the recurring roles turning, such as facilitator and treasurer.',
      },
    ],
  };

  const NEW_SOURCE_COLORS = ['#64748b', '#a16207', '#facc15', '#7c2d12', '#cbd5e1'];
  const STATUS_LABEL = { proposed: 'proposed', active: 'active', discontinued: 'discontinued' };

  let config = JSON.parse(JSON.stringify(DEFAULTS));
  let state = M.createState();
  let busy = false;
  let playing = false;
  let generalMax = 2000;
  let intakeMax = 3000;
  let added = 0;

  // ---------- geometry ----------

  const G = { w: 1000, h: 700, srcY: 60, paidY: 646 };
  const intake = { x: 380, y: 140, w: 240, h: 90 };
  const general = { x: 830, y: 330, w: 140, h: 260 };

  function expenseBox(i) {
    const n = config.expenses.length;
    const slot = 780 / n;
    return { x: 20 + i * slot + slot * 0.1, y: 340, w: slot * 0.8, h: 180 };
  }

  function sourceX(i) {
    const n = config.sources.length;
    return n === 1 ? 500 : 100 + i * (800 / (n - 1));
  }

  const expenseIndex = (id) => config.expenses.findIndex((e) => e.id === id);
  const expenseOf = (id) => config.expenses.find((e) => e.id === id);
  const sourceIndex = (id) => config.sources.findIndex((s) => s.id === id);
  const sourceOf = (id) => config.sources.find((s) => s.id === id);
  const statusOf = (e) => e.status || 'active';

  function nameOf(id) {
    if (id === M.INTAKE) return 'Received';
    if (id === M.GENERAL) return 'General fund';
    if (id === M.PAID) return 'Paid out';
    const e = expenseOf(id);
    if (e) return e.name;
    const s = sourceOf(id);
    return s ? s.name : id;
  }

  function inletOf(id) {
    if (id === M.INTAKE) return { x: intake.x + intake.w / 2, y: intake.y - 6 };
    if (id === M.GENERAL) return { x: general.x + general.w / 2, y: general.y - 6 };
    const b = expenseBox(expenseIndex(id));
    return { x: b.x + b.w / 2, y: b.y - 6 };
  }

  function pathFor(from, to) {
    const t = to === M.PAID ? null : inletOf(to);
    const si = sourceIndex(from);
    if (si >= 0) {
      const x = sourceX(si);
      return `M${x},${G.srcY + 16} C${x},${G.srcY + 60} ${t.x},${t.y - 50} ${t.x},${t.y}`;
    }
    if (from === M.INTAKE) {
      const o = { x: intake.x + intake.w / 2, y: intake.y + intake.h };
      return `M${o.x},${o.y} C${o.x},${o.y + 60} ${t.x},${t.y - 60} ${t.x},${t.y}`;
    }
    if (from === M.GENERAL) {
      const o = { x: general.x + 10, y: general.y + 4 };
      return `M${o.x},${o.y} C${o.x - 60},${o.y - 110} ${t.x},${t.y - 110} ${t.x},${t.y}`;
    }
    const b = expenseBox(expenseIndex(from));
    if (to === M.PAID) {
      return `M${b.x + 14},${b.y + b.h} L${b.x + 14},${G.paidY}`;
    }
    const lip = { x: b.x + b.w, y: b.y + 2 };
    return `M${lip.x},${lip.y} C${lip.x + 30},${lip.y - 40} ${t.x},${t.y - 40} ${t.x},${t.y}`;
  }

  // ---------- svg helpers ----------

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function text(parent, x, y, str, attrs) {
    const t = el('text', { x, y, ...attrs }, parent);
    t.textContent = str;
    return t;
  }

  function tank(box, id, cls, title) {
    el('clipPath', { id: `clip-${id}` }, layers.defs).appendChild(
      el('rect', { x: box.x, y: box.y, width: box.w, height: box.h })
    );
    const r = el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, class: 'fl-tank' }, layers.stocks);
    if (title) el('title', {}, r).textContent = title;
    el('g', { id: `fill-${id}`, 'clip-path': `url(#clip-${id})` }, layers.fills);
    el('path', {
      d: `M${box.x},${box.y} V${box.y + box.h} H${box.x + box.w} V${box.y}`,
      class: cls,
    }, layers.labels);
  }

  // ---------- static scene ----------

  const svg = $('flow-svg');
  let layers = {};

  function drawScene() {
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    const hatch = el('pattern', {
      id: 'hatch',
      width: 6,
      height: 6,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)',
    }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#fde047', 'stroke-width': 2, opacity: 0.85 }, hatch);

    layers = {
      defs,
      pipes: el('g', { class: 'fl-pipes' }, svg),
      stocks: el('g', {}, svg),
      fills: el('g', {}, svg),
      labels: el('g', {}, svg),
      coins: el('g', {}, svg),
    };

    // stage labels
    text(layers.labels, 20, 22, '1 · Intake', { class: 'fl-stage' });
    text(layers.labels, 20, 300, '2 · Allocation', { class: 'fl-stage' });

    // pipes: every source flows into intake; intake flows to each expense on its own
    config.sources.forEach((s) => {
      el('path', { d: pathFor(s.id, M.INTAKE), class: s.earmark ? 'fl-pipe fl-pipe-earmark' : 'fl-pipe' }, layers.pipes);
    });
    config.expenses.forEach((e) => {
      const st = statusOf(e);
      if (st === 'discontinued') return;
      el('path', { d: pathFor(M.INTAKE, e.id), class: st === 'active' ? 'fl-pipe' : 'fl-pipe fl-pipe-proposed' }, layers.pipes);
      if (st === 'active') el('path', { d: pathFor(e.id, M.PAID), class: 'fl-pipe fl-drain' }, layers.pipes);
    });
    el('path', { d: pathFor(M.INTAKE, M.GENERAL), class: 'fl-pipe' }, layers.pipes);
    if (config.backfill) {
      config.expenses.forEach((e) => {
        if (statusOf(e) === 'active') el('path', { d: pathFor(M.GENERAL, e.id), class: 'fl-pipe fl-backfill' }, layers.pipes);
      });
    }

    // sources
    config.sources.forEach((s, i) => {
      const x = sourceX(i);
      el('circle', { cx: x, cy: G.srcY, r: 14, fill: s.color, class: 'fl-coin-stroke' }, layers.stocks);
      text(layers.labels, x, G.srcY - 22, s.name, { class: 'fl-label', 'text-anchor': 'middle' });
      const earmark = s.earmark && expenseOf(s.earmark) ? ` · for ${nameOf(s.earmark)}` : '';
      text(layers.labels, x, G.srcY + 32, `${usd(s.monthly)}/mo${earmark}`, {
        class: 'fl-meta',
        'text-anchor': 'middle',
      });
    });

    // intake
    tank(intake, M.INTAKE, 'fl-wall', 'All revenue lands here first, before anything is allocated.');
    text(layers.labels, intake.x + intake.w / 2, intake.y + intake.h + 18, 'Received', {
      class: 'fl-label',
      'text-anchor': 'middle',
    });
    text(layers.labels, intake.x + intake.w + 10, intake.y + intake.h / 2 + 4, '', {
      id: 'intake-total',
      class: 'fl-meta',
    });

    // expenses
    config.expenses.forEach((e, i) => {
      const box = expenseBox(i);
      const st = statusOf(e);
      const g = el('g', { class: `fl-expense fl-${st}` }, layers.labels);
      tank(box, e.id, `fl-wall fl-wall-${st}`, e.note || e.name);
      const targetY = box.y + box.h / 3;
      el('line', { x1: box.x, x2: box.x + box.w, y1: targetY, y2: targetY, class: 'fl-target' }, g);
      text(g, box.x + box.w - 4, targetY - 5, `${usd(e.target)}/mo`, { class: 'fl-meta', 'text-anchor': 'end' });
      text(g, box.x, box.y + box.h + 18, e.name, { class: 'fl-label' });
      const meta = st === 'active' ? (e.surplus === 'sweep' ? 'active · surplus returns' : 'active · surplus rolls over') : STATUS_LABEL[st];
      text(g, box.x, box.y + box.h + 34, meta, { class: `fl-meta fl-status-${st}` });
      text(g, box.x + box.w / 2, box.y + 18, '', {
        id: `over-${e.id}`,
        class: 'fl-meta fl-over',
        'text-anchor': 'middle',
      });
    });

    // general fund
    tank(general, M.GENERAL, 'fl-wall', 'Unallocated money, plus earmarked money held until its expense is active.');
    text(layers.labels, general.x + general.w / 2, general.y + general.h + 18, 'General fund', {
      class: 'fl-label',
      'text-anchor': 'middle',
    });
    text(layers.labels, general.x + general.w / 2, general.y + general.h + 34, '', {
      id: 'general-total',
      class: 'fl-meta',
      'text-anchor': 'middle',
    });

    // paid out tray
    el('rect', { x: 20, y: G.paidY, width: 950, height: 22, class: 'fl-tray' }, layers.stocks);
    el('g', { id: 'fill-paid' }, layers.fills);
    text(layers.labels, 20, G.paidY + 40, '', { id: 'paid-total', class: 'fl-meta' });
  }

  // ---------- stocks ----------

  function drawLots(group, lots, x, bottom, w, scale) {
    group.innerHTML = '';
    let y = bottom;
    // bottom layer drains first: restricted, then oldest
    const ordered = lots.slice().sort((a, b) =>
      a.restricted !== b.restricted ? (a.restricted ? -1 : 1) : a.month - b.month
    );
    for (const lot of ordered) {
      const h = lot.amount * scale;
      y -= h;
      const color = sourceOf(lot.source) ? sourceOf(lot.source).color : '#94a3b8';
      el('rect', { x, y, width: w, height: h, fill: color, class: 'fl-lot' }, group).appendChild(
        el('title', {})
      ).textContent = `${usd(lot.amount)} from ${nameOf(lot.source)}, month ${lot.month}` +
        (lot.restricted ? ` (restricted to ${nameOf(lot.earmark)})` : '');
      if (lot.restricted) el('rect', { x, y, width: w, height: h, fill: 'url(#hatch)', 'pointer-events': 'none' }, group);
    }
  }

  function renderStocks(lots, paid) {
    const iLots = lots[M.INTAKE] || [];
    const iSum = M.total(iLots);
    while (iSum > intakeMax * 0.95) intakeMax *= 2;
    drawLots($(`fill-${M.INTAKE}`), iLots, intake.x, intake.y + intake.h, intake.w, intake.h / intakeMax);
    $('intake-total').textContent = iSum ? usd(iSum) : '';

    config.expenses.forEach((e, i) => {
      const box = expenseBox(i);
      const scale = (box.h * 2) / 3 / e.target;
      const held = lots[e.id] || [];
      drawLots($(`fill-${e.id}`), held, box.x, box.y + box.h, box.w, scale);
      const sum = M.total(held);
      $(`over-${e.id}`).textContent = sum * scale > box.h ? `${usd(sum)} held` : '';
    });

    const gLots = lots[M.GENERAL] || [];
    const gSum = M.total(gLots);
    const gHeld = M.total(gLots.filter((l) => l.restricted));
    while (gSum > generalMax * 0.95) generalMax *= 2;
    drawLots($(`fill-${M.GENERAL}`), gLots, general.x, general.y + general.h, general.w, general.h / generalMax);
    $('general-total').textContent = gHeld ? `${usd(gSum)} · ${usd(gHeld)} held` : usd(gSum);

    // paid tray: one bar split by which sources paid the bills, all time
    const tray = $('fill-paid');
    tray.innerHTML = '';
    const paidSum = M.total(paid);
    let x = 20;
    config.sources.forEach((s) => {
      const amt = M.total(paid.filter((l) => l.source === s.id));
      if (!amt) return;
      const w = (amt / paidSum) * 950;
      el('rect', { x, y: G.paidY, width: w, height: 22, fill: s.color, class: 'fl-lot' }, tray).appendChild(
        el('title', {})
      ).textContent = `${nameOf(s.id)} paid ${usd(amt)} (${Math.round((amt / paidSum) * 100)}%)`;
      x += w;
    });
    $('paid-total').textContent = paidSum
      ? `Paid out ${usd(paidSum)} so far · bar shows whose coins paid the bills`
      : 'Paid out';
  }

  // ---------- coins ----------

  function animatePhase(phase) {
    if (reduceMotion || !phase.entries.length) return Promise.resolve();
    const dur = 900;
    const stagger = Math.min(260, 1600 / phase.entries.length);
    const dots = [];
    phase.entries.forEach((e, k) => {
      const path = el('path', { d: pathFor(e.from, e.to), fill: 'none', stroke: 'none' }, layers.coins);
      const len = path.getTotalLength();
      const n = Math.max(1, Math.min(10, Math.round(e.amount / 60)));
      const color = sourceOf(e.source) ? sourceOf(e.source).color : '#94a3b8';
      for (let j = 0; j < n; j++) {
        const c = el('circle', { r: 6, fill: color, class: 'fl-coin-stroke', opacity: 0 }, layers.coins);
        dots.push({ c, path, len, delay: k * stagger + j * 55 });
      }
    });
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    return new Promise((resolve) => {
      const start = performance.now();
      function frame(now) {
        let alive = false;
        for (const d of dots) {
          const t = (now - start - d.delay) / dur;
          if (t > 1) {
            d.c.setAttribute('opacity', 0);
            continue;
          }
          alive = true;
          if (t < 0) continue;
          const p = d.path.getPointAtLength(ease(t) * d.len);
          d.c.setAttribute('cx', p.x);
          d.c.setAttribute('cy', p.y);
          d.c.setAttribute('opacity', 1);
        }
        if (alive) requestAnimationFrame(frame);
        else {
          layers.coins.innerHTML = '';
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  // ---------- receipts ----------

  const canon = (e) =>
    JSON.stringify([e.seq, e.month, e.phase, e.from, e.to, e.amount, e.source, e.restricted]);

  async function sha256(str) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    // insecure-context fallback (e.g. file://): FNV-1a, clearly not a real receipt
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    return 'fnv' + (h >>> 0).toString(16).padStart(8, '0');
  }

  async function stampReceipts() {
    let prev = '0'.repeat(64);
    for (const e of state.ledger) {
      if (!e.hash) {
        e.prev = prev;
        e.hash = await sha256(prev + canon(e));
      }
      prev = e.hash;
    }
  }

  async function verifyChain() {
    let prev = '0'.repeat(64);
    for (const e of state.ledger) {
      const expect = await sha256(prev + canon(e));
      if (e.prev !== prev || e.hash !== expect) return e;
      prev = e.hash;
    }
    return null;
  }

  // ---------- tables ----------

  function swatch(sourceId, restricted) {
    const s = sourceOf(sourceId);
    const color = s ? s.color : '#94a3b8';
    return `<span class="fl-swatch${restricted ? ' fl-swatch-restricted' : ''}" style="background-color:${color}"></span>`;
  }

  function renderSummary() {
    const h = state.history[state.history.length - 1];
    $('month-readout').textContent = state.month ? `Month ${state.month}` : 'Month 0';
    if (!h) {
      $('summary-body').innerHTML =
        '<tr><td colspan="4" class="fl-empty">Step a month to see who paid for what.</td></tr>';
      $('inflow-readout').textContent = '';
      return;
    }
    const received = Object.values(h.inflows).reduce((a, b) => a + b, 0);
    $('inflow-readout').textContent =
      `Received this month: ${usd(received)} (` +
      config.sources.map((s) => `${s.name} ${usd(h.inflows[s.id] || 0)}`).join(' · ') +
      ')' +
      (h.held ? ` · ${usd(h.held)} held for expenses not yet active` : '');
    $('summary-body').innerHTML = h.expenses
      .map((x) => {
        if (x.status !== 'active') {
          return `<tr class="fl-row-${x.status}"><td>${esc(nameOf(x.id))}</td><td class="fl-num">${usd(x.target)}</td><td>${STATUS_LABEL[x.status]}</td><td>—</td></tr>`;
        }
        const parts = Object.entries(x.bySource)
          .map(([src, amt]) => `${swatch(src)} ${esc(nameOf(src))} ${usd(amt)}`)
          .join('<br>');
        const result = x.shortfall > 0 ? `<span class="fl-short">short ${usd(x.shortfall)}</span>` : 'met';
        return `<tr><td>${esc(nameOf(x.id))}</td><td class="fl-num">${usd(x.target)}</td><td>${result}</td><td>${parts || '—'}</td></tr>`;
      })
      .join('');
  }

  function renderLedger(tamperedSeq) {
    const rows = state.ledger.slice(-60).reverse();
    $('ledger-count').textContent = `${state.ledger.length} entries`;
    $('ledger-body').innerHTML = rows.length
      ? rows
          .map(
            (e) => `<tr${e.seq === tamperedSeq ? ' class="fl-tampered"' : ''}>
<td class="fl-num">${e.seq}</td>
<td class="fl-num">${e.month}</td>
<td>${e.phase}</td>
<td>${esc(nameOf(e.from))}</td>
<td>${esc(nameOf(e.to))}</td>
<td>${swatch(e.source, e.restricted)}</td>
<td class="fl-num">${usd(e.amount)}</td>
<td class="fl-hash" title="prev ${e.prev || ''}">${e.hash ? e.hash.slice(0, 12) : '…'}</td>
</tr>`
          )
          .join('')
      : '<tr><td colspan="8" class="fl-empty">No entries yet.</td></tr>';
  }

  // ---------- controls ----------

  function renderControls() {
    $('sources-body').innerHTML = config.sources
      .map(
        (s, i) => `<tr>
<td><div class="fl-src">${swatch(s.id)}<input class="fl-input" type="text" value="${esc(s.name)}" data-src="${i}" data-field="name" aria-label="Revenue source name"></div></td>
<td><input class="fl-input" type="number" min="0" step="50" value="${s.monthly}" data-src="${i}" data-field="monthly" aria-label="${esc(s.name)} per month"></td>
<td><select class="fl-input" data-src="${i}" data-field="earmark" aria-label="${esc(s.name)} restriction">
<option value="">unrestricted</option>
${config.expenses
  .map((e) => `<option value="${e.id}"${s.earmark === e.id ? ' selected' : ''}>for ${esc(e.name)}</option>`)
  .join('')}
</select></td>
</tr>`
      )
      .join('');

    $('expenses-list').innerHTML = config.expenses
      .map((e, i) => {
        const st = statusOf(e);
        return `<li class="fl-card fl-card-${st}">
<div class="flex items-start gap-2">
<div class="flex flex-col">
<button type="button" class="fl-mini" data-move="${i}" data-dir="-1" aria-label="Raise ${esc(e.name)} priority"${i === 0 ? ' disabled' : ''}>▲</button>
<button type="button" class="fl-mini" data-move="${i}" data-dir="1" aria-label="Lower ${esc(e.name)} priority"${i === config.expenses.length - 1 ? ' disabled' : ''}>▼</button>
</div>
<input class="fl-input fl-input-title" type="text" value="${esc(e.name)}" data-exp="${i}" data-field="name" aria-label="Expense name">
<select class="fl-input fl-input-status" data-exp="${i}" data-field="status" aria-label="${esc(e.name)} status">
${M.STATUSES.map((v) => `<option value="${v}"${st === v ? ' selected' : ''}>${STATUS_LABEL[v]}</option>`).join('')}
</select>
</div>
<div class="mt-2 grid grid-cols-2 gap-2">
<label class="text-xs text-slate-600">$ / month
<input class="fl-input" type="number" min="1" step="50" value="${e.target}" data-exp="${i}" data-field="target">
</label>
<label class="text-xs text-slate-600">Surplus
<select class="fl-input" data-exp="${i}" data-field="surplus">
<option value="rollover"${e.surplus === 'rollover' ? ' selected' : ''}>rolls over</option>
<option value="sweep"${e.surplus === 'sweep' ? ' selected' : ''}>returns to general</option>
</select>
</label>
</div>
<label class="mt-2 block text-xs text-slate-600">Notes
<textarea class="fl-input" rows="2" data-exp="${i}" data-field="note" placeholder="Why this expense, who proposed it, what would end it.">${esc(e.note || '')}</textarea>
</label>
</li>`;
      })
      .join('');
  }

  function redrawAll() {
    drawScene();
    renderStocks(state.lots, state.paid);
    renderControls();
    renderSummary();
    renderLedger();
  }

  function onConfigInput(ev) {
    const t = ev.target;
    const field = t.dataset.field;
    if (t.dataset.src !== undefined) {
      const s = config.sources[+t.dataset.src];
      if (field === 'name') s.name = t.value.trim() || s.name;
      if (field === 'monthly') s.monthly = Math.max(0, +t.value || 0);
      if (field === 'earmark') s.earmark = t.value || null;
    } else if (t.dataset.exp !== undefined) {
      const e = config.expenses[+t.dataset.exp];
      if (field === 'name') e.name = t.value.trim() || e.name;
      if (field === 'target') e.target = Math.max(1, +t.value || 1);
      if (field === 'surplus') e.surplus = t.value;
      if (field === 'status') e.status = t.value;
      if (field === 'note') e.note = t.value;
      // renaming or restyling an expense changes the restriction labels and card styles too
      if (field === 'name' || field === 'status') {
        redrawAll();
        return;
      }
    } else return;
    drawScene();
    renderStocks(state.lots, state.paid);
  }

  function addSource() {
    added += 1;
    config.sources.push({
      id: `source-${added}`,
      name: 'New source',
      color: NEW_SOURCE_COLORS[(added - 1) % NEW_SOURCE_COLORS.length],
      monthly: 100,
      earmark: null,
    });
    redrawAll();
  }

  function proposeExpense() {
    added += 1;
    config.expenses.push({
      id: `expense-${added}`,
      name: 'New expense',
      target: 100,
      surplus: 'sweep',
      status: 'proposed',
      note: '',
    });
    redrawAll();
    const inputs = document.querySelectorAll('#expenses-list .fl-input-title');
    inputs[inputs.length - 1].select();
  }

  async function runStep() {
    if (busy) return;
    busy = true;
    setButtons();
    const { state: next, phases } = M.step(state, config);
    for (const phase of phases) {
      await animatePhase(phase);
      renderStocks(phase.lots, phase.paid);
    }
    state = next;
    await stampReceipts();
    renderSummary();
    renderLedger();
    $('verify-status').textContent = '';
    busy = false;
    setButtons();
  }

  function setButtons() {
    $('btn-step').disabled = busy || playing;
    $('btn-play').textContent = playing ? 'Pause' : 'Play';
    $('btn-tamper').disabled = !state.ledger.length;
  }

  async function play() {
    playing = !playing;
    setButtons();
    while (playing) {
      await runStep();
      await new Promise((r) => setTimeout(r, reduceMotion ? 900 : 500));
    }
    setButtons();
  }

  function reset() {
    playing = false;
    state = M.createState();
    generalMax = 2000;
    intakeMax = 3000;
    $('verify-status').textContent = '';
    redrawAll();
    setButtons();
  }

  $('btn-step').addEventListener('click', runStep);
  $('btn-play').addEventListener('click', play);
  $('btn-reset').addEventListener('click', reset);
  $('btn-defaults').addEventListener('click', () => {
    config = JSON.parse(JSON.stringify(DEFAULTS));
    $('opt-vary').checked = config.vary;
    $('opt-backfill').checked = config.backfill;
    reset();
  });
  $('btn-add-source').addEventListener('click', addSource);
  $('btn-propose').addEventListener('click', proposeExpense);
  $('opt-vary').addEventListener('change', (e) => (config.vary = e.target.checked));
  $('opt-backfill').addEventListener('change', (e) => {
    config.backfill = e.target.checked;
    drawScene();
    renderStocks(state.lots, state.paid);
  });
  $('sources-body').addEventListener('change', onConfigInput);
  $('expenses-list').addEventListener('change', onConfigInput);
  $('expenses-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-move]');
    if (!btn) return;
    const i = +btn.dataset.move;
    const j = i + +btn.dataset.dir;
    [config.expenses[i], config.expenses[j]] = [config.expenses[j], config.expenses[i]];
    redrawAll();
  });

  $('btn-verify').addEventListener('click', async () => {
    const bad = await verifyChain();
    $('verify-status').textContent = bad
      ? `✗ Receipt #${bad.seq} does not match its entry. Every receipt after it is now suspect.`
      : `✓ All ${state.ledger.length} receipts check out against their entries.`;
    $('verify-status').className = bad ? 'fl-status fl-short' : 'fl-status';
  });

  $('btn-tamper').addEventListener('click', () => {
    if (!state.ledger.length) return;
    const e = state.ledger[Math.floor(Math.random() * state.ledger.length)];
    e.amount += 100;
    $('verify-status').textContent = `Quietly added $100 to entry #${e.seq}. Now verify.`;
    $('verify-status').className = 'fl-status';
    renderLedger(e.seq);
  });

  $('opt-vary').checked = config.vary;
  $('opt-backfill').checked = config.backfill;
  redrawAll();
  setButtons();
})();
