const $ = id => document.getElementById(id);
const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>',
};
let tab, host = '', domain = 'fastmail.com';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const copy = text => navigator.clipboard.writeText(text).then(() => true, () => false);

function status(text = '', withSettings = false) {
  $('status').replaceChildren(text);
  if (withSettings) $('status').append(el('button', { className: 'sea sea-sm sea-frost sea-interactive', textContent: 'Open settings', onclick: () => chrome.runtime.openOptionsPage() }));
}
const showError = e => status(errorText(e), ['NO_TOKEN', 'BAD_TOKEN', 'NO_SCOPE'].includes(e?.code));

// "You're about to create" card: real prefix, muted placeholder for Fastmail's random part.
function preview() {
  const p = sanitizePrefix($('prefix').value);
  $('preview').classList.remove('done');
  $('address').replaceChildren(...(p ? [el('b', { textContent: p }), '.'] : []), 'xxxxx@' + domain);
}

let selectedId = null; // the expanded row
let pendingId = null;  // alias waiting out its 5 seconds before the delete goes to Fastmail
let toastTimer;

const madeOn = iso => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return 'Made ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) });
};
const siteOf = fd => { const d = (fd || '').split(/[\s,]+/)[0]; try { return new URL(d).hostname.replace(/^www\./, ''); } catch { return d; } };
const button = (cls, act, props) => { const b = el('button', { className: cls, ...props }); b.dataset.act = act; return b; };

function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').classList.remove('show'); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 300); }, 1800);
}

function aliasRow(a) {
  if (a.id === pendingId) return deletedBar(a);
  const off = a.state === 'disabled', at = a.email.indexOf('@');
  const li = el('li', { className: 'alias' + (off ? ' off' : '') });
  li.dataset.id = a.id;
  // Local part crisp, "@fastmail.com" muted; an Off row hides the domain behind an Off chip until it is opened.
  const address = el('span', { className: 'email mono' }, el('span', { className: 'local', textContent: a.email.slice(0, at) }));
  address.append(el('span', { className: 'at', textContent: a.email.slice(at) })); // hidden on Off rows until opened
  const main = button('row-main', 'main', { title: a.description || a.forDomain || a.email });
  main.append(el('span', { className: 'dot', ariaHidden: 'true' }), address);
  if (off) main.append(el('span', { className: 'chip sea sea-sm sea-ruby', textContent: 'Off' }));
  main.setAttribute('aria-controls', 'd-' + a.id);
  main.onclick = () => select(selectedId === a.id ? null : a.id);

  const copyBtn = button('rock', 'copy', { innerHTML: ICON.copy, title: 'Copy', ariaLabel: 'Copy ' + a.email });
  copyBtn.dataset.tint = 'lagoon';
  copyBtn.onclick = async () => {
    if (!(await copy(a.email))) return status("Couldn't copy to the clipboard.");
    copyBtn.innerHTML = ICON.check;
    setTimeout(() => { copyBtn.innerHTML = ICON.copy; }, 1800);
    toast('Copied ' + a.email);
  };
  const toggle = button('rock', 'toggle', { innerHTML: ICON.power, title: off ? 'Turn on' : 'Turn off', ariaLabel: (off ? 'Turn on ' : 'Turn off ') + a.email });
  toggle.dataset.tint = off ? 'kelp' : 'ruby';
  toggle.onclick = async () => {
    toggle.disabled = true;
    try { await send({ type: 'setState', id: a.id, state: off ? 'enabled' : 'disabled' }); await refresh(); }
    catch (e) { showError(e); toggle.disabled = false; }
  };
  const del = button('rock', 'delete', { innerHTML: ICON.trash, title: 'Delete', ariaLabel: 'Delete ' + a.email });
  del.dataset.tint = 'ruby';
  del.onclick = () => startDelete(a, li);

  const details = el('div', { className: 'details', id: 'd-' + a.id, hidden: true },
    el('div', { className: 'meta' }, ...(a.forDomain ? [el('span', { className: 'chip sea sea-sm sea-lagoon', textContent: siteOf(a.forDomain) })] : []), madeOn(a.createdAt)));
  li.append(main, copyBtn, toggle, del, details);
  return li;
}

