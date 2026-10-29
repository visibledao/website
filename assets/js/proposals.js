// /proposals: lists Visible DAO proposals, which live as GitHub issues labeled "proposal".
// A proposal's status is its "status: …" label; with none, an open issue counts as proposed.
// group() is pure so it can be tested in node; render() only runs in the browser.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Proposals = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REPO = 'visibledao/website';
  const STATUSES = ['proposed', 'active', 'declined', 'discontinued'];
  const API_URL = `https://api.github.com/repos/${REPO}/issues?labels=proposal&state=all&per_page=100`;

  function statusOf(issue) {
    const names = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name).toLowerCase());
    const found = STATUSES.find((s) => names.includes(`status: ${s}`));
    if (found) return found;
    return issue.state === 'closed' ? 'declined' : 'proposed';
  }

  function toProposal(issue) {
    return {
      number: issue.number,
      title: String(issue.title || '').replace(/^proposal:\s*/i, '') || 'Untitled',
      url: issue.html_url,
      author: issue.user ? issue.user.login : '',
      created: issue.created_at,
      comments: issue.comments || 0,
      support: (issue.reactions && issue.reactions['+1']) || 0,
      status: statusOf(issue),
    };
  }

  // Group issues by status, newest first, skipping pull requests.
  function group(issues) {
    const groups = Object.fromEntries(STATUSES.map((s) => [s, []]));
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const p = toProposal(issue);
      groups[p.status].push(p);
    }
    for (const s of STATUSES) groups[s].sort((a, b) => String(b.created).localeCompare(String(a.created)));
    return groups;
  }

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function item(p) {
    const date = p.created ? new Date(p.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return `<li class="py-4">
<a href="${esc(p.url)}" class="font-semibold text-slate-800 hover:text-orange-500">${esc(p.title)}</a>
<p class="mt-1 text-sm text-slate-600">#${p.number} · by ${esc(p.author)} · ${date} · ${p.support} 👍 · ${p.comments} comments</p>
</li>`;
  }

  async function render(el) {
    const newUrl = `https://github.com/${REPO}/issues/new?template=proposal.yml`;
    const listUrl = `https://github.com/${REPO}/issues?q=label%3Aproposal`;
    try {
      const res = await fetch(API_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
      const groups = group(await res.json());
      const sections = [
        ['proposed', 'Open for discussion'],
        ['active', 'Active'],
        ['declined', 'Declined'],
        ['discontinued', 'Discontinued'],
      ];
      const html = sections
        .filter(([s]) => groups[s].length || s === 'proposed')
        .map(([s, label]) => {
          const items = groups[s].length
            ? groups[s].map(item).join('')
            : `<li class="py-4 text-slate-600">Nothing open right now. <a href="${newUrl}" class="font-semibold text-slate-800 underline hover:text-orange-500">Be the first to propose something.</a></li>`;
          return `<section class="mt-10">
<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">${label} · ${groups[s].length}</h3>
<ul class="mt-2 divide-y divide-slate-800/20 border-y border-slate-800/20">${items}</ul>
</section>`;
        })
        .join('');
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = `<p class="mt-10 text-slate-800">Couldn't load proposals from GitHub just now. <a href="${listUrl}" class="font-semibold underline hover:text-orange-500">See them on GitHub →</a></p>`;
    }
  }

  return { REPO, STATUSES, API_URL, statusOf, group, render };
});
