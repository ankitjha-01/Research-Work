/* =============================================================
   LOA Walkthrough — Setup UI & Event Delegation
   Reads globals : cfg, RUN, S, stale, presetIdx  (set by main.js)
   Writes globals: cfg, presetIdx, stale
   Calls          : renderPresets, renderForms, refreshSetup, edited (self)
                    renderDemo, renderRuler, renderVis (render.js)
                    go, stopPlay, togglePlay (main.js)
   ============================================================= */

// ─── Utility Helpers ─────────────────────────────────────────
const LETTERS = 'ABCDEFGH';

/** Sync mode toggle buttons and hint text to the given mode string. */
function syncModeUI(mode) {
  const btnStrict = document.getElementById('modePaperStrict');
  const btnAll    = document.getElementById('modeAllCombos');
  const hint      = document.getElementById('modeHint');
  if (!btnStrict) return;  // setup not rendered yet
  btnStrict.setAttribute('aria-pressed', String(mode === 'paper-strict'));
  btnAll   .setAttribute('aria-pressed', String(mode === 'all-combos'));
  if (hint) {
    hint.textContent = mode === 'paper-strict'
      ? 'Paper 1 (TON 2026): partial groups lock anchor; non-anchor VNFs inserted in parallel only.'
      : 'Paper 2 (TWC 2023 / Tian et al.): all 13 Fubini ordered partitions, same as exhaustive search.';
  }
}

/** Query selector shorthand. */
const $  = (s, r = document) => r.querySelector(s);

/** Deep clone via JSON round-trip. */
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Clamp x between a and b. */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Parse a form value as a finite number (0 on failure). */
const numv = (v) => { const x = parseFloat(v); return isFinite(x) ? x : 0; };

/** Strip HTML tags. */
const plain = (h) => String(h).replace(/<[^>]+>/g, '');


// ─── Setup Helpers ────────────────────────────────────────────

/** Build a dependency-order string like "f1 ≻ f2 = f3 ≻ f4". */
function depString(c) {
  const lv = [...new Set(c.vnfs.map((v) => v.level))].sort((a, b) => a - b);
  return lv.map((l) => c.vnfs.filter((v) => v.level === l).map((v) => v.name).join(' = ')).join(' ≻ ');
}

/** Validate the current config, return { errs, warns }. */
function validate(c) {
  const errs = [], warns = [];
  if (c.nodes.length < 2) errs.push('Need at least 2 MEC nodes.');
  if (c.vnfs.length < 1)  errs.push('Add at least one VNF.');
  if (c.vnfs.length > 7)  errs.push('This demo supports at most 7 VNFs.');
  const lv = {};
  c.vnfs.forEach((v) => { lv[v.level] = (lv[v.level] || 0) + 1; });
  if      (Object.values(lv).some((x) => x > 4)) errs.push('At most 4 VNFs per level.');
  else if (Object.values(lv).some((x) => x > 3)) warns.push('Levels with 4 VNFs make the trace slower.');
  if (c.links.some((l) => !(l.delay > 0)))        errs.push('Every link delay must be positive.');
  if (c.vnfs.some((v) => v.proc < 0 || v.dem < 0)) errs.push('Processing delay and demand cannot be negative.');
  if (!errs.length) {
    try {
      const M = buildModel(c);
      if (M.totalPaths === 0) errs.push('The ingress and egress nodes are not connected.');
    } catch (e) {
      errs.push('The ingress and egress nodes are not connected.');
    }
  }
  return { errs, warns };
}

/** Set a nested property of cfg using a dotted path. */
function setBind(path, val) {
  const p = path.split('.');
  let o = cfg;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = val;
}

