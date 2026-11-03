// Shared helpers: loaded by the service worker (importScripts), content script, popup, options and test.js.

// Limitation: hand-picked suffixes instead of the full Public Suffix List, so a shared host missing here groups unrelated sites together.
// Shared hosts: every subdomain is a different owner, so it must never share aliases with its neighbours.
const HOSTED = new Set(['github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'web.app',
  'firebaseapp.com', 'appspot.com', 'blogspot.com', 'wordpress.com', 'myshopify.com', 'azurewebsites.net', 'cloudfront.net',
  'onrender.com', 'fly.dev', 'glitch.me', 'repl.co', 'surge.sh', 'neocities.org', 'carrd.co']);
const MULTI_SLD = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'ne', 'or', 'go', 'gob', 'mil', 'nic', 'ltd', 'plc', 'sch', 'nhs', 'me', 'info', 'biz', 'nom']);

function baseDomain(host) {
  host = (host || '').toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return host;
  const p = host.split('.');
  const n = HOSTED.has(p.slice(-2).join('.')) || (p.length > 2 && p.at(-1).length === 2 && MULTI_SLD.has(p.at(-2))) ? 3 : 2;
  return p.slice(-n).join('.');
}

// Webmail and password-manager apps: the inline badge never shows there (right-click still works). Add hosts here.
const NO_BADGE_HOSTS = ['mail.proton.me', 'account.proton.me', 'app.fastmail.com', 'mail.google.com',
  'outlook.live.com', 'outlook.office.com', 'vault.bitwarden.com'];

// "Don't show on this site" is stored per base domain, so accounts.example.com and example.com share it.
const siteKey = host => baseDomain(host);

function sanitizePrefix(s) {
  return (s || '').toLowerCase().replace(/[-.\s]+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 63);
}

function defaultPrefix(host) {
  return sanitizePrefix(baseDomain(host).split('.')[0]);
}

// forDomain is normally an origin ("https://accounts.netflix.com"), but users can edit it in Fastmail.
function siteMatches(alias, host) {
  const base = baseDomain(host);
  return !!base && (alias.forDomain || '').split(/[\s,]+/).some(d => {
    try { return baseDomain(new URL(d.includes('://') ? d : 'https://' + d).hostname) === base; } catch { return false; }
  });
}

// True only for this extension's own pages; content scripts (inside web pages) get false. sender.url is set by the browser.
const isExtensionSender = (sender, origin) => !!sender?.url && sender.url.startsWith(origin + '/');

const ERRORS = {
  NO_TOKEN: 'No Fastmail API token set yet.',
  BAD_TOKEN: 'Fastmail rejected the API token. Check it in settings.',
  NO_SCOPE: 'This token lacks the Masked Email scope. Create a new token with Masked Email access.',
  RATE_LIMIT: 'Fastmail rate limit hit. Wait a little and try again.',
  NETWORK: "Couldn't reach Fastmail. Check your connection.",
  RELOADED: 'The extension was reloaded. Refresh this page.',
};
const errorText = e => ERRORS[e?.code] || e?.message || 'Something went wrong.';

// Message the service worker; rejects with {code, message}.
async function send(msg) {
  let r;
  try { r = await chrome.runtime.sendMessage(msg); } catch { throw { code: 'RELOADED' }; }
  if (!r) throw { code: 'RELOADED' };
  if (r.error) throw r.error;
  return r;
}

if (typeof module !== 'undefined') module.exports = { NO_BADGE_HOSTS, siteKey, isExtensionSender, baseDomain, sanitizePrefix, defaultPrefix, siteMatches, errorText };
