importScripts('lib.js');

const MASKED = 'https://www.fastmail.com/dev/maskedemail';
const USING = ['urn:ietf:params:jmap:core', MASKED];
let session = null; // { token, apiUrl, accountId }; lost when the worker sleeps, which is fine
let cache = null;   // { at, list }

const fail = (code, message) => Object.assign(new Error(message || code), { code });
const setError = e => fail(e.type === 'rateLimit' ? 'RATE_LIMIT' : 'API', e.description || e.type);

// The token lives in the extension origin's IndexedDB: content scripts (which run inside web pages)
// can read chrome.storage.local, but not this.
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('fastalias', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('kv', mode), req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
const loadToken = () => idb('readonly', s => s.get('token'));
const saveToken = t => idb('readwrite', s => t ? s.put(t, 'token') : s.delete('token'));

async function getToken() {
  const token = await loadToken();
  if (!token) throw fail('NO_TOKEN');
  return token;
}

async function request(url, token, body) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  }).catch(() => { throw fail('NETWORK'); });
  if (r.status === 401 || r.status === 403) { session = null; throw fail('BAD_TOKEN'); }
  if (r.status === 429) throw fail('RATE_LIMIT');
  if (!r.ok) throw fail('API', `Fastmail returned HTTP ${r.status}.`);
  return r.json();
}

async function getSession(token) {
  const s = await request('https://api.fastmail.com/jmap/session', token);
  const accountId = s.primaryAccounts?.[MASKED];
  if (!accountId) throw fail('NO_SCOPE');
  // Never send the token outside Fastmail; the URL may be relative to the session URL.
  let api;
  if (typeof s.apiUrl === 'string' && s.apiUrl) try { api = new URL(s.apiUrl, 'https://api.fastmail.com/jmap/session'); } catch {}
  if (api?.protocol !== 'https:' || !(api.hostname === 'fastmail.com' || api.hostname.endsWith('.fastmail.com')))
    throw fail('API', `Fastmail sent an unexpected API address: ${s.apiUrl}`);
  return { token, apiUrl: api.href, accountId };
}

async function call(method, args, s) {
  s ||= session ||= await getSession(await getToken());
  const res = await request(s.apiUrl, s.token, { using: USING, methodCalls: [[method, { accountId: s.accountId, ...args }, '0']] });
  const [name, out] = res.methodResponses[0];
  if (name === 'error') throw setError(out);
  return out;
}

// Pass a session to bypass the cache (used by "Test connection").
async function list(s) {
  if (!s && cache && Date.now() - cache.at < 60000) return cache.list;
  const { list: all } = await call('MaskedEmail/get', { ids: null }, s);
  const l = all.filter(a => a.state !== 'deleted').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!s) cache = { at: Date.now(), list: l };
  return l;
}

async function create(origin, prefix) {
  const a = { state: 'enabled' }; // not "pending": those auto-delete after 24h without mail
  if (/^https?:\/\//.test(origin || '')) { a.forDomain = origin; a.description = new URL(origin).hostname; }
  prefix = sanitizePrefix(prefix);
  if (prefix) a.emailPrefix = prefix;
  const res = await call('MaskedEmail/set', { create: { a } });
  cache = null;
  if (res.notCreated?.a) throw setError(res.notCreated.a);
  return { ...a, ...res.created.a };
}

async function setState(id, state) {
  if (!['enabled', 'disabled', 'deleted'].includes(state) || typeof id !== 'string') throw fail('API', 'Bad request.');
  const res = await call('MaskedEmail/set', { update: { [id]: { state } } });
  cache = null;
  if (res.notUpdated?.[id]) throw setError(res.notUpdated[id]);
  return {};
}

async function handle(m, sender) {
  // Content scripts run inside arbitrary pages: they only see this site's enabled aliases and create for their own origin.
  if (!isExtensionSender(sender, location.origin)) {
    if (m.type === 'list') {
      const host = URL.canParse(sender.origin) ? new URL(sender.origin).hostname : ''; // origin, not url: about:blank frames inherit it
      return { list: (await list()).filter(a => a.state !== 'disabled' && siteMatches(a, host)).map(a => ({ email: a.email })) };
    }
    if (m.type === 'create') return { alias: await create(sender.origin, m.prefix) };
    if (m.type === 'openOptions') return chrome.runtime.openOptionsPage(), {};
    if (m.type === 'fieldFocused' && sender.tab) return chrome.storage.session.set({ ['frame:' + sender.tab.id]: sender.frameId }), {};
    throw fail('API', 'Not allowed.');
  }
  switch (m.type) {
    case 'list': return { list: await list() };
    case 'create': return { alias: await create(m.origin, m.prefix) };
    case 'setState': return setState(m.id, m.state);
    case 'saveToken':
      if (typeof m.token !== 'string') throw fail('API', 'Bad request.');
      await saveToken(m.token.trim());
      session = cache = null;
      return {};
    case 'lastFrame': { const k = 'frame:' + m.tabId; return { frameId: (await chrome.storage.session.get(k))[k] ?? null }; }
    case 'setSiteHidden': await setSiteHidden(String(m.host), !!m.hidden); return {};
    case 'hasToken': return { has: !!(await loadToken()) };
    case 'test': return { count: (await list(await getSession(m.token || await getToken()))).length };
    case 'openOptions': return chrome.runtime.openOptionsPage(), {};
  }
  throw fail('API', 'Unknown request.');
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  handle(m, sender).then(reply, e => reply({ error: { code: e.code || 'API', message: e.message } }));
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'create-alias', title: 'Create Fastmail alias here', contexts: ['editable'] });
    chrome.contextMenus.create({ id: 'hide-site', title: "Don't show the @ button on this site", contexts: ['editable'] });
  });
  if (reason === 'install' && !(await loadToken())) chrome.runtime.openOptionsPage();
});

// Adds or removes a site from the "don't show the @ button" list (also used by the popup's switch).
async function setSiteHidden(host, hidden) {
  const key = siteKey(host), { hiddenSites = [] } = await chrome.storage.local.get('hiddenSites');
  const next = hiddenSites.filter(s => s !== key).concat(hidden ? [key] : []);
  await chrome.storage.local.set({ hiddenSites: next });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'hide-site') {
    // about:blank and srcdoc frames have no address of their own: fall back to the page's.
    const url = /^https?:/.test(info.frameUrl || '') ? info.frameUrl : info.pageUrl;
    if (URL.canParse(url)) setSiteHidden(new URL(url).hostname, true);
    return;
  }
  // Fails silently on tabs opened before install (no content script yet).
  chrome.tabs.sendMessage(tab.id, { type: 'openPanel' }, { frameId: info.frameId }).catch(() => {});
});

chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove('frame:' + tabId); });
