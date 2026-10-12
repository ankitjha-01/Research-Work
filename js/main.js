/* =============================================================
   LOA Walkthrough — Global State, Navigation & Entry Point
   Provides globals: cfg, presetIdx, RUN, stale, S,
                     go, next, back, nextEvent,
                     stopPlay, togglePlay,
                     bfHTML, runBrute
   ============================================================= */

// ─── Global State ─────────────────────────────────────────────

/** Current user-editable configuration. Initialised from the first preset. */
let cfg       = clone(PRESETS[0].cfg);
let presetIdx = 0;   // index of the active preset (-1 = custom)
let RUN       = null; // result of runLOA(); null until first run
let stale     = false; // cfg changed after last run

/**
 * Walkthrough UI state.
 *  cur      – current step index
 *  detail   – 'key' | 'all'
 *  playing  – autoplay active
 *  timer    – setInterval handle
 *  tab      – active visualisation tab
 *  tabLock  – user manually picked a tab (don't auto-switch)
 *  hover    – path id under pointer (null = none)
 *  pin      – path id pinned by click (null = none)
 *  bf       – brute-force result (null = not run yet)
 *  note     – number of skipped steps to show in skipnote
 */
const S = {
  cur: 0, detail: 'key', playing: false, timer: null,
  tab: 'dpg', tabLock: false,
  hover: null, pin: null, bf: null, note: 0,
};


// ─── Navigation ───────────────────────────────────────────────

/** Return true if step j should be shown given the current detail level. */
const okStep = (j) => S.detail === 'all' || RUN.steps[j].imp === 0;

/**
 * Jump to step i, counting skipped (imp === 1) steps for the skipnote.
 * dir: +1 forward, -1 backward, 0 direct jump.
 */
function go(i, dir) {
  const n = RUN.steps.length;
  i = clamp(i, 0, n - 1);
  let skipped = 0;
  if (S.detail === 'key' && dir) {
    const a = Math.min(S.cur, i), b = Math.max(S.cur, i);
    for (let j = a + 1; j < b; j++) if (RUN.steps[j].imp === 1) skipped++;
  }
  S.note = dir > 0 ? skipped : 0;
  S.cur  = i;
  S.hover = null;
  renderDemo();
}

/** Advance to the next visible step. */
function next() {
  for (let j = S.cur + 1; j < RUN.steps.length; j++)
    if (okStep(j)) return go(j, 1);
  stopPlay();
}

/** Go back to the previous visible step. */
function back() {
  for (let j = S.cur - 1; j >= 0; j--)
    if (okStep(j)) return go(j, -1);
}

/** Jump to the next step that carries an event tag. */
function nextEvent() {
  for (let j = S.cur + 1; j < RUN.steps.length; j++)
    if (RUN.steps[j].event) return go(j, 1);
  go(RUN.steps.length - 1, 1);
}

/** Stop autoplay. */
function stopPlay() {
  S.playing = false;
  clearInterval(S.timer);
  S.timer = null;
  if (RUN) document.getElementById('playBtn').textContent = 'Play';
}

/** Toggle autoplay; restart from the beginning if already at the last step. */
function togglePlay() {
  if (S.playing) return stopPlay();
  if (S.cur >= RUN.steps.length - 1) go(0, 0);
  S.playing = true;
  document.getElementById('playBtn').textContent = 'Pause';
  S.timer = setInterval(() => {
    if (S.cur >= RUN.steps.length - 1) stopPlay(); else next();
  }, +document.getElementById('speed').value);
}


// ─── Brute-Force Check ────────────────────────────────────────

/** Render the brute-force result HTML. */
function bfHTML() {
  if (!S.bf) return '';
  const r = S.bf;
  if (r.skip)
    return `<p class="muted">Brute force would need ${r.size.toLocaleString()} scheme evaluations: too many for the browser.</p>`;
  const conf = RUN.steps.some((s) => s.phase === 'stable' && Object.keys(s.confl).length);
  if (Math.abs(r.lat - RUN.best) < 1e-9)
    return `<p>✓ Trying all ${r.count.toLocaleString()} host assignments × arrangements gives the same optimum, <b>${fmt(r.lat)} ms</b> (${r.ms} ms of compute).</p>`;
  return `<p><b class="err">Brute force finds ${fmt(r.lat)} ms</b>, better than LOA's ${fmt(RUN.best)} ms. ${conf ? 'The stability filter removed paths in this run, so Lemma 4.4 does not guarantee optimality here.' : 'Unexpected: the stability filter removed nothing, please report this setup.'}</p>`;
}

/** Run the brute-force check and update the narrator panel. */
function runBrute() {
  const M    = RUN.M;
  const size = bruteForceSize(M);
  if (size > 500000) {
    S.bf = { skip: true, size };
  } else {
    const t0 = performance.now();
    const r  = bruteForce(M);
    S.bf = { skip: false, lat: r.best ? r.best.lat : Infinity, count: r.count, ms: Math.round(performance.now() - t0) };
  }
  // Patch only the #bf div inside the narrator without a full re-render
  const bfDiv = document.getElementById('bf');
  if (bfDiv) bfDiv.innerHTML = bfHTML();
}


// ─── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Initialise execution mode from the first preset
  const initMode = (PRESETS[0].mode) || 'all-combos';
  setExecMode(initMode);

  renderPresets();
  renderForms();
  syncModeUI(initMode);  // sync buttons after DOM is ready

  // Mode toggle buttons (not handled by data-act delegation)
  document.getElementById('modeSetup').addEventListener('click', () => {
    stopPlay();
    document.getElementById('setup').hidden = false;
    document.getElementById('demo').hidden  = true;
    document.getElementById('modeSetup').setAttribute('aria-current', 'true');
    document.getElementById('modeDemo').setAttribute('aria-current', 'false');
  });

  document.getElementById('modeDemo').addEventListener('click', () => {
    if (!RUN) return;
    document.getElementById('setup').hidden = true;
    document.getElementById('demo').hidden  = false;
    document.getElementById('modeSetup').setAttribute('aria-current', 'false');
    document.getElementById('modeDemo').setAttribute('aria-current', 'true');
    renderDemo();
  });
});