// One row open at a time: selected glass plus the full address, site and date.
function select(id) {
  selectedId = id;
  for (const li of document.querySelectorAll('.alias[data-id]')) {
    const on = li.dataset.id === id, main = li.querySelector('.row-main');
    li.classList.toggle('selected', on);
    main?.setAttribute('aria-expanded', on);
    const d = li.querySelector('.details');
    if (d) d.hidden = !on;
    if (on) li.scrollIntoView({ block: 'nearest' });
  }
}

// Delete with a 5-second undo. The background holds the timer and sends the delete; this just shows the bar.
function deletedBar(a) {
  const undo = button('undo sea sea-sm sea-frost sea-interactive', 'undo', { textContent: 'Undo', ariaLabel: 'Undo deleting ' + a.email });
  undo.onclick = async () => {
    undo.disabled = true;
    try { await send({ type: 'undoDelete', id: a.id }); } catch (e) { showError(e); }
    if (pendingId === a.id) pendingId = null;
    await refresh();
    document.querySelector(`.alias[data-id="${CSS.escape(a.id)}"] .row-main`)?.focus();
  };
  const li = el('li', { className: 'alias deleted sea sea-sm' },
    el('span', { className: 'del-text' }, 'Deleted ', el('b', { className: 'mono', textContent: a.email.slice(0, a.email.indexOf('@')) })), undo);
  li.dataset.id = a.id;
  return li;
}
async function startDelete(a, li) {
  pendingId = a.id;
  if (selectedId === a.id) selectedId = null;
  const bar = deletedBar(a);
  li.replaceWith(bar);
  bar.querySelector('.undo').focus();
  try {
    const r = await send({ type: 'deleteLater', id: a.id }); // resolves once it's sent (after 5s, or sooner if another delete starts) or undone
    if (pendingId === a.id) pendingId = null;
    if (r.deleted) await refresh();
  } catch (e) {
    if (pendingId === a.id) pendingId = null;
    showError(e);
    await refresh();
  }
}

// selectId: the alias just created, shown selected.
async function refresh(selectId) {
  try {
    const { list } = await send({ type: 'list' });
    if (list[0]?.email?.includes('@')) { domain = list[0].email.split('@')[1]; if (!$('preview').classList.contains('done')) preview(); }
    const here = host ? list.filter(a => siteMatches(a, host)) : [];
    const rest = list.filter(a => !here.includes(a)); // everything else, newest first
    // Rebuilding the rows drops focus; put it back on the same control of the same alias.
    const f = document.activeElement, fid = f?.closest?.('.alias')?.dataset.id, fact = f?.dataset?.act;
    // Two dropdown sections only when this site has an alias; otherwise one plain, always-open list.
    const split = here.length > 0;
    $('sec-here-wrap').hidden = $('sec-rest-btn').hidden = !split;
    $('plain-head').hidden = split;
    $('sec-rest').setAttribute('aria-labelledby', split ? 'sec-rest-title' : 'plain-title');
    $('sec-here').replaceChildren(...here.map(aliasRow));
    $('sec-rest').replaceChildren(...rest.map(aliasRow));
    $('sec-here-count').textContent = here.length;
    $('sec-rest-count').textContent = rest.length;
    $('plain-count').textContent = list.length;
    if (split) for (const name of Object.keys(SECTIONS)) setSection(name, SECTIONS[name]);
    else $('sec-rest').hidden = false;
    select(selectId !== undefined ? selectId : list.some(a => a.id === selectedId) ? selectedId : null);
    if (fid && fact) document.querySelector(`.alias[data-id="${CSS.escape(fid)}"] [data-act="${fact}"]`)?.focus();
    $('list').hidden = !list.length;
  } catch (e) { showError(e); }
}

