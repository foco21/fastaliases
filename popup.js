const $ = id => document.getElementById(id);
const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>',
};
let tab, host = '', domain = 'fastmail.com';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const copy = text => navigator.clipboard.writeText(text).then(() => true, () => false);

function status(text = '', withSettings = false) {
  $('status').replaceChildren(text);
  if (withSettings) $('status').append(el('button', { textContent: 'Open settings', onclick: () => chrome.runtime.openOptionsPage() }));
}
const showError = e => status(errorText(e), ['NO_TOKEN', 'BAD_TOKEN', 'NO_SCOPE'].includes(e?.code));

// "You're about to create" card: real prefix, muted placeholder for Fastmail's random part.
function preview() {
  const p = sanitizePrefix($('prefix').value);
  $('preview').classList.remove('done');
  $('caption').textContent = "You're about to create";
  $('address').replaceChildren(p, el('span', { className: 'tail', textContent: (p ? '.' : '') + 'xxxxx' }), '@' + domain);
}

function aliasRow(a, here) {
  const off = a.state === 'disabled';
  const li = el('li', { className: 'alias' + (off ? ' off' : '') + (here ? ' here' : ''), title: a.description || a.forDomain || a.email });
  const copyBtn = el('button', { className: 'icon', innerHTML: ICON.copy, title: 'Copy', ariaLabel: 'Copy ' + a.email });
  copyBtn.onclick = async () => {
    if (!(await copy(a.email))) return status("Couldn't copy to the clipboard.");
    copyBtn.innerHTML = ICON.check;
    setTimeout(() => { copyBtn.innerHTML = ICON.copy; }, 1200);
  };
  const toggle = el('button', { className: 'icon', innerHTML: ICON.power, title: off ? 'Turn on' : 'Turn off', ariaLabel: (off ? 'Turn on ' : 'Turn off ') + a.email });
  toggle.onclick = async () => {
    toggle.disabled = true;
    try { await send({ type: 'setState', id: a.id, state: off ? 'enabled' : 'disabled' }); await refresh(); }
    catch (e) { showError(e); toggle.disabled = false; }
  };
  li.append(el('span', { className: 'dot', ariaHidden: 'true' }), el('span', { className: 'email mono', textContent: a.email }));
  if (here) li.append(el('span', { className: 'tag here', textContent: 'This site' }));
  if (off) li.append(el('span', { className: 'tag off', textContent: 'Off' }));
  li.append(copyBtn, toggle);
  return li;
}

async function refresh() {
  try {
    const { list } = await send({ type: 'list' });
    if (list[0]?.email?.includes('@')) { domain = list[0].email.split('@')[1]; if (!$('preview').classList.contains('done')) preview(); }
    const here = host ? list.filter(a => siteMatches(a, host)) : [];
    const rest = list.filter(a => !here.includes(a)); // everything else, newest first
    $('aliases').replaceChildren(...here.map(a => aliasRow(a, true)), ...rest.map(a => aliasRow(a, false)));
    $('list-title').hidden = !list.length;
  } catch (e) { showError(e); }
}

async function create() {
  $('create').disabled = true;
  status();
  try {
    const origin = host ? new URL(tab.url).origin : ''; // no website: alias isn't tied to a site and is only copied
    const { alias } = await send({ type: 'create', origin, prefix: sanitizePrefix($('prefix').value) });
    // Only frames on the tab's own origin fill, so embedded third-party iframes never see the alias.
    const filled = !!origin && await chrome.tabs.sendMessage(tab.id, { type: 'fill', email: alias.email, origin }).then(r => !!r?.filled, () => false);
    const copied = await copy(alias.email);
    $('preview').classList.add('done');
    $('caption').textContent = 'Created · ' + (filled && copied ? 'filled + copied' : filled ? 'filled' : copied ? 'copied' : 'not copied');
    $('address').textContent = alias.email;
    refresh();
  } catch (e) { showError(e); }
  $('create').disabled = false;
}

$('create').onclick = create;
$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('prefix').oninput = preview;
$('prefix').onkeydown = e => { if (e.key === 'Enter') create(); };

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch {}
  $('site').textContent = host || 'No website';
  $('site').classList.toggle('none', !host);
  $('prefix').value = host ? defaultPrefix(host) : '';
  preview();
  $('prefix').focus();
  $('prefix').select();
  refresh();
})();
