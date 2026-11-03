(() => {
  const EMAIL_RE = /e-?mail/i;
  const CONFIRM_RE = /confirm|repeat|verif|again|retype|re-?enter/i;
  let field = null;     // field the badge/panel is attached to
  let lastField = null; // last focused email field, filled from the toolbar popup
  let ctxTarget = null; // last right-clicked element, for the context menu
  let bubble = false;   // true: outline + bubble overlay; false: plain round badge
  let radius = 0;       // field's own corner radius, read before we hide its border
  let savedStyle = null, drawn = '', shift = { x: 0, y: 0 };
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

  // Visible text of a label, following <slot>s: Reddit passes "Email or username" into its input component through one,
  // and plain textContent sees an empty slot.
  const textOf = n => n.nodeType === Node.TEXT_NODE ? n.data :
    [...(n.localName === 'slot' ? n.assignedNodes({ flatten: true }) : n.childNodes)].map(textOf).join(' ');

  function isEmailField(el) {
    if (!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return false;
    if (el.type === 'email') return true;
    if (el.type !== 'text') return false;
    const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => el.getRootNode().getElementById?.(id)).filter(Boolean).map(textOf);
    const hints = [el.name, el.id, el.autocomplete, el.placeholder, el.getAttribute('aria-label'), ...labelledBy, ...[...(el.labels || [])].map(textOf)];
    // Web components (e.g. Reddit's <faceplate-text-input label="Email or username">) keep the label on the host element.
    const host = el.getRootNode().host;
    if (host) hints.push(...['name', 'id', 'label', 'placeholder', 'aria-label'].map(a => host.getAttribute(a)));
    return hints.some(v => v && EMAIL_RE.test(v));
  }

  // Follow focus into shadow roots, including closed ones that composedPath() hides (extensions may open them, as Bitwarden does).
  function deepTarget(el) {
    for (let r; el && (r = chrome.dom?.openOrClosedShadowRoot?.(el) ?? el.shadowRoot) && r.activeElement;) el = r.activeElement;
    return el;
  }

  // Tiny, pill-shaped or borderless fields get the plain badge: the traced outline would look wrong on them.
  function plainLook(r, s) {
    return r.height < 32 || r.width < 120 || radius >= r.height / 2 - 2 || !parseFloat(s.borderTopWidth) ||
      s.borderTopStyle === 'none' || /^transparent$|rgba\(.*,\s*0\)$/.test(s.borderTopColor);
  }

  // Field outline (in field coordinates) that pinches at the right and flows into a circle of radius R.
  // For a 316x44 field with radius 8 this is exactly the reference design, shifted up 7px.
  // Bubble circle in field coordinates: mostly over the field's right end, poking out a little.
  const circle = (w, h) => { const R = Math.round(0.45 * h); return { R, cx: w - R * 0.25, cy: h / 2 }; };

  function ringSvg(w, h) {
    const f = n => +n.toFixed(2), { R, cx, cy } = circle(w, h), k = 0.707 * R, ex = cx - k, nx = cx - R - 8;
    const y0 = 1, y1 = h - 1, rr = Math.max(0, Math.min(radius, h / 2 - 1)), s = 0.62 * R / 9;
    // Neck: leaves the edge at nx, dips slightly, and meets the circle tangent at its 135deg/225deg points.
    const d = `M${f(1 + rr)} ${y0}H${f(nx)}C${f(nx + 6)} ${y0} ${f(ex - 3)} ${f(cy - k + 3)} ${f(ex)} ${f(cy - k)}` +
      `A${R} ${R} 0 1 1 ${f(ex)} ${f(cy + k)}C${f(ex - 3)} ${f(cy + k - 3)} ${f(nx + 6)} ${f(y1)} ${f(nx)} ${f(y1)}` +
      `H${f(1 + rr)}A${f(rr)} ${f(rr)} 0 0 1 1 ${f(y1 - rr)}V${f(y0 + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(1 + rr)} ${y0}Z`;
    return `<svg width="${f(w)}" height="${f(h)}" style="overflow:visible;filter:drop-shadow(0 0 4px var(--fm-glow))">
      <circle class="fm-fill" cx="${f(cx)}" cy="${f(cy)}" r="${R - 0.5}"/><circle class="fm-tint" cx="${f(cx)}" cy="${f(cy)}" r="${R - 0.5}"/>
      <path class="fm-line" d="${d}"/>
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
    if (bubble) {
      const key = r.width + 'x' + r.height;
      if (key !== drawn) { ring.innerHTML = ringSvg(r.width, r.height); drawn = key; }
      ring.style.left = r.left + 'px';
      ring.style.top = r.top + 'px';
      const { R, cx, cy } = circle(r.width, r.height);
      size = Math.max(40, 2 * R); // clickable circle over the bubble (the SVG ignores the mouse), never under 40px
      x = r.left + cx - size / 2;
      y = r.top + cy - size / 2;
    } else {
      size = 28; // ~28px in from the right edge so Bitwarden's own inline icon keeps its spot
      x = Math.max(r.left + 2, r.right - 56);
      y = r.top + (r.height - size) / 2;
    }
    Object.assign(badge.style, { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px' });
    if (panel.hidden) return;
    const w = panel.offsetWidth, h = panel.offsetHeight, gap = bubble ? 8 : 4;
    panel.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    panel.style.top = (r.bottom + gap + h > innerHeight && r.top - gap - h > 0 ? r.top - gap - h : r.bottom + gap) + 'px';
  }

  function show(el) {
    if (el !== field) {
      restoreBorder();
      field = el;
      const s = getComputedStyle(el);
      radius = parseFloat(s.borderTopLeftRadius) || 0;
      bubble = !plainLook(el.getBoundingClientRect(), s);
      drawn = '';
      if (bubble) {
        savedStyle = Object.keys(HIDDEN_STYLE).map(k => [k, el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]);
        for (const k in HIDDEN_STYLE) el.style.setProperty(k, HIDDEN_STYLE[k], 'important');
      }
    }
    const parent = containerFor(el);
    if (host.parentNode !== parent) parent.appendChild(host);
    badge.hidden = false;
    ring.hidden = !bubble;
    badge.classList.toggle('ghost', bubble);
    place();
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
    for (const o of (el.form || el.getRootNode()).querySelectorAll('input')) {
      const attrs = [o.name, o.id, o.placeholder, o.getAttribute('aria-label')].join(' ');
      if (o !== el && !o.value && isEmailField(o) && CONFIRM_RE.test(attrs)) setValue(o, email);
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

  function track(el) {
    if (el !== field) hide();
    if (isEmailField(el)) { lastField = el; show(el); }
  }
  addEventListener('focusin', e => { if (!ours(e)) track(deepTarget(e.composedPath()[0])); }, true);
  // Clicking a field that already has focus fires no focusin (e.g. after the badge was hidden by a window blur).
  addEventListener('click', e => {
    const el = e.composedPath()[0];
    if (!ours(e) && badge.hidden && el instanceof Element && el.matches(':focus')) track(deepTarget(el));
  }, true);
  // Signup pages often autofocus the email field before this script loads.
  const active = deepTarget(document.activeElement);
  if (active) track(active);
  addEventListener('focusout', e => { if (!ours(e) && panel.hidden) hide(); }, true);
  addEventListener('mousedown', e => {
    if (panel.hidden || ours(e)) return;
    if (e.composedPath()[0] === field) panel.hidden = true; else hide();
  }, true);
  addEventListener('scroll', () => field && place(), { capture: true, passive: true });
  addEventListener('resize', () => field && place(), { passive: true });
  addEventListener('contextmenu', e => { ctxTarget = deepTarget(e.composedPath()[0]); }, true);

  chrome.runtime.onMessage.addListener((m, _, reply) => {
    if (m.type === 'openPanel' && (ctxTarget instanceof HTMLInputElement || ctxTarget instanceof HTMLTextAreaElement)) {
      const el = ctxTarget;
      el.focus();
      lastField = el;
      show(el);
      openPanel();
    } else if (m.type === 'fill' && m.origin === self.origin && lastField?.isConnected) {
      fill(lastField, m.email);
      reply({ filled: true });
    }
  });
})();