async function create() {
  $('create').disabled = true;
  status();
  try {
    const origin = host ? new URL(tab.url).origin : ''; // no website: alias isn't tied to a site and is only copied
    const { alias } = await send({ type: 'create', origin, prefix: sanitizePrefix($('prefix').value) });
    // Fill only the frame where the user last had the badge, and only if it's on the tab's own origin.
    const { frameId } = origin ? await send({ type: 'lastFrame', tabId: tab.id }) : {};
    const filled = frameId != null && await chrome.tabs.sendMessage(tab.id, { type: 'fill', email: alias.email, origin }, { frameId }).then(r => !!r?.filled, () => false);
    const copied = await copy(alias.email);
    $('preview').classList.add('done');
    $('address').replaceChildren(el('b', { textContent: alias.email }));
    toast('Created · ' + (filled && copied ? 'filled + copied' : filled ? 'filled' : copied ? 'copied' : 'not copied'));
    if (origin) SECTIONS.here = true; // the new alias shows, selected, in an open "For <site>"
    refresh(alias.id);
  } catch (e) { showError(e); }
  $('create').disabled = false;
}

// "Show the @ button on this site" switch: off for sites the user hid, and locked off on webmail / password-manager sites.
async function showSiteSwitch() {
  if (!host) return;
  const locked = NO_BADGE_HOSTS.includes(host);
  const { hiddenSites = [] } = await chrome.storage.local.get('hiddenSites');
  $('site-row').hidden = false;
  $('site-toggle').checked = !locked && !hiddenSites.includes(siteKey(host));
  $('site-toggle').disabled = locked;
  if (locked) $('site-row-text').textContent = 'The @ button is always off on this site (right-click still works)';
}
$('site-toggle').onchange = () => send({ type: 'setSiteHidden', host, hidden: !$('site-toggle').checked }).catch(showError);

// Collapsible sections; open/closed is remembered. With no website there's only one section, so it starts open.
const SECTIONS = { here: true, rest: false };
// Mark which ends of the alias list have more to scroll to, for the fades.
// ...and which section header is stuck at the top (only that one gets a frosted background).
function fades() {
  const l = document.querySelector('.list-scroll'), top = l.getBoundingClientRect().top;
  l.classList.toggle('more-above', l.scrollTop > 1);
  l.classList.toggle('more-below', l.scrollTop + l.clientHeight < l.scrollHeight - 1);
  for (const h of l.querySelectorAll('.sec-head')) h.classList.toggle('stuck', l.scrollTop > 0 && Math.abs(h.getBoundingClientRect().top - top) < 1);
}
document.querySelector('.list-scroll').addEventListener('scroll', fades, { passive: true });
const listSize = new ResizeObserver(fades); // rows added, opened, sections folded
for (const id of ['sec-here', 'sec-rest', 'list']) listSize.observe($(id));

function setSection(name, open) {
  SECTIONS[name] = open;
  $(`sec-${name}-btn`).setAttribute('aria-expanded', open);
  $(`sec-${name}`).hidden = !open;
}
for (const name of Object.keys(SECTIONS)) $(`sec-${name}-btn`).onclick = () => {
  setSection(name, !SECTIONS[name]);
  chrome.storage.local.set({ sections: { ...SECTIONS } }).catch(() => {});
};

$('create').onclick = create;
$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('prefix').oninput = preview;
$('prefix').onkeydown = e => { if (e.key === 'Enter') create(); };

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch {}
  $('site').textContent = host || 'No website';
  $('site').classList.toggle('none', !host);
  // The tab's own favicon (activeTab gives us it); a letter when there isn't one.
  const fav = host && tab.favIconUrl && /^(https:|data:image\/)/.test(tab.favIconUrl) ? el('img', { src: tab.favIconUrl, alt: '' }) : null;
  if (fav || host) $('fav').replaceChildren(fav || host.replace(/^www\./, '')[0].toUpperCase());
  else $('fav').innerHTML = ICON.globe;
  if (fav) fav.onerror = () => $('fav').replaceChildren(host.replace(/^www\./, '')[0].toUpperCase());
  $('prefix').value = host ? defaultPrefix(host) : '';
  preview();
  showSiteSwitch();
  const { sections = {} } = await chrome.storage.local.get('sections').catch(() => ({}));
  for (const name of Object.keys(SECTIONS)) SECTIONS[name] = sections[name] ?? SECTIONS[name];
  if (host) $('sec-here-title').textContent = 'For ' + host.replace(/^www\./, '');
  $('prefix').focus();
  $('prefix').select();
  refresh();
})();
