const $ = id => document.getElementById(id);
const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
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
  // Deleting makes mail to the address bounce, and Fastmail doesn't document an undo, so it asks first.
  const del = el('button', { className: 'icon', innerHTML: ICON.trash, title: 'Delete', ariaLabel: 'Delete ' + a.email });
  del.onclick = () => {
    const rest = [...li.querySelectorAll('.tag, .icon')];
    const yes = el('button', { className: 'confirm yes', textContent: 'Delete' });
    const no = el('button', { className: 'confirm', textContent: 'Cancel' });
    const cancel = () => { yes.remove(); no.remove(); rest.forEach(n => { n.hidden = false; }); li.classList.remove('confirming'); status(); del.focus(); };
    rest.forEach(n => { n.hidden = true; });
    li.classList.add('confirming');
    status(`Delete ${a.email}? Mail sent to it will bounce, and this may not be undoable. To just stop mail, turn it off instead.`);
    no.onclick = cancel;
    yes.onclick = async () => {
      yes.disabled = no.disabled = true;
      try { await send({ type: 'setState', id: a.id, state: 'deleted' }); status(); await refresh(); }
      catch (e) { cancel(); showError(e); }
    };
    li.append(yes, no);
    no.focus(); // safe default for Enter
  };
  li.append(copyBtn, toggle, del);
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
    // Fill only the frame where the user last had the badge, and only if it's on the tab's own origin.
    const { frameId } = origin ? await send({ type: 'lastFrame', tabId: tab.id }) : {};
    const filled = frameId != null && await chrome.tabs.sendMessage(tab.id, { type: 'fill', email: alias.email, origin }, { frameId }).then(r => !!r?.filled, () => false);
    const copied = await copy(alias.email);
    $('preview').classList.add('done');
    $('caption').textContent = 'Created · ' + (filled && copied ? 'filled + copied' : filled ? 'filled' : copied ? 'copied' : 'not copied');
    $('address').textContent = alias.email;
    refresh();
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
  showSiteSwitch();
  $('prefix').focus();
  $('prefix').select();
  refresh();
})();
