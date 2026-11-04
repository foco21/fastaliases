(() => {
  const CONFIRM_RE = /confirm|repeat|verif|again|retype|re-?enter/i;
  let field = null;     // field the badge/panel is attached to
  let lastField = null; // last focused email field, filled from the toolbar popup
  let ctxTarget = null; // last right-clicked element, for the context menu
  let bubble = false;   // true: outline + bubble overlay; false: plain round badge
  let radius = 0;       // field's own corner radius, read before we hide its border
  let savedStyle = null, drawn = '', shift = { x: 0, y: 0 };
  let bubbleOk = false; // field suits the traced outline (bubble may still fall back if there's no room)
  let neighbor = null;  // another extension's inline icon at the field's right end, in field coordinates
  let rechecks = [];
  const HIDDEN_STYLE = { 'border-color': 'transparent', 'outline-color': 'transparent', 'box-shadow': 'none' }; // the overlay replaces the field's own outline and focus ring

  // Colors come from the --fm-* variables below so the bubble follows the light/dark theme.
  const LOGO = `<path class="fm-l1" d="M21 12a9 9 0 1 0-5.5 8.28C17.34 19.5 22.74 21.96 23.88 20.32"/>
    <path class="fm-l2" d="M16 9v4.5a2.5 2.5 0 0 0 5 0V12"/>
    <path class="fm-y" d="M14.83 9.17A4 4 0 0 0 9.17 14.83Z"/>
    <path class="fm-d" d="M9.17 14.83A4 4 0 0 0 14.83 9.17Z"/>`;

  const host = document.createElement('fastmail-alias');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    :host { --fm-line:#0067B9; --fm-line2:#69B3E7; --fm-dot:#0067B9; --fm-fill:#FFFFFF; --fm-tint:rgba(105,179,231,.14); --fm-glow:rgba(105,179,231,.6); }
    @media (prefers-color-scheme: dark) { :host { --fm-line:#69B3E7; --fm-line2:#A9D4F5; --fm-dot:#3D8FD1; --fm-fill:#1F2023; --fm-tint:rgba(105,179,231,.18); --fm-glow:rgba(105,179,231,.45); } }
    .fm-fill { fill:var(--fm-fill); } .fm-tint { fill:var(--fm-tint); } .fm-y { fill:#FFC107; } .fm-d { fill:var(--fm-dot); }
    .fm-line { fill:none; stroke:var(--fm-line); stroke-width:2; stroke-linejoin:round; }
    .fm-l1, .fm-l2 { fill:none; stroke-linecap:round; stroke-linejoin:round; }
    .fm-l1 { stroke:var(--fm-line); } .fm-l2 { stroke:var(--fm-line2); }
    :host { --bg:#fff; --fg:#1d1d1f; --muted:#6b7280; --line:#e5e7eb; --hover:#f3f4f6; --accent:#2563eb; --accent-fg:#fff; --err:#b91c1c; }
    @media (prefers-color-scheme: dark) { :host { --bg:#1f2023; --fg:#ececef; --muted:#9ca3af; --line:#3a3b40; --hover:#2a2b2f; --accent:#60a5fa; --accent-fg:#0b1220; --err:#f87171; } }
    * { box-sizing:border-box; font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; }
    [hidden] { display:none !important; }
    .ring { position:fixed; pointer-events:none; }
    .badge { position:fixed; width:28px; height:28px; padding:0; border:0; border-radius:50%; cursor:pointer; display:grid; place-items:center;
      background:var(--fm-fill); box-shadow:0 0 0 1.5px var(--fm-line), 0 0 4px var(--fm-glow); }
    .badge svg { width:20px; height:20px; overflow:visible; }
    .badge.ghost { background:transparent; box-shadow:none; }
    .badge.ghost svg { display:none; }
    .badge:focus-visible { outline:2px solid var(--fm-line); outline-offset:2px; }
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
  <div class="ring" hidden></div>
  <button class="badge" title="Create Fastmail alias" aria-label="Create Fastmail alias" hidden><svg viewBox="0 0 24 24" stroke-width="2.4" aria-hidden="true">${LOGO}</svg></button>
  <div class="panel" role="dialog" aria-label="Fastmail alias" hidden>
    <div class="title">Fastmail alias</div>
    <div class="row"><input class="prefix" spellcheck="false" autocomplete="off" aria-label="Alias prefix" placeholder="prefix"><button class="create">Create</button></div>
    <div class="msg" role="alert" hidden></div>
    <div class="existing" hidden><div class="label">Already have one here</div><ul></ul></div>
  </div>`;
  const $ = s => root.querySelector(s);
  const ring = $('.ring'), badge = $('.badge'), panel = $('.panel'), prefixIn = $('.prefix'), createBtn = $('.create'), msg = $('.msg'), existing = $('.existing');

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
  const unmark = el => { if (el?.getAttribute('data-fmalias') === 'attached') el.removeAttribute('data-fmalias'); el?.removeAttribute('data-fmalias-neighbor'); };

  // Shadow root of an element, open or closed (extensions may open closed ones, as Bitwarden does).
  // chrome.dom.openOrClosedShadowRoot throws on anything that isn't an HTML element, e.g. the SVG icons all over Reddit.
  const shadowOf = n => n instanceof HTMLElement ? chrome.dom?.openOrClosedShadowRoot?.(n) ?? n.shadowRoot : null;

  // Follow focus into shadow roots, including closed ones that composedPath() hides.
  function deepTarget(el) {
    for (let r; el && (r = shadowOf(el)) && r.activeElement;) el = r.activeElement;
    return el;
  }

  // Tiny, pill-shaped or borderless fields get the plain badge: the traced outline would look wrong on them.
  function plainLook(r, s) {
    return r.height <= 32 || r.width < 120 || radius >= r.height / 2 - 2 || !parseFloat(s.borderTopWidth) ||
      s.borderTopStyle === 'none' || /^transparent$|rgba\(.*,\s*0\)$/.test(s.borderTopColor);
  }

  // Field outline (in field coordinates) that pinches at the right and flows into a circle of radius R.
  // For a 316x44 field with radius 8 this is exactly the reference design, shifted up 7px.
  // Bubble circle in field coordinates: mostly over the field's right end, poking out a little.
  // With another extension's icon there, the bubble moves outside the field, just right of that icon.
  const circle = (w, h) => {
    const R = Math.round(0.45 * h);
    return { R, cx: neighbor ? Math.max(w + R * 0.6, neighbor.right + R + 6) : w - R * 0.25, cy: h / 2 };
  };

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
  function findNeighbor(el) {
    const r = el.getBoundingClientRect(), skip = new Set([el, host, ...ancestors(el)]), seen = new Set(), found = [];
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
    neighbor = findNeighbor(field);
    if (neighbor) field.setAttribute('data-fmalias-neighbor', neighbor.name); else field.removeAttribute('data-fmalias-neighbor');
  }

  function ringSvg(w, h) {
    const f = n => +n.toFixed(2), { R, cx, cy } = circle(w, h), k = 0.707 * R, ex = cx - k, nx = cx - R - 8;
    const y0 = 1, y1 = h - 1, rr = Math.max(0, Math.min(radius, h / 2 - 1)), s = 0.62 * R / 9;
    // Neck: leaves the edge at nx, dips slightly, and meets the circle tangent at its 135deg/225deg points.
    const d = `M${f(1 + rr)} ${y0}H${f(nx)}C${f(nx + 6)} ${y0} ${f(ex - 3)} ${f(cy - k + 3)} ${f(ex)} ${f(cy - k)}` +
      `A${R} ${R} 0 1 1 ${f(ex)} ${f(cy + k)}C${f(ex - 3)} ${f(cy + k - 3)} ${f(nx + 6)} ${f(y1)} ${f(nx)} ${f(y1)}` +
      `H${f(1 + rr)}A${f(rr)} ${f(rr)} 0 0 1 1 ${f(y1 - rr)}V${f(y0 + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(1 + rr)} ${y0}Z`;
    // Sharing the field: the outline (and its glow) runs from their color at their icon, blends where the neck
    // meets our bubble, and is ours from there on.
    let glow = 'filter:drop-shadow(0 0 4px var(--fm-glow))', defs = '', stroke = '';
    if (neighbor) {
      const c = neighbor.color, mid = neighbor.mid;
      defs = `<defs><linearGradient id="fm-g" gradientUnits="userSpaceOnUse" x1="${f(mid)}" y1="0" x2="${f(cx)}" y2="0">` +
        `<stop offset="0" style="stop-color:${c}"/><stop offset="${f((ex - mid) / (cx - mid))}" style="stop-color:color-mix(in oklab, ${c}, var(--fm-line))"/>` +
        `<stop offset="1" style="stop-color:var(--fm-line)"/></linearGradient>` +
        `<filter id="fm-b" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="2"/></filter></defs>` +
        `<path d="${d}" filter="url(#fm-b)" style="fill:none;stroke:url(#fm-g);stroke-width:3;opacity:.6"/>`;
      glow = '';
      stroke = ' style="stroke:url(#fm-g)"';
    }
    return `<svg width="${f(w)}" height="${f(h)}" style="overflow:visible;${glow}">${defs}
      <circle class="fm-fill" cx="${f(cx)}" cy="${f(cy)}" r="${R - 0.5}"/><circle class="fm-tint" cx="${f(cx)}" cy="${f(cy)}" r="${R - 0.5}"/>
      <path class="fm-line" d="${d}"${stroke}/>
      <g transform="translate(${f(cx - 12 * s)} ${f(cy - 12 * s)}) scale(${f(s)})" stroke-width="${f(2 / s)}">${LOGO}</g></svg>`;
  }

  function place() {
    const r = field?.getBoundingClientRect();
    if (!field?.isConnected || !r.width) return hide();
    // Inside a pop-up centered with a CSS transform, "fixed" means fixed to the pop-up, not the screen.
    // Our layer is translated back onto the screen's corner; any translate also makes it the reference box for our parts.
    const h0 = host.getBoundingClientRect();
    shift = { x: shift.x - h0.left, y: shift.y - h0.top };
    host.style.translate = `${shift.x}px ${shift.y}px`;
    let size, x, y;
    // No room right of their icon (field near the screen edge): plain badge below the field's right end.
    const c0 = circle(r.width, r.height), below = bubbleOk && !!neighbor && r.left + c0.cx + c0.R + 2 > innerWidth;
    setBubble(bubbleOk && !below);
    ring.hidden = !bubble;
    badge.classList.toggle('ghost', bubble);
    if (bubble) {
      const key = r.width + 'x' + r.height + (neighbor ? `:${neighbor.right}:${neighbor.color}` : '');
      if (key !== drawn) { ring.innerHTML = ringSvg(r.width, r.height); drawn = key; }
      ring.style.left = r.left + 'px';
      ring.style.top = r.top + 'px';
      const { R, cx, cy } = circle(r.width, r.height);
      size = Math.max(40, 2 * R); // clickable circle over the bubble (the SVG ignores the mouse), never under 40px
      x = r.left + cx - size / 2;
      y = r.top + cy - size / 2;
    } else {
      size = 28;
      if (below) { x = r.right - size; y = r.bottom + 4; }
      else { // left of their icon, or ~28px in from the right edge where password managers usually put theirs
        x = Math.max(r.left + 2, neighbor ? r.left + neighbor.left - size - 4 : r.right - 56);
        y = r.top + (r.height - size) / 2;
      }
    }
    Object.assign(badge.style, { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px' });
    if (panel.hidden) return;
    const w = panel.offsetWidth, h = panel.offsetHeight, gap = bubble ? 8 : below ? 36 : 4;
    panel.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    panel.style.top = (r.bottom + gap + h > innerHeight && r.top - gap - h > 0 ? r.top - gap - h : r.bottom + gap) + 'px';
  }

  function show(el) {
    if (el !== field) {
      restoreBorder();
      bubble = false;
      unmark(field);
      field = el;
      const s = getComputedStyle(el);
      radius = parseFloat(s.borderTopLeftRadius) || 0;
      bubbleOk = !plainLook(el.getBoundingClientRect(), s);
      updateNeighbor();
      rechecks.forEach(clearTimeout);
      // Password managers draw their icons a moment after focus.
      rechecks = [300, 1000].map(t => setTimeout(() => { if (field === el) { updateNeighbor(); place(); } }, t));
    }
    const parent = containerFor(el);
    if (host.parentNode !== parent) parent.appendChild(host);
    el.setAttribute('data-fmalias', 'attached'); // lets test pages see which field has the badge
    badge.hidden = false;
    place();
  }

  // Bubble mode hides the field's own border; the plain badge leaves it alone.
  function setBubble(on) {
    if (on === bubble) return;
    bubble = on;
    drawn = '';
    if (!on) return restoreBorder();
    savedStyle = Object.keys(HIDDEN_STYLE).map(k => [k, field.style.getPropertyValue(k), field.style.getPropertyPriority(k)]);
    for (const k in HIDDEN_STYLE) field.style.setProperty(k, HIDDEN_STYLE[k], 'important');
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
    if (savedStyle && field) for (const [k, v, prio] of savedStyle) field.style.setProperty(k, v, prio);
    savedStyle = null;
  }

  function hide() { // detached when idle so pages can't spot the extension
    restoreBorder();
    bubble = false;
    neighbor = null;
    rechecks.forEach(clearTimeout);
    unmark(field);
    panel.hidden = badge.hidden = ring.hidden = true;
    field = null;
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
