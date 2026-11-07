// /bitblocks: fills the page's live numbers from bitblocks' own support endpoint.
// A null field means "not configured", which is a different fact from 0 ("nobody paid"),
// so null and a failed fetch both show as a dash, never as $0.
// view() is pure so it can be tested in node; render() only runs in the browser.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BitblocksSupport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const API_URL = 'https://bitblocks.app/api/v1/support';
  const DASH = '—';

  const isNumber = (n) => typeof n === 'number' && Number.isFinite(n);

  function usd(n) {
    if (!isNumber(n)) return DASH;
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 });
  }

  function bsv(sats) {
    if (!isNumber(sats)) return DASH;
    return (sats / 100000000).toLocaleString('en-US', { maximumFractionDigits: 8 }) + ' BSV';
  }

  // Everything the page shows, as strings, from the endpoint's body (or null if the fetch failed).
  function view(body) {
    const data = (body && body.data) || null;
    const d = data || {};
    const target = d.monthly_target_usd;
    const received = d.received_usd_30d;
    const hasMeter = isNumber(target) && target > 0 && isNumber(received);
    return {
      live: !!data,
      target: usd(target),
      received: usd(received),
      received30d: bsv(d.received_sats_30d),
      receivedTotal: bsv(d.received_sats_total),
      percent: hasMeter ? Math.min(100, (received / target) * 100) : null,
      costs: (Array.isArray(d.costs) ? d.costs : []).map((c) => ({ item: c.item, usd: usd(c.usd) })),
      address: d.bsv_address || null,
    };
  }

  function setText(id, value) {
    document.querySelectorAll(`[data-support="${id}"]`).forEach((el) => {
      el.textContent = value;
    });
  }

  function paint(v) {
    setText('target', v.target);
    setText('received', v.received);
    setText('received-30d', v.received30d);
    setText('received-total', v.receivedTotal);
    if (!v.live) {
      document.getElementById('support-status').textContent =
        'Live numbers are unavailable right now, so they show as a dash.';
    }

    const bar = document.getElementById('support-bar');
    const meter = document.getElementById('support-meter');
    if (v.percent === null) meter.removeAttribute('aria-valuenow');
    else {
      meter.setAttribute('aria-valuenow', String(Math.round(v.percent)));
      bar.style.width = `${v.percent}%`;
    }

    if (v.costs.length) {
      const body = document.getElementById('support-costs');
      body.textContent = '';
      for (const cost of v.costs) {
        const row = body.insertRow();
        row.className = 'border-b border-slate-800/20';
        const item = row.insertCell();
        item.className = 'py-2 pr-4';
        item.textContent = cost.item;
        const amount = row.insertCell();
        amount.className = 'py-2 text-right font-mono';
        amount.textContent = cost.usd;
      }
    }

    if (v.address) {
      document.getElementById('support-address').textContent = v.address;
      document.querySelectorAll('[data-support="address-link"]').forEach((link) => {
        link.href = `https://whatsonchain.com/address/${v.address}`;
      });
      document.getElementById('support-give').classList.remove('hidden');
      document.getElementById('support-no-address').classList.add('hidden');
      if (typeof QRCode !== 'undefined') {
        new QRCode('support-qr', {
          text: v.address,
          width: 192,
          height: 192,
          colorDark: '#1e293b',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H,
        });
      }
    }
  }

  async function render() {
    let body = null;
    try {
      const res = await fetch(API_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`bitblocks responded ${res.status}`);
      body = await res.json();
    } catch (err) {
      body = null;
    }
    paint(view(body));
  }

  return { API_URL, DASH, usd, bsv, view, render };
});