/** Build <option> elements for a node selector. */
const nodeOpts = (sel) =>
  cfg.nodes.map((n, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${n.name}</option>`).join('');


// ─── Setup Renderers ──────────────────────────────────────────

/** Render the preset buttons. */
function renderPresets() {
  $('#presets').innerHTML = PRESETS.map((p, i) =>
    `<button class="preset" data-act="preset" data-i="${i}" aria-pressed="${i === presetIdx}">` +
    `<b>${p.label}</b><span>${p.blurb}</span></button>`
  ).join('');
}

/** Re-render all setup form controls. */
function renderForms() {
  // Auto-name nodes and VNFs
  cfg.nodes.forEach((n, i) => { n.name = LETTERS[i]; });
  cfg.vnfs.forEach((v, i)  => { v.name = 'f' + (i + 1); });

  $('#selSrc').innerHTML = nodeOpts(cfg.src);
  $('#selDst').innerHTML = nodeOpts(cfg.dst);

  // Node rows
  $('#nodeRows').innerHTML =
    `<div class="rowh rn"><span>Node</span><span>Capacity C<sub>v</sub></span><span></span></div>` +
    cfg.nodes.map((n, i) =>
      `<div class="r rn" data-node-i="${i}">` +
      `<span class="nm">${n.name}</span>` +
      `<input class="num" type="number" min="0" step="5" value="${n.cap}" data-bind="nodes.${i}.cap" aria-label="Capacity of ${n.name}">` +
      `<button class="x" data-act="delNode" data-i="${i}" aria-label="Remove node ${n.name}" ${cfg.nodes.length <= 3 ? 'disabled' : ''}>×</button>` +
      `</div>`
    ).join('') +
    `<div class="addrow"><button class="btn sm" data-act="addNode" ${cfg.nodes.length >= 7 ? 'disabled' : ''}>Add node</button></div>`;

  // Link rows
  $('#linkRows').innerHTML =
    `<div class="rowh rl"><span>Link</span><span>Delay (ms)</span><span></span></div>` +
    cfg.links.map((l, i) =>
      `<div class="r rl" data-link-i="${i}">` +
      `<span class="nm">${cfg.nodes[l.a].name} – ${cfg.nodes[l.b].name}</span>` +
      `<input class="num" type="number" min="1" step="1" value="${l.delay}" data-bind="links.${i}.delay" aria-label="Delay of link ${cfg.nodes[l.a].name}-${cfg.nodes[l.b].name}">` +
      `<button class="x" data-act="delLink" data-i="${i}" aria-label="Remove link">×</button>` +
      `</div>`
    ).join('');

  // Add-link row
  $('#linkAdd').innerHTML =
    `<select class="num" id="laA" aria-label="Link end 1">${nodeOpts(0)}</select>` +
    `<select class="num" id="laB" aria-label="Link end 2">${nodeOpts(1)}</select>` +
    `<input  class="num" id="laD" type="number" min="1" value="10" aria-label="Delay">` +
    `<button class="btn sm" data-act="addLink">Add link</button>`;

  // VNF rows
  $('#vnfRows').innerHTML =
    `<div class="rowh rv"><span>VNF</span><span>Level</span><span>Processing (ms)</span><span>Demand c<sub>n</sub></span><span></span></div>` +
    cfg.vnfs.map((v, i) =>
      `<div class="r rv">` +
      `<span class="nm">${v.name}</span>` +
      `<input class="num" type="number" min="1" max="6" step="1" value="${v.level}" data-bind="vnfs.${i}.level" aria-label="Level of ${v.name}">` +
      `<input class="num" type="number" min="0" step="1" value="${v.proc}" data-bind="vnfs.${i}.proc" aria-label="Processing delay of ${v.name}">` +
      `<input class="num" type="number" min="0" step="5" value="${v.dem}" data-bind="vnfs.${i}.dem" aria-label="Demand of ${v.name}">` +
      `<button class="x" data-act="delVnf" data-i="${i}" aria-label="Remove ${v.name}" ${cfg.vnfs.length <= 1 ? 'disabled' : ''}>×</button>` +
      `</div>`
    ).join('');

  // Global params
  $('#params').innerHTML =
    `<label>Replication τ<sub>rep</sub> (ms)<input class="num" type="number" min="0" step="1" value="${cfg.trep}" data-bind="trep"></label>` +
    `<label>Integration τ<sub>int</sub> (ms)<input class="num" type="number" min="0" step="1" value="${cfg.tint}" data-bind="tint"></label>` +
    `<label>Deadline T<sub>max</sub> (ms)<input class="num" type="number" min="1" step="10" value="${cfg.tmax}" data-bind="tmax"></label>`;

  refreshSetup();
}

/** Update the summary panel and network SVG without rebuilding all forms. */
function refreshSetup() {
  $('#netEdit').innerHTML = netSVG(cfg, { edit: true });

  // Re-apply highlight to the link currently focused
  const activeRow = document.activeElement ? document.activeElement.closest('.r.rl[data-link-i]') : null;
  if (activeRow) {
    const li = activeRow.dataset.linkI;
    document.querySelectorAll(`[data-link-i="${li}"]`).forEach((el) => el.classList.add('hl-link'));
  }

  const v = validate(cfg);
  let h = `<div class="muted">Dependency order</div><div class="dep">${depString(cfg)}</div>`;
  if (v.errs.length) {
    h += v.errs.map((e) => `<div class="err">${e}</div>`).join('');
  } else {
    try {
      const M = buildModel(cfg);
      h += `<div>${M.L} layer${M.L > 1 ? 's' : ''}, ${M.V.length} partitions, ${M.n} MEC replicas in each: <b>${M.totalPaths.toLocaleString()}</b> DPG paths. LOA starts with k = ${M.n + 1}.</div>`;
    } catch (e) {
      h += `<div class="err">Invalid network configuration</div>`;
    }
  }
  h += v.warns.map((e) => `<div class="warn">${e}</div>`).join('');
  if (stale) h += `<div class="warn">Setup changed since the last run. Run again to refresh the walkthrough.</div>`;
  $('#summary').innerHTML = h;
  $('#runBtn').disabled = v.errs.length > 0;
}

/** Called whenever the user edits a setup field. */
function edited() {
  cfg.vnfs.forEach((v) => { v.level = Math.max(1, Math.round(v.level) || 1); });
  if (presetIdx !== -1) { presetIdx = -1; renderPresets(); }
  if (RUN) stale = true;
  refreshSetup();
}


// ─── Network Editor Drag ──────────────────────────────────────
(function attachDrag() {
  let drag = null;

  document.addEventListener('pointerdown', (e) => {
    const nd = e.target.closest('.nd');
    if (!nd || !nd.closest('#netEdit')) return;
    const i   = +nd.dataset.i;
    const svg = nd.closest('svg');
    const pt  = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
    drag = { i, ox: sp.x - cfg.nodes[i].x, oy: sp.y - cfg.nodes[i].y, svg };
    e.preventDefault();
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pt = drag.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(drag.svg.getScreenCTM().inverse());
    cfg.nodes[drag.i].x = clamp(Math.round(sp.x - drag.ox), 24, 576);
    cfg.nodes[drag.i].y = clamp(Math.round(sp.y - drag.oy), 24, 316);
    refreshSetup();
    e.preventDefault();
  });

  document.addEventListener('pointerup',     () => { drag = null; });
  document.addEventListener('pointercancel', () => { drag = null; });
})();


// ─── Hover / Pin on Ruler ─────────────────────────────────────
(function attachRulerHover() {
  document.addEventListener('pointermove', (e) => {
    const dot = e.target.closest('.dot');
    if (!dot || !dot.closest('#ruler')) {
      if (S && S.hover != null) { S.hover = null; if (RUN) { renderRuler(); renderVis(); } }
      return;
    }
    const id = +dot.dataset.id;
    if (S && S.hover !== id) { S.hover = id; if (RUN) { renderRuler(); renderVis(); } }
  });

  document.addEventListener('click', (e) => {
    if (!RUN) return;
    const dot = e.target.closest('.dot');
    if (dot && dot.closest('#ruler')) {
      const id = +dot.dataset.id;
      S.pin = (S.pin === id) ? null : id;
      renderRuler(); renderVis();
    }
  });
})();


// ─── Table Row Hover ──────────────────────────────────────────
(function attachTableHover() {
  document.addEventListener('pointermove', (e) => {
    if (!RUN) return;
    const tr  = e.target.closest('tr[data-id]');
    const tbl = e.target.closest('#tbl');
    if (!tbl) { if (S.hover != null) { S.hover = null; renderRuler(); renderVis(); } return; }
    const id = tr ? +tr.dataset.id : null;
    if (S.hover !== id) { S.hover = id; renderRuler(); renderVis(); }
  });
})();


// ─── Central Event Delegation ─────────────────────────────────
document.addEventListener('click', (e) => {
  const el  = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  // Setup actions
  if (act === 'preset') {
    const i = +el.dataset.i;
    presetIdx = i;
    cfg = clone(PRESETS[i].cfg);
    stale = false;
    // Apply preset's preferred execution mode
    const m = PRESETS[i].mode || 'all-combos';
    setExecMode(m);
    syncModeUI(m);
    renderPresets();
    renderForms();
    return;
  }
  if (act === 'addNode') {
    const prev = cfg.nodes[cfg.nodes.length - 1];
    cfg.nodes.push({ name: '?', cap: 40, x: Math.min(prev.x + 80, 560), y: prev.y });
    renderForms(); edited(); return;
  }
  if (act === 'delNode') {
    const i = +el.dataset.i;
    cfg.nodes.splice(i, 1);
    cfg.links = cfg.links.filter((l) => l.a !== i && l.b !== i)
      .map((l) => ({ ...l, a: l.a > i ? l.a - 1 : l.a, b: l.b > i ? l.b - 1 : l.b }));
    if (cfg.src >= cfg.nodes.length) cfg.src = 0;
    if (cfg.dst >= cfg.nodes.length) cfg.dst = cfg.nodes.length - 1;
    renderForms(); edited(); return;
  }
  if (act === 'addLink') {
    const a = +$('#laA').value, b = +$('#laB').value, delay = numv($('#laD').value) || 10;
    if (a !== b && !cfg.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) {
      cfg.links.push({ a, b, delay });
      renderForms(); edited();
    }
    return;
  }
  if (act === 'delLink') {
    cfg.links.splice(+el.dataset.i, 1);
    renderForms(); edited(); return;
  }
  if (act === 'addVnf') {
    const maxLevel = Math.max(...cfg.vnfs.map((v) => v.level), 0);
    cfg.vnfs.push({ name: '?', level: maxLevel + 1, proc: 5, dem: 10 });
    renderForms(); edited(); return;
  }
  if (act === 'delVnf') {
    cfg.vnfs.splice(+el.dataset.i, 1);
    renderForms(); edited(); return;
  }

  // Run LOA
  if (act === 'run') {
    stopPlay();
    RUN   = runLOA(cfg);
    stale = false;
    S.cur = 0; S.hover = null; S.pin = null; S.bf = null; S.note = 0; S.tabLock = false;
    document.getElementById('setup').hidden = true;
    document.getElementById('demo').hidden  = false;
    document.getElementById('modeSetup').setAttribute('aria-current', 'false');
    document.getElementById('modeDemo').setAttribute('aria-current', 'true');
    document.getElementById('modeDemo').disabled = false;
    renderDemo();
    return;
  }

  // Mode toggle
  if (act === undefined && el.id === 'modeSetup') {
    stopPlay();
    document.getElementById('setup').hidden = false;
    document.getElementById('demo').hidden  = true;
    document.getElementById('modeSetup').setAttribute('aria-current', 'true');
    document.getElementById('modeDemo').setAttribute('aria-current', 'false');
    return;
  }
  if (act === undefined && el.id === 'modeDemo') {
    if (!RUN) return;
    document.getElementById('setup').hidden = true;
    document.getElementById('demo').hidden  = false;
    document.getElementById('modeSetup').setAttribute('aria-current', 'false');
    document.getElementById('modeDemo').setAttribute('aria-current', 'true');
    renderDemo();
    return;
  }

  if (!RUN) return;

  // Walkthrough navigation
  if (act === 'next')      { next(); return; }
  if (act === 'back')      { back(); return; }
  if (act === 'nextEvent') { nextEvent(); return; }
  if (act === 'play')      { togglePlay(); return; }
  if (act === 'restart')   { stopPlay(); go(0, 0); return; }
  if (act === 'jump')      { stopPlay(); go(+el.dataset.i, 0); return; }

  // Detail level
  if (act === 'detail') {
    const v = el.dataset.v;
    S.detail = v;
    document.querySelectorAll('[data-act="detail"]').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.v === v));
    return;
  }

  // Tab switch
  if (act === 'tab') {
    S.tab = el.dataset.v; S.tabLock = true;
    document.querySelectorAll('[data-act="tab"]').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.v === S.tab));
    renderVis();
    return;
  }

  // Brute force check
  if (act === 'brute') { runBrute(); return; }

  // Execution mode toggle
  if (act === 'mode') {
    const v = el.dataset.v;
    setExecMode(v);
    syncModeUI(v);
    if (RUN) stale = true;
    refreshSetup();
    return;
  }
});

// ─── Input & Change Delegation (Live updates for topology & params) ───
function handleSetupInput(e) {
  const el = e.target;
  const bind = el.dataset.bind;

  // Endpoint selectors
  if (el.id === 'selSrc') { cfg.src = +el.value; edited(); return; }
  if (el.id === 'selDst') { cfg.dst = +el.value; edited(); return; }

  // Speed selector
  if (el.id === 'speed') {
    if (S.playing) {
      clearInterval(S.timer);
      S.timer = setInterval(() => { if (S.cur >= RUN.steps.length - 1) stopPlay(); else next(); }, +el.value);
    }
    return;
  }

  // Generic data-bind (link delays, node capacities, VNFs, etc.)
  if (bind) {
    setBind(bind, numv(el.value));
    edited();
  }
}

document.addEventListener('input', handleSetupInput);
document.addEventListener('change', handleSetupInput);

// ─── Link & Node Interactive Highlighting ─────────────────────
(function attachSetupHover() {
  function setHlLink(linkIdx, on) {
    if (linkIdx == null) return;
    document.querySelectorAll(`[data-link-i="${linkIdx}"]`).forEach((el) => {
      el.classList.toggle('hl-link', on);
    });
  }

  document.addEventListener('pointerover', (e) => {
    const lk = e.target.closest('[data-link-i]');
    if (lk) setHlLink(lk.dataset.linkI, true);
  });

  document.addEventListener('pointerout', (e) => {
    const lk = e.target.closest('[data-link-i]');
    if (lk) setHlLink(lk.dataset.linkI, false);
  });

  document.addEventListener('focusin', (e) => {
    const row = e.target.closest('.r.rl[data-link-i]');
    if (row) setHlLink(row.dataset.linkI, true);
  });

  document.addEventListener('focusout', (e) => {
    const row = e.target.closest('.r.rl[data-link-i]');
    if (row) setHlLink(row.dataset.linkI, false);
  });

  // Clicking a link label/line in the SVG editor focuses its delay input
  document.addEventListener('click', (e) => {
    const svgLk = e.target.closest('#netEdit [data-link-i]');
    if (svgLk) {
      const idx = svgLk.dataset.linkI;
      const inp = document.querySelector(`input[data-bind="links.${idx}.delay"]`);
      if (inp) { inp.focus(); inp.select(); }
    }
  });
})();
