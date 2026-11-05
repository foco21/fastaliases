(() => {
  const CONFIRM_RE = /confirm|repeat|verif|again|retype|re-?enter/i;
  let field = null;     // field the badge/panel is attached to
  let lastField = null; // last focused email field, filled from the toolbar popup
  let ctxTarget = null; // last right-clicked element, for the context menu
  let bubble = false;   // true: outline + bubble overlay; false: plain round badge
  let frame = null;     // element whose box we trace: the field, or the wrapper that draws its border (floating labels)
  let radius = 0;       // frame's own corner radius, read before we hide its border
  let savedStyle = null, drawn = '', shift = { x: 0, y: 0 };
  let bubbleOk = false; // field suits the traced outline (bubble may still fall back if there's no room)
  let neighbor = null;  // another extension's inline icon at the field's right end, in field coordinates
  let rechecks = [];
  // The overlay replaces the field's own outline, focus ring and border (including focus styles that swap in a border image).
  // outline-style too: Chrome's default focus ring (outline-style: auto) ignores outline-color.
  const HIDDEN_STYLE = { 'border-color': 'transparent', 'border-image': 'none', 'outline-style': 'none', 'outline-color': 'transparent', 'box-shadow': 'none' };

  // Standalone @ for the small badge (24-unit box): stem with its hook, outer arc ending bottom right, split center dot.
  const BADGE_AT = `<path class="fm-at" d="M16.85 8.89V13.04A2.08 2.08 0 0 0 21 13.04V12A9 9 0 1 0 15.46 20.3"/>
    <path class="fm-y" d="M9.74 14.26A3.2 3.2 0 0 1 14.26 9.74Z"/><path class="fm-d" d="M14.26 9.74A3.2 3.2 0 0 1 9.74 14.26Z"/>`;

  const host = document.createElement('fastmail-alias');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  // Sea: frosted azure glass. Light/dark follows the page behind the field (.fm.dark), not the browser setting.
  root.innerHTML = `<style>
    .fm { --fm-line:#2f7fe0; --fm-amber:#ffb020; --fm-glow:rgba(61,155,255,.55); --fm-glass:#3d9bff; --fm-milk:#f6faf8; --fm-milk-mix:70%;
      --fm-strength:28%; --fm-focus:#0e1f55;
      --bg:#fff; --fg:#1d1d1f; --muted:#6b7280; --line:#e5e7eb; --hover:#f3f4f6; --accent:#2563eb; --accent-fg:#fff; --err:#b91c1c; }
    .fm.dark { --fm-line:#69b3e7; --fm-amber:#ffc107; --fm-glow:rgba(105,179,231,.45); --fm-glass:#4f8fd8; --fm-milk:#121a26; --fm-milk-mix:75%;
      --fm-focus:#fff;
      --bg:#1f2023; --fg:#ececef; --muted:#9ca3af; --line:#3a3b40; --hover:#2a2b2f; --accent:#60a5fa; --accent-fg:#0b1220; --err:#f87171; }
    .fm:has(.badge:hover) { --fm-strength:56%; }
    .fm:has(.badge:active) { --fm-strength:72%; }
    .fm:has(.badge:active) :is(.glass, .badge.plain) { filter:brightness(1.12) saturate(1.35); }
    .fm-line { fill:none; stroke:var(--fm-line); stroke-width:2; stroke-linejoin:round; }
    .fm-at { fill:none; stroke:var(--fm-line); stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .fm-y { fill:var(--fm-amber); } .fm-d { fill:var(--fm-line); }
    * { box-sizing:border-box; font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; }
    [hidden] { display:none !important; }
    .ring { position:fixed; pointer-events:none; }
    .ring svg { position:absolute; left:0; top:0; overflow:visible; }
    /* Smooth glass (no grain), mostly milk so it reads over anything: the neck and bubble only, clipped to the outline;
       the field keeps the site's own background. */
    .glass, .badge.plain { isolation:isolate;
      background:linear-gradient(color-mix(in srgb,var(--fm-glass) var(--fm-strength),transparent),color-mix(in srgb,var(--fm-glass) var(--fm-strength),transparent)),
                 color-mix(in srgb,var(--fm-milk) var(--fm-milk-mix),transparent);
    }
    .badge.plain, .frost { -webkit-backdrop-filter:blur(10px) saturate(1.6); backdrop-filter:blur(10px) saturate(1.6); }
    /* Chrome drops the mask on an element with a backdrop filter, so the blur is its own layer, starting where the tint is full. */
    .frost { position:absolute; }
    .glass { position:absolute; /* fades in along the neck, so the field seems to swell into the bubble */
      -webkit-mask-image:linear-gradient(to right, transparent, #000 var(--fm-fade)); mask-image:linear-gradient(to right, transparent, #000 var(--fm-fade)); }
    .badge { position:fixed; padding:0; border:0; cursor:pointer; display:grid; place-items:center; background:none; }
    .badge.plain { width:32px; height:28px; /* a little wider than tall, so the pebble corners never round into a circle */ border:1.5px solid var(--fm-line); border-radius:12px 15px 13px 16px / 15px 12px 16px 13px;
      box-shadow:0 0 4px var(--fm-glow); }
    .badge svg { width:20px; height:20px; overflow:visible; }
    .badge.plain .fm-at { stroke-width:2.4; } /* 2px on screen: the 24-unit icon is drawn at 20px */
    .badge.ghost { border-radius:46% 54% 50% 50% / 48% 46% 54% 52%; } /* clear click area over the drawn bubble, shaped like it */
    .badge.ghost svg { display:none; }
    .badge:focus-visible { outline:2px solid var(--fm-focus); outline-offset:3px; }
    .panel { position:fixed; width:300px; max-width:calc(100vw - 16px); padding:12px; border-radius:10px;
      background:var(--bg); color:var(--fg); border:1px solid var(--line); box-shadow:0 8px 28px rgba(0,0,0,.22); }
    .title { font-weight:600; margin-bottom:8px; }
    .row { display:flex; gap:6px; }
    input { flex:1; min-width:0; padding:6px 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--fg); }
    input:focus { outline:2px solid var(--accent); outline-offset:-1px; border-color:transparent; }
    button.create, button.link { border:0; border-radius:6px; padding:6px 12px; cursor:pointer; background:var(--accent); color:var(--accent-fg); font-weight:600; }
    button:disabled { opacity:.6; cursor:default; }
    .msg { margin-top:8px; color:var(--err); }
    .msg button { margin-top:6px; display:block; }
    .label { margin:10px 0 4px; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
    ul { list-style:none; margin:0; padding:0; max-height:140px; overflow:auto; }
    li button { width:100%; text-align:left; padding:5px 6px; border:0; border-radius:6px; background:none; color:var(--fg); cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    li button:hover, li button:focus-visible { background:var(--hover); outline:none; }
  </style>
  <div class="fm">
  <div class="ring" hidden></div>
  <button class="badge" title="Create Fastmail alias" aria-label="Create Fastmail alias" hidden><svg viewBox="0 0 24 24" aria-hidden="true">${BADGE_AT}</svg></button>
  <div class="panel" role="dialog" aria-label="Fastmail alias" hidden>
    <div class="title">Fastmail alias</div>
    <div class="row"><input class="prefix" spellcheck="false" autocomplete="off" aria-label="Alias prefix" placeholder="prefix"><button class="create">Create</button></div>
    <div class="msg" role="alert" hidden></div>
    <div class="existing" hidden><div class="label">Already have one here</div><ul></ul></div>
  </div>
  </div>`;
  const $ = s => root.querySelector(s);
  const wrap = $('.fm'), ring = $('.ring'), badge = $('.badge'), panel = $('.panel'), prefixIn = $('.prefix'), createBtn = $('.create'), msg = $('.msg'), existing = $('.existing');

  // --- Which fields get the badge ---------------------------------------------------------------
  const SEARCH_WORD_RE = /search|find|filter|query/i;
  // Whole words in name/id after splitting camelCase: "user_email", "userEmail", "login" match; "gmail", "mailingList" don't.
  const ACCOUNT_ID_RE = /(^|[^a-z0-9])(e[-_]?mail|mail|login|user[-_ ]?name)([^a-z0-9]|$)/;
  const SUBMIT_RE = /sign ?up|register|create (an |your )?account|join|continue|log ?in|sign ?in/i;
  const words = s => (s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const up = n => n.parentElement || n.getRootNode().host || null; // parent, stepping out of shadow roots
  const ancestors = el => { const out = []; for (let n = up(el); n; n = up(n)) out.push(n); return out; };
  const fieldText = el => [el.name, el.id, el.placeholder, el.getAttribute('aria-label')].join(' ');

  function isSearchField(el) {
    if (el.type === 'search' || /^(searchbox|combobox)$/.test(el.getAttribute('role'))) return true;
    if (SEARCH_WORD_RE.test(fieldText(el))) return true;
    return ancestors(el).some(n => n !== document.body && n !== document.documentElement &&
      (n.getAttribute('role') === 'search' || /search/i.test([n.id, n.getAttribute('class'), n.getAttribute('name')].join(' '))));
  }

  const LABEL_EMAIL_RE = /e-?mail/i;
  const autocompleteOf = el => (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
  const idWord = el => ACCOUNT_ID_RE.test(words(el.name)) || ACCOUNT_ID_RE.test(words(el.id));
  // Placeholder, aria-label, <label> and aria-labelledby text.
  function labelText(el) {
    const root = el.getRootNode(), ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return [el.placeholder, el.getAttribute('aria-label'), ...[...(el.labels || [])].map(l => l.textContent),
      ...ids.map(id => root.getElementById?.(id)?.textContent)].join(' ');
  }
  // Any sign this input holds an email address; used for "confirm email" fields.
  const emailish = el => el.type === 'email' || autocompleteOf(el).includes('email') || idWord(el) || LABEL_EMAIL_RE.test(labelText(el));

  // Every element under `root`, including inside shadow roots (open or closed), skipping our own layer.
  function* deepElements(root) {
    const stack = [root];
    while (stack.length) for (const c of stack.pop().children) {
      if (c === host) continue;
      yield c;
      stack.push(c);
      const sr = shadowOf(c);
      if (sr) stack.push(sr);
    }
  }

  // What else is in the field's form or pop-up. A field in neither gets no bonus (scanning the whole page would
  // hand every loose field on a page with any login form the +2).
  const formScope = el => el.form || ancestors(el).find(n => n.matches('form, dialog, [aria-modal="true"]'));
  function formSignals(el) {
    const scope = formScope(el);
    let password = false, account = false;
    if (!scope) return { password, account };
    for (const n of deepElements(scope)) {
      if (n === el) continue;
      if (n instanceof HTMLInputElement) {
        if (n.type === 'password') password = true;
        else if (n.type === 'submit' ? SUBMIT_RE.test(n.value) : CONFIRM_RE.test(fieldText(n)) && emailish(n)) account = true;
      } else if ((n.localName === 'button' || n.getAttribute('role') === 'button') && SUBMIT_RE.test(n.textContent)) account = true;
      if (password && account) break;
    }
    return { password, account };
  }

  // Sites where the badge stays off. Local files (file://) have no web origin but are allowed.
  const pageHost = URL.canParse(self.origin) ? new URL(self.origin).hostname : '';
  let hiddenSites = [], debug = false;

  // Returns { skip: reason } or { score }. The badge shows at score >= 3.
  function assess(el) {
    if (el.disabled || el.readOnly) return { skip: 'disabled or read-only' };
    if (isSearchField(el)) return { skip: 'search' };
    if (el.type !== 'email' && el.type !== 'text') return { skip: 'type=' + el.type };
    if (NO_BADGE_HOSTS.includes(pageHost)) return { skip: 'webmail/password-manager site' };
    if (pageHost && hiddenSites.includes(siteKey(pageHost))) return { skip: 'turned off for this site' };
    const ac = autocompleteOf(el), f = formSignals(el), why = [];
    let score = 0;
    const add = (n, reason) => { score += n; why.push(`${reason}+${n}`); };
    if (el.type === 'email') add(3, 'type');
    if (ac.includes('email') || ac.includes('username')) add(3, 'autocomplete');
    if (idWord(el)) add(2, 'name');
    if (LABEL_EMAIL_RE.test(labelText(el))) add(1, 'placeholder/label');
    if (f.password) add(1, 'password');
    if (f.account) add(1, 'signup/confirm');
    return { score, why };
  }

  // Every input or textarea we look at gets data-fmalias="attached"/"skipped" and data-fmalias-reason,
  // so test pages can read the decision (show() sets "attached" when the badge actually appears).
  function wantsBadge(el) {
    const isInput = el instanceof HTMLInputElement;
    if (!isInput && !(el instanceof HTMLTextAreaElement)) return false;
    const a = isInput ? assess(el) : { skip: 'not an email or text input' }, yes = !a.skip && a.score >= 3;
    const reason = a.skip ? `excluded: ${a.skip}` : `score=${a.score}: ${a.why.join(', ') || 'no signals'}${yes ? '' : ' (needs 3)'}`;
    el.setAttribute('data-fmalias-reason', reason);
    if (!yes) el.setAttribute('data-fmalias', 'skipped');
    if (debug) console.log(`[FMAlias] ${el.localName}${el.id ? '#' + el.id : el.name ? `[name="${el.name}"]` : ''} ${reason} → ${yes ? 'badge' : 'no badge'}`);
    return yes;
  }
  // When the badge goes away, drop "attached" (the reason stays for test pages).
  const unmark = el => { if (el?.getAttribute('data-fmalias') === 'attached') el.removeAttribute('data-fmalias'); el?.removeAttribute('data-fmalias-neighbor'); el?.removeAttribute('data-fmalias-place'); };

  // Shadow root of an element, open or closed (extensions may open closed ones, as Bitwarden does).
  // chrome.dom.openOrClosedShadowRoot throws on anything that isn't an HTML element, e.g. the SVG icons all over Reddit.
  // After the extension is reloaded or updated, this old copy keeps running in open tabs and every chrome.* call throws
  // "Extension context invalidated"; from then on only open shadow roots are visible (clicking the badge says to refresh).
  let domOk = true;
  const shadowOf = n => {
    if (!(n instanceof HTMLElement)) return null;
    if (domOk) try { return chrome.dom?.openOrClosedShadowRoot?.(n) ?? n.shadowRoot; } catch { domOk = false; }
    return n.shadowRoot;
  };

  // Follow focus into shadow roots, including closed ones that composedPath() hides.
  function deepTarget(el) {
    for (let r; el && (r = shadowOf(el)) && r.activeElement;) el = r.activeElement;
    return el;
  }

  // Tiny, pill-shaped or borderless fields get the plain badge: the traced outline would look wrong on them.
  const clear = c => /^transparent$|rgba\(.*,\s*0\)$/.test(c);
  const visibleBorder = s => parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && !clear(s.borderTopColor);
  // A box-shadow that draws a line rather than a soft shadow: no offset, (almost) no blur, inset or a 0.5-3px spread.
  const lineShadow = s => s.boxShadow !== 'none' && s.boxShadow.split(/,(?![^(]*\))/).some(sh => {
    const m = sh.match(/(rgba?\([^)]*\)|#\w+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?(\s+inset)?/);
    return m && !clear(m[1]) && !+m[2] && !+m[3] && +m[4] <= 1 && (m[6] || (+m[5] >= 0.5 && +m[5] <= 3));
  });
  const visibleOutline = s => s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && !clear(s.outlineColor);
  // A solid fill that stands out from what's behind it (Reddit's grey field on a white modal).
  function filledBox(n, s) {
    const [r, g, b, a] = rgbaOf(s.backgroundColor);
    if (a < 128) return false;
    for (let p = up(n); p instanceof Element; p = up(p)) {
      const [r2, g2, b2, a2] = rgbaOf(getComputedStyle(p).backgroundColor);
      if (a2 >= 128) return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) > 24;
    }
    return r + g + b < 740; // nothing painted behind: the white canvas
  }
  // Why this element looks like a field's box, or '' when it doesn't.
  function boxOf(n) {
    const s = getComputedStyle(n);
    if (visibleBorder(s)) return 'border';
    if (lineShadow(s)) return 'box-shadow';
    if (visibleOutline(s)) return 'outline';
    for (const pe of ['::before', '::after']) {
      const p = getComputedStyle(n, pe);
      if (p.content !== 'none' && (visibleBorder(p) || lineShadow(p))) return pe;
    }
    return filledBox(n, s) ? 'fill' : '';
  }
  // Returns why the plain badge is used, or '' to trace the outline.
  function plainLook(r, box) {
    if (r.height <= 32) return `short (${Math.round(r.height)}px tall)`;
    if (r.width < 120) return `narrow (${Math.round(r.width)}px wide)`;
    if (radius >= r.height / 2 - 2) return 'pill-shaped';
    if (!box) return 'no visible border';
    return '';
  }
  // Floating-label and component fields: the <input> is bare and a wrapper draws the box, sometimes across a shadow root
  // (Reddit). Use the first of up to 6 ancestors that looks like a box and is within ~24px of the input on each side,
  // so a form or card around it never counts. Returns [element, why].
  function frameFor(el) {
    const own = boxOf(el);
    if (own) return [el, own];
    const ir = el.getBoundingClientRect();
    for (let n = up(el), i = 0; n instanceof Element && i < 6; n = up(n), i++) {
      const r = n.getBoundingClientRect();
      if (r.width < ir.width - 2 || r.width > ir.width + 48 || r.height > ir.height + 48) continue;
      const why = boxOf(n);
      if (why) return [n, why];
    }
    return [el, ''];
  }

  // Pebble geometry in field coordinates, scaled from a reference drawing at H=42 (k = 1 at a 44px field): in the reference
  // the field's top edge runs at y=9, meets the neck at x=204, the pebble spans x~214-263.5 and y 4.4-55.6, centered at (240,30).
  // The bubble overlaps the field's right end by ~0.33H; with another extension's icon there it moves just right of that icon.
  function geom(w, h) {
    const k = (h - 2) / 42;
    let E = w - 0.33 * h - 14 * k;
    if (neighbor) E = Math.max(E, neighbor.right + 6 - 12 * k);
    const X = x => E + (x - 204) * k, Y = y => 1 + (y - 9) * k;
    return { k, X, Y, cx: X(240), cy: Y(30), left: X(214), right: X(263.5), top: Y(4.4), bottom: Y(55.6) };
  }

  // One continuous outline: top edge, S-curve neck, around the uneven pebble, neck, bottom edge, the field's own left corners.
  // dx/dy shift it into another box's coordinates (the glass layer's clip-path).
  function pebblePath(g, h, dx = 0, dy = 0) {
    const f = n => +n.toFixed(2), P = (x, y) => `${f(g.X(x) - dx)} ${f(g.Y(y) - dy)}`;
    const rr = Math.max(0, Math.min(radius, h / 2 - 1)), x0 = 1 - dx, y0 = 1 - dy, y1 = h - 1 - dy;
    return `M${f(x0 + rr)} ${f(y0)}H${f(g.X(204) - dx)}` +
      `C${P(211, 9)} ${P(213, 7.8)} ${P(218, 6.5)}C${P(224, 4.8)} ${P(231, 4.4)} ${P(239, 4.6)}` +
      `C${P(253, 5)} ${P(263.5, 15)} ${P(263.5, 30)}C${P(263.5, 45)} ${P(252, 55.6)} ${P(238, 55.4)}` +
      `C${P(231, 55.3)} ${P(224, 54.8)} ${P(218, 53.3)}C${P(213, 52.2)} ${P(211, 51)} ${P(204, 51)}` +
      `H${f(x0 + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x0)} ${f(y1 - rr)}V${f(y0 + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x0 + rr)} ${f(y0)}Z`;
  }

  // --- Other extensions' inline icons (password managers) -----------------------------------------
  // Matched against tag name, id, class and extension-iframe src (the store IDs). Colors are their brand blues/reds.
  const BRANDS = [
    ['Bitwarden', /bitwarden|bit-inline-menu|nngceckbapebfimnlniiiahkandclblb/, '#175DDC'],
    ['1Password', /com-1password|onepassword|1password|aeblfdkhhhdcdjpifhhbdiojplfjncoa/, '#0572EC'],
    ['LastPass', /(^|\s)lp-|lastpass|hdokiejnpimakedhajhdlcegeplioahd/, '#D32D27'],
    ['Proton Pass', /protonpass|proton-pass|ghmbeldphafepmbegfdlkpapadhbakde/, '#6D4AFF'],
    ['Dashlane', /dashlane|fdjamakpfbbddfjaooikfcpapjohcfmg/, '#0E353D'],
  ];
  const KNOWN_SEL = ['bitwarden', 'bit-inline-menu', '1password', 'onepassword', 'lastpass', 'protonpass', 'dashlane']
    .map(w => `[id*="${w}" i],[class*="${w}" i]`).join() + ',[class^="lp-"],[class*=" lp-"],iframe[src^="chrome-extension:"]';
  const idText = n => {
    const fr = n.localName === 'iframe' ? n : shadowOf(n)?.querySelector('iframe');
    return [n.localName, n.id, n.getAttribute?.('class'), fr?.src].join(' ').toLowerCase();
  };
  // Icon-sized box of an element, or of the iframe inside its shadow root (Bitwarden draws its button in one).
  const iconRect = n => {
    for (const m of [n, shadowOf(n)?.querySelector('iframe')]) {
      const r = m?.getBoundingClientRect();
      if (r?.width && r.height && r.width <= 64 && r.height <= 64) return r;
    }
    return null;
  };
  function findNeighbor(el, box = el) {
    const r = box.getBoundingClientRect(), skip = new Set([el, host, ...ancestors(el)]), seen = new Set(), found = [];
    const consider = (n, hitTest) => {
      if (seen.has(n) || skip.has(n)) return;
      seen.add(n);
      const ir = iconRect(n);
      if (!ir || ir.right <= r.right - 48 || ir.left >= r.right + 48 || ir.bottom <= r.top || ir.top >= r.bottom) return;
      let brand = null;
      for (let m = n; m && !skip.has(m) && !brand; m = up(m)) {
        const t = idText(m);
        brand = BRANDS.find(b => b[1].test(t)) || (/ (chrome|moz)-extension:/.test(t) ? ['extension', null, '#929DAA'] : null);
      }
      // Hit-tested elements count even unnamed (an icon is sitting there); the DOM scan only finds named ones.
      if (brand || hitTest) found.push({ name: brand?.[0] || 'unknown', color: brand?.[2] || '#929DAA', rect: ir });
    };
    const roots = new Set([document, el.getRootNode()]);
    for (const root of roots) for (const dx of [6, 16, 26, 36, 46]) for (const dy of [-8, 0, 8])
      for (const n of root.elementsFromPoint(r.right - dx, r.top + r.height / 2 + dy)) consider(n, true);
    for (const n of [...document.querySelectorAll(KNOWN_SEL), ...document.documentElement.children, ...(document.body?.children || [])]) consider(n, false);
    if (!found.length) return null;
    const nb = found.reduce((a, b) => b.rect.right > a.rect.right ? b : a); // the rightmost icon decides where we go
    return { name: nb.name, color: nb.color, left: Math.round(nb.rect.left - r.left), right: Math.round(nb.rect.right - r.left),
      mid: Math.round((nb.rect.left + nb.rect.right) / 2 - r.left) };
  }
  function updateNeighbor() {
    neighbor = findNeighbor(field, frame);
    if (neighbor) field.setAttribute('data-fmalias-neighbor', neighbor.name); else field.removeAttribute('data-fmalias-neighbor');
  }

  function ringSvg(w, h) {
    const f = n => +n.toFixed(2), g = geom(w, h), { k, X, Y } = g, P = (x, y) => `${f(X(x))} ${f(Y(y))}`, d = pebblePath(g, h);
    // The @, ~0.62H tall: its outer arc's tail curls out to meet the outline at about 4:30, tangent to it.
    const at = `M${P(247, 25.5)}V${f(Y(31.5))}A${f(3 * k)} ${f(3 * k)} 0 0 0 ${P(253, 31.5)}V${f(Y(30))}` +
      `A${f(13 * k)} ${f(13 * k)} 0 1 0 ${P(245, 42)}C${P(249, 43.5)} ${P(253, 46.4)} ${P(256, 48.4)}`;
    const r = 4.62 * k, q = 0.7071 * r, { cx, cy } = g; // center dot, split along the diagonal
    const dot = `<path class="fm-y" d="M${f(cx - q)} ${f(cy + q)}A${f(r)} ${f(r)} 0 0 1 ${f(cx + q)} ${f(cy - q)}Z"/>` +
      `<path class="fm-d" d="M${f(cx + q)} ${f(cy - q)}A${f(r)} ${f(r)} 0 0 1 ${f(cx - q)} ${f(cy + q)}Z"/>`;
    // Glass box: from where the neck starts (or just past another extension's icon, so we never blur it) to the pebble's edge.
    const gx = f(Math.max(X(204), neighbor ? neighbor.right + 2 : -Infinity)), gy = f(g.top - 1);
    const box = x0 => `left:${x0}px;top:${gy}px;width:${f(g.right + 1 - x0)}px;height:${f(g.bottom + 1 - gy)}px;clip-path:path('${pebblePath(g, h, x0, gy)}')`;
    const fx = f(Math.max(gx + 8, X(234)));
    const glass = `<div class="frost" style="${box(fx)}"></div><div class="glass" style="${box(gx)};--fm-fade:${f(fx - gx)}px"></div>`;
    // Sharing the field: the outline (and its glow) runs from their color at their icon, blends where the neck
    // meets our bubble, and is ours from there on.
    let glow = 'filter:drop-shadow(0 0 4px var(--fm-glow))', defs = '', stroke = '';
    if (neighbor) {
      const c = neighbor.color, mid = neighbor.mid, join = X(218);
      defs = `<defs><linearGradient id="fm-g" gradientUnits="userSpaceOnUse" x1="${f(mid)}" y1="0" x2="${f(cx)}" y2="0">` +
        `<stop offset="0" style="stop-color:${c}"/><stop offset="${f((join - mid) / (cx - mid))}" style="stop-color:color-mix(in oklab, ${c}, var(--fm-line))"/>` +
        `<stop offset="1" style="stop-color:var(--fm-line)"/></linearGradient>` +
        `<filter id="fm-b" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="2"/></filter></defs>` +
        `<path d="${d}" filter="url(#fm-b)" style="fill:none;stroke:url(#fm-g);stroke-width:3;opacity:.6"/>`;
      glow = '';
      stroke = ' style="stroke:url(#fm-g)"';
    }
    return `${glass}<svg width="${f(w)}" height="${f(h)}" style="${glow}">${defs}
      <path class="fm-line" d="${d}"${stroke}/><path class="fm-at" d="${at}"/>${dot}</svg>`;
  }

  // Light or dark glass, from the first solid background behind the field. A page that paints no background at all shows
  // the browser's canvas: white, unless the page opts into dark with color-scheme, and then the browser setting decides.
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function rgbaOf(color) { // the canvas parses any CSS color format
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = '#0000';
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    return probe.getImageData(0, 0, 1, 1).data;
  }
  function darkBehind(el) {
    const lin = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    for (let n = el; n; n = up(n)) {
      if (!(n instanceof Element)) continue;
      const [r, g, b, a] = rgbaOf(getComputedStyle(n).backgroundColor);
      if (a >= 128) return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b) < .2;
    }
    return /dark/.test(getComputedStyle(document.documentElement).colorScheme) && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Would the bubble, outside the field, cover the page's own content? Samples a 3x3 grid over the part beyond the field.
  // Anything there other than the field and the boxes around it counts: text, images, controls, or a painted box. A painted box
  // that sits behind the field AND the whole bubble (a modal's panel or backdrop drawn as a separate layer, as on x.com and
  // Reddit) is background; if the bubble would hang over its edge, it blocks.
  // Returns what's in the way (for data-fmalias-place and debug logs), or '' when the spot is free.
  function spotTaken(r, g) {
    const own = new Set([host, field, ...ancestors(field)]);
    const x0 = Math.max(r.right + 2, r.left + g.left), x1 = r.left + g.right - 2, y0 = r.top + g.top + 2, y1 = r.top + g.bottom - 2;
    const holds = (q, left, top, right, bottom) => q.left <= left && q.top <= top && q.right >= right && q.bottom >= bottom;
    const behind = n => { const q = n.getBoundingClientRect();
      return holds(q, r.left, r.top, r.right, r.bottom) && holds(q, r.left + g.left - 4, r.top + g.top - 4, r.left + g.right + 4, r.top + g.bottom + 4); };
    const range = document.createRange();
    // Text counts where its letters are, not across its element's whole box (a wide flex label next to the field).
    const textAt = (n, x, y) => [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim() &&
      (range.selectNodeContents(c), [...range.getClientRects()].some(q => x >= q.left - 1 && x <= q.right + 1 && y >= q.top - 1 && y <= q.bottom + 1)));
    for (const fx of [0, .5, 1]) for (const fy of [0, .5, 1]) {
      const x = x0 + (x1 - x0) * fx, y = y0 + (y1 - y0) * fy;
      for (const n of document.elementsFromPoint(x, y)) {
        if (own.has(n) || frame.contains(n)) continue;
        const s = getComputedStyle(n);
        if (n.matches('img, svg, canvas, video, iframe, a, button, input, select, textarea') || textAt(n, x, y) ||
          (rgbaOf(s.backgroundColor)[3] > 25 || visibleBorder(s)) && !behind(n)) return n.localName + (n.id ? '#' + n.id : typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/)[0] : '');
      }
    }
    return '';
  }

  // Badge inside the field: widen the input's right padding so typed text stops short of it. Restored when it moves away.
  let savedPad = null, padPx = 0;
  function padField(px) {
    if (px === padPx) return;
    padPx = px;
    if (savedPad) for (const [k, v, prio] of savedPad) field.style.setProperty(k, v, prio);
    savedPad = null;
    const s = getComputedStyle(field), extra = px - parseFloat(s.paddingRight);
    if (!px || extra <= 0) return;
    savedPad = ['padding-right', 'width'].map(k => [k, field.style.getPropertyValue(k), field.style.getPropertyPriority(k)]);
    field.style.setProperty('padding-right', px + 'px', 'important');
    if (s.boxSizing === 'content-box') field.style.setProperty('width', parseFloat(s.width) - extra + 'px', 'important'); // same outer size
  }

  function place() {
    const r = frame?.getBoundingClientRect();
    if (!field?.isConnected || !frame.isConnected || !r.width) return hide();
    // Inside a pop-up centered with a CSS transform, "fixed" means fixed to the pop-up, not the screen.
    // Our layer is translated back onto the screen's corner; any translate also makes it the reference box for our parts.
    const h0 = host.getBoundingClientRect();
    shift = { x: shift.x - h0.left, y: shift.y - h0.top };
    host.style.translate = `${shift.x}px ${shift.y}px`;
    let x, y;
    // Where the @ goes: (a) the traced bubble at the field's end; (b) with a password manager's icon, past that icon, but only
    // if that spot is free of page content; (c) otherwise the small badge inside the field, 6px left of the icon;
    // (d) a field too narrow for that gets nothing on the page (the toolbar popup still works).
    const g = geom(r.width, r.height), fits = r.left + g.right + 2 <= innerWidth;
    const taken = bubbleOk && fits && neighbor ? spotTaken(r, g) : '';
    let spot = bubbleOk && fits && !taken ? 'traced' : neighbor ? 'beside icon' : 'inside';
    const besideX = neighbor && r.left + neighbor.left - 32 - 6;
    if (spot === 'beside icon' && besideX - r.left < 48) spot = 'none'; // under ~48px left for typing
    const said = spot + (taken ? ` (spot past the icon taken by ${taken})` : '');
    if (field.getAttribute('data-fmalias-place') !== said) { field.setAttribute('data-fmalias-place', said); if (debug) console.log('[FMAlias] @ ' + said); }
    setBubble(spot === 'traced');
    padField(spot === 'beside icon' ? Math.ceil(field.getBoundingClientRect().right - besideX + 4) : 0);
    badge.hidden = spot === 'none';
    ring.hidden = !bubble;
    badge.classList.toggle('ghost', bubble);
    badge.classList.toggle('plain', !bubble);
    if (bubble) {
      const key = r.width + 'x' + r.height + (neighbor ? `:${neighbor.right}:${neighbor.color}` : '');
      if (key !== drawn) { ring.innerHTML = ringSvg(r.width, r.height); drawn = key; }
      ring.style.left = r.left + 'px';
      ring.style.top = r.top + 'px';
      // Clickable area over the pebble (the SVG ignores the mouse), never under 40px; its focus ring sits 3px outside it.
      const bw = Math.max(40, g.right - g.left), bh = Math.max(40, g.bottom - g.top);
      x = r.left + (g.left + g.right - bw) / 2;
      y = r.top + (g.top + g.bottom - bh) / 2;
      Object.assign(badge.style, { left: x + 'px', top: y + 'px', width: bw + 'px', height: bh + 'px' });
    } else {
      x = neighbor ? besideX : Math.max(r.left + 2, r.right - 60); // ~28px in from the right edge, where password managers put theirs
      y = r.top + (r.height - 28) / 2;
    }
    if (!bubble) Object.assign(badge.style, { left: x + 'px', top: y + 'px', width: '', height: '' }); // size comes from .plain
    if (panel.hidden) return;
    const w = panel.offsetWidth, h = panel.offsetHeight, gap = bubble ? 8 : 4;
    panel.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    panel.style.top = (r.bottom + gap + h > innerHeight && r.top - gap - h > 0 ? r.top - gap - h : r.bottom + gap) + 'px';
  }

  function show(el) {
    if (el !== field) {
      if (field) padField(0);
      restoreBorder();
      bubble = false;
      unmark(field);
      field = el;
      measure(el);
      wrap.classList.toggle('dark', darkBehind(el));
      updateNeighbor();
      rechecks.forEach(clearTimeout);
      // Password managers draw their icons a moment after focus.
      // A field focused as the page loads can be measured mid-transition (x.com fades its border in), so until it's traced
      // the look is decided again too. Once traced we've hidden its border ourselves, so there's nothing left to re-read.
      rechecks = [300, 1000].map(t => setTimeout(() => { if (field === el) { if (!bubbleOk) measure(el); updateNeighbor(); place(); } }, t));
      // ...or much later, on autofocused fields: they append their icon to <html> or <body>, so watch those while we show.
      watch.disconnect();
      for (const n of [document.documentElement, document.body]) if (n) watch.observe(n, { childList: true });
      // ...and anything appearing near the field, like a validation message after typing, which can take the bubble's spot.
      let near = formScope(el);
      if (!near) { near = frame; for (let i = 0; i < 3 && up(near) instanceof Element; i++) near = up(near); }
      watch.observe(near, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    const parent = containerFor(el);
    if (host.parentNode !== parent) parent.appendChild(host);
    el.setAttribute('data-fmalias', 'attached'); // lets test pages see which field has the badge
    badge.hidden = false;
    place();
  }

  // Decides what to trace (the field or its wrapper) and whether it gets the outline or the plain badge.
  function measure(el) {
    const [fr, box] = frameFor(el);
    if (fr !== frame) { restoreBorder(); bubble = false; drawn = ''; }
    frame = fr;
    radius = parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0;
    const why = plainLook(frame.getBoundingClientRect(), box);
    bubbleOk = !why;
    const name = frame.localName + (typeof frame.className === 'string' && frame.className.trim() ? '.' + frame.className.trim().split(/\s+/).join('.') : '');
    const look = why ? 'plain: ' + why : frame === el ? `traced (${box})` : `traced: wrapper ${name} (${box})`;
    if (el.getAttribute('data-fmalias-look') !== look && debug) console.log(`[FMAlias] ${look}`);
    el.setAttribute('data-fmalias-look', look);
  }

  // Bubble mode hides the frame's border (and, for a wrapper, the input's own focus ring); the plain badge leaves them alone.
  function setBubble(on) {
    if (on === bubble) return;
    bubble = on;
    drawn = '';
    if (!on) return restoreBorder();
    const targets = frame === field ? [[frame, HIDDEN_STYLE]] : [[frame, HIDDEN_STYLE], [field, { 'outline-style': 'none', 'box-shadow': 'none' }]];
    savedStyle = targets.flatMap(([n, st]) => Object.keys(st).map(k => [n, k, n.style.getPropertyValue(k), n.style.getPropertyPriority(k)]));
    for (const [n, st] of targets) for (const k in st) n.style.setProperty(k, st[k], 'important');
  }

  // Pop-up windows (aria-modal or <dialog>) pull focus back or make the rest of the page unclickable,
  // so our layer has to live inside the pop-up the field is in (Reddit's login window does this).
  function containerFor(el) {
    for (let n = el; n; n = n.getRootNode().host) {
      const m = n.closest('dialog[open], [aria-modal="true"]');
      if (m) return m;
    }
    return document.documentElement;
  }

  function restoreBorder() {
    if (savedStyle) for (const [n, k, v, prio] of savedStyle) n.style.setProperty(k, v, prio);
    savedStyle = null;
  }

  let watchFrame = 0;
  const ourChange = m => m.target === host || m.target === field || m.target === frame || // our own style and attribute changes
    m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every(n => n === host);
  const watch = new MutationObserver(ms => {
    if (!field || watchFrame || ms.every(ourChange)) return;
    watchFrame = requestAnimationFrame(() => { watchFrame = 0; if (field) { updateNeighbor(); place(); } });
  });

  function hide() { // detached when idle so pages can't spot the extension
    watch.disconnect();
    if (field) padField(0);
    restoreBorder();
    bubble = false;
    neighbor = null;
    rechecks.forEach(clearTimeout);
    unmark(field);
    panel.hidden = badge.hidden = ring.hidden = true;
    field = frame = null;
    host.remove();
  }

  function closePanel() {
    const el = field;
    hide();
    el?.focus(); // refocus re-shows the badge via focusin
  }

  // A page can restyle or cover our element to trick clicks: act only when `el` is visible and on top.
  // Limitation: a pointer-events:none overlay drawn over the badge still passes; IntersectionObserver v2 could catch that.
  function onTop(el) {
    const s = getComputedStyle(host), r = el.getBoundingClientRect();
    return s.opacity === '1' && s.visibility === 'visible' && s.filter === 'none' && s.mixBlendMode === 'normal' &&
      host.getRootNode().elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === host;
  }

  function showError(e) {
    msg.textContent = errorText(e);
    if (e?.code === 'NO_TOKEN') {
      const b = Object.assign(document.createElement('button'), { className: 'link', textContent: 'Open settings' });
      b.onclick = () => send({ type: 'openOptions' }).catch(() => {});
      msg.append(b);
    }
    msg.hidden = false;
    place();
  }

  async function openPanel() {
    const target = field;
    panel.hidden = false;
    msg.hidden = existing.hidden = true;
    prefixIn.value = defaultPrefix(URL.canParse(self.origin) ? new URL(self.origin).hostname : ''); // self.origin: about:blank/srcdoc frames inherit the parent's
    place();
    prefixIn.focus();
    prefixIn.select();
    try {
      const { list } = await send({ type: 'list' });
      if (field !== target || panel.hidden) return;
      existing.querySelector('ul').replaceChildren(...list.map(a => {
        const li = document.createElement('li');
        const b = Object.assign(document.createElement('button'), { textContent: a.email, title: 'Use ' + a.email });
        b.onclick = () => use(a.email, target);
        li.append(b);
        return li;
      }));
      existing.hidden = !list.length;
      place();
    } catch (e) { if (field === target) showError(e); }
  }

  async function create() {
    const target = field;
    if (!onTop(createBtn)) return;
    createBtn.disabled = true;
    msg.hidden = true;
    try {
      const { alias } = await send({ type: 'create', prefix: sanitizePrefix(prefixIn.value) });
      use(alias.email, target);
    } catch (e) { if (field === target) showError(e); }
    createBtn.disabled = false;
  }

  function setValue(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); // bypasses React/Vue's patched setter so they see the change
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fill(el, email) {
    setValue(el, email);
    // Also fill an empty "confirm email" field, but only in the same form or pop-up: never elsewhere on the page.
    const scope = formScope(el);
    if (scope) for (const o of deepElements(scope)) {
      if (o !== el && o instanceof HTMLInputElement && !o.value && !o.disabled && !o.readOnly &&
        emailish(o) && CONFIRM_RE.test(fieldText(o))) setValue(o, email);
    }
  }

  function use(email, target) {
    if (target?.isConnected) fill(target, email);
    navigator.clipboard?.writeText(email).catch(() => {});
    if (field === target) closePanel();
  }

  badge.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the field
  badge.addEventListener('click', () => panel.hidden ? onTop(badge) && openPanel() : closePanel());
  createBtn.addEventListener('click', create);
  // Keep the page's own hotkeys from reacting to typing in the panel.
  for (const t of ['keydown', 'keyup', 'keypress']) panel.addEventListener(t, e => e.stopPropagation());
  panel.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target === prefixIn) { e.preventDefault(); create(); }
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
  });

  const ours = e => e.composedPath().includes(host);

  // The popup fills the field the user last had the badge on; the background remembers which frame that was.
  function noteField(el) {
    lastField = el;
    try { chrome.runtime.sendMessage({ type: 'fieldFocused' }).catch(() => {}); } catch {}
  }

  function track(el) {
    if (el !== field) hide();
    if (wantsBadge(el)) { noteField(el); show(el); }
  }
  // Focus moving between two elements inside one shadow root (Close button -> field in a pop-up) never reaches window,
  // so every shadow root focus has entered gets its own listener too. lastFocus drops the duplicate when both fire.
  const watchedRoots = new WeakSet();
  let lastFocus = null;
  function onFocusIn(e) {
    if (e === lastFocus || ours(e)) return;
    lastFocus = e;
    const el = deepTarget(e.composedPath()[0]);
    for (let n = el; n; n = up(n)) {
      const r = n.getRootNode();
      if (r instanceof ShadowRoot && !watchedRoots.has(r)) { watchedRoots.add(r); r.addEventListener('focusin', onFocusIn, true); }
    }
    track(el);
  }
  addEventListener('focusin', onFocusIn, true);
  // Clicking a field that already has focus fires no focusin (e.g. after the badge was hidden by a window blur).
  addEventListener('click', e => {
    const el = e.composedPath()[0];
    if (!ours(e) && badge.hidden && el instanceof Element && el.matches(':focus')) track(deepTarget(el));
  }, true);
  // Signup pages often autofocus the email field before this script loads.
  chrome.storage.local.get(['hiddenSites', 'debug']).then(({ hiddenSites: h = [], debug: d = false }) => {
    hiddenSites = h;
    debug = d;
    const active = deepTarget(document.activeElement);
    if (active) track(active);
  }).catch(() => {});
  chrome.storage.onChanged.addListener(c => {
    if (c.debug) debug = !!c.debug.newValue;
    if (!c.hiddenSites) return;
    hiddenSites = c.hiddenSites.newValue || [];
    if (field && panel.hidden && !wantsBadge(field)) hide();
  });
  addEventListener('focusout', e => { if (!ours(e) && panel.hidden) hide(); }, true);
  addEventListener('mousedown', e => {
    if (panel.hidden || ours(e)) return;
    if (e.composedPath()[0] === field) panel.hidden = true; else hide();
  }, true);
  addEventListener('scroll', () => field && place(), { capture: true, passive: true });
  addEventListener('resize', () => { if (field) { updateNeighbor(); place(); } }, { passive: true });
  addEventListener('contextmenu', e => { ctxTarget = deepTarget(e.composedPath()[0]); }, true);

  chrome.runtime.onMessage.addListener((m, _, reply) => {
    if (m.type === 'openPanel' && (ctxTarget instanceof HTMLInputElement || ctxTarget instanceof HTMLTextAreaElement)) {
      const el = ctxTarget;
      el.focus();
      noteField(el);
      show(el);
      openPanel();
    } else if (m.type === 'fill' && m.origin === self.origin && lastField?.isConnected) {
      fill(lastField, m.email);
      reply({ filled: true });
    }
  });
})();
