/* =============================================================
   LOA Walkthrough — SVG / HTML Renderers
   Reads globals: RUN, S, cfg  (set by main.js)
   Provides: netSVG, routeLines, badges,
             rulerSVG,
             dpgSVG,
             routeView, schemeView, schemeDiagram, lmCard,
             tableHTML, tableTitle, focusRow,
             A3, A2, pseudo,
             renderDemo, renderRuler, renderVis
   ============================================================= */

// ─── Pseudocode Line Definitions ─────────────────────────────
// Each entry: [lineNumber, indentLevel, HTML label, optionalAlternateLabel]
const A3 = [
  [2,  0, 'c<sub>d</sub>(LM-PDS) ← +∞'],
  [3,  0, 'DPG<sub>dw</sub> ← Algorithm 1'],
  [4,  0, 'k ← |V| + 1, flag ← false'],
  [5,  0, '<b>while</b> flag = false <b>do</b>'],
  [6,  1, 'P<sub>k</sub> ← k cheapest paths of DPG<sub>dw</sub>'],
  [7,  1, 'P<sub>feas</sub> ← paths of P<sub>k</sub> that fit r<sub>u</sub>'],
  [8,  1, 'drop the costlier path of each order-conflicting pair', '8–18'],
  [19, 1, 'P<sub>stab</sub> ← P<sub>feas</sub>'],
  [20, 1, '<b>if</b> ∪F(p) ⊉ F<sub>u</sub> <b>then</b>'],
  [21, 2, 'k ← 2k'],
  [22, 2, '<b>continue</b>'],
  [23, 1, '<b>end if</b>'],
  [24, 1, 'Algorithm 2 (P<sub>stab</sub>) updates LM-PDS'],
  [25, 1, '<b>if</b> flag = false <b>then</b>'],
  [26, 2, 'k ← 2k'],
  [27, 1, '<b>end if</b>'],
  [28, 0, '<b>end while</b>'],
  [29, 0, '<b>return</b> LM-PDS'],
];

const A2 = [
  [1,  0, 'A* ← smallest prefix of P covering F<sub>u</sub>'],
  [2,  0, 'c<sup>max</sup>(A*) ← largest cost in A*'],
  [3,  0, '<b>if</b> c<sup>max</sup>(A*) &gt; c<sub>d</sub>(LM-PDS) <b>then</b>'],
  [4,  1, '<b>return</b> LM-PDS'],
  [5,  0, '<b>end if</b>'],
  [6,  0, 'A<sup>(0)</sup> ← A*'],
  [7,  0, 't ← 0'],
  [8,  0, '<b>while</b> A<sup>(t)</sup> ⊂ P <b>do</b> †'],
  [9,  1, 'p<sup>(t)</sup> ← costliest path of A<sup>(t)</sup> (anchor)'],
  [10, 1, 'build S<sub>parallel</sub>:'],
  [11, 2, 'keep the anchor\u2019s structure for F(p<sup>(t)</sup>)'],
  [12, 2, 'try every arrangement for the rest'],
  [13, 1, '<b>for</b> each S in S<sub>parallel</sub> <b>do</b>'],
  [14, 2, '<b>if</b> c<sub>d</sub>(S) &lt; c<sub>d</sub>(LM-PDS) <b>then</b>'],
  [15, 3, 'LM-PDS ← S'],
  [16, 2, '<b>end if</b>'],
  [17, 1, '<b>end for</b>'],
  [18, 1, 'p<sup>new</sup> ← cheapest path of P \\ A<sup>(t)</sup>'],
  [19, 1, '<b>if</b> c<sub>d</sub>(p<sup>new</sup>) &gt; c<sub>d</sub>(LM-PDS) <b>then</b>'],
  [20, 2, 'flag ← true †'],
  [21, 2, '<b>return</b> LM-PDS'],
  [22, 1, '<b>end if</b>'],
  [23, 1, 'A<sup>(t+1)</sup> ← A<sup>(t)</sup> ∪ {p<sup>new</sup>}'],
  [24, 1, 't ← t + 1'],
  [25, 0, '<b>end while</b>'],
  [26, 0, '<b>return</b> LM-PDS'],
];

/** Render pseudocode lines, highlighting the active set. */
function pseudo(lines, hl) {
  const set = new Set(hl);
  return lines
    .map(([n, ind, t, lab]) =>
      `<div class="pl2${set.has(n) ? ' on' : ''}"><span class="ln">${lab || n}</span><span class="tx" style="padding-left:${ind * 1.4}em">${t}</span></div>`)
    .join('');
}


// ─── Network SVG ─────────────────────────────────────────────

/**
 * Render the MEC network as an SVG fragment.
 * @param {object} c     Config object (nodes, links, src, dst)
 * @param {object} [o]   Options: { under, over, use, edit }
 */
function netSVG(c, o = {}) {
  const { under = '', over = '', use = null } = o;

  const links = c.links.map((l) => {
    const a = c.nodes[l.a], b = c.nodes[l.b];
    return `<line class="lk" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join('');

  const labels = c.links.map((l) => {
    const a = c.nodes[l.a], b = c.nodes[l.b];
    return `<text class="lkl" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 + 4}">${l.delay}</text>`;
  }).join('');

  const nodes = c.nodes.map((n, i) => {
    const u    = use ? use[i] : 0;
    const bad  = use && u > n.cap + 1e-9;
    const role = i === c.src && i === c.dst ? 'ingress and egress'
               : i === c.src ? 'ingress'
               : i === c.dst ? 'egress'
               : '';
    return `<g class="nd${bad ? ' over' : ''}" data-i="${i}" transform="translate(${n.x} ${n.y})">` +
      `<circle r="19"/>` +
      `<text class="nn">${n.name}</text>` +
      (use
        ? `<text class="use${bad ? ' bad' : ''}" y="35">${u}/${n.cap}</text>`
        : `<text class="cp" y="35">C ${n.cap}</text>`) +
      (role ? `<text class="role" y="47">${role}</text>` : '') +
      `</g>`;
  }).join('');

  return `${links}${under}${labels}${nodes}${over}`;
}

/** SVG lines for the shortest path between consecutive hosts. */
function routeLines(M, hosts, cls) {
  let s = '';
  for (let i = 0; i + 1 < hosts.length; i++) {
    const r = route(M, hosts[i], hosts[i + 1]);
    for (let j = 0; j + 1 < r.length; j++) {
      const a = M.nodes[r[j]], b = M.nodes[r[j + 1]];
      s += `<line class="rt ${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }
  }
  return s;
}

/** Floating VNF-name badges above nodes. */
function badges(M, byHost, cls) {
  let s = '';
  byHost.forEach((names, h) => {
    const n = M.nodes[h];
    names.forEach((nm, i) => {
      const w = nm.length * 7 + 14;
      s += `<g class="bdg ${cls}" transform="translate(${n.x} ${n.y - 32 - i * 18})">` +
           `<rect x="${-w / 2}" y="-8" width="${w}" height="16" rx="8"/><text>${nm}</text></g>`;
    });
  });
  return s;
}


// ─── Step State Helpers ───────────────────────────────────────

function mkCtx(step) {
  return { As: new Set(step.A || []), Ast: new Set(step.astar || []) };
}

/**
 * Derive display state (class, tag, tooltip, faded, rejected) for a path
 * at the current walkthrough step.
 */
function stOf(step, p, ctx) {
  const id = p.id;
  let cls = 'raw', tag = '', tip = '';
  const inf = step.infeas[id], cf = step.confl[id];
  if (step.showFeas && inf)  { cls = 'infeas'; tag = inf.kind === 'cap' ? '✗ capacity' : '✗ T max'; tip = inf.reason; }
  else if (step.showStab && cf) { cls = 'confl'; tag = `✗ order vs #${cf.by}`; tip = `${RUN.M.V[cf.a].name} before ${RUN.M.V[cf.b].name} here, opposite in cheaper #${cf.by}`; }
  else if (step.showStab) { cls = 'stable'; tag = '✓'; }
  else if (step.showFeas)  { cls = 'feas';   tag = '✓'; }
  if (ctx.As.has(id))     { cls = 'inA';    tag = 'in A'; }
  if (ctx.Ast.has(id))    { cls = 'astar';  tag = 'A*'; }
  if (step.anchor === id) { cls = 'anchor'; tag = 'anchor'; }
  if (step.pnew   === id) { cls = 'pnew';   tag = 'next'; }
  const om  = step.best < Infinity && p.cost > step.best + 1e-9;
  return { cls, tag, tip, om, rej: cls === 'infeas' || cls === 'confl' };
}

const effHover = () => (S.hover != null ? S.hover : S.pin);

function focusId(step) {
  const h = effHover();
  if (h != null && h <= step.rawN) return h;
  if (step.anchor) return step.anchor;
  if (step.pnew)   return step.pnew;
  if (step.astar && step.astar.length) return step.astar[step.astar.length - 1];
  return step.rawN ? 1 : null;
}


// ─── Cost Ruler ───────────────────────────────────────────────
function rulerSVG(step) {
  const n = step.rawN;
  if (!n) return `<p class="muted" style="margin:6px 0">The window is filled in the next step.</p>`;

  const ps  = RUN.PATHS.slice(0, n);
  const ctx = mkCtx(step);
  let lo = Math.min(...ps.map((p) => p.cost));
  let hi = Math.max(...ps.map((p) => p.cost));
  if (isFinite(step.best)) hi = Math.max(hi, step.best);
  if (step.lb != null) { lo = Math.min(lo, step.lb); hi = Math.max(hi, step.lb); }
  lo = Math.floor(lo - 2); hi = Math.ceil(hi + 2);

  const X0 = 26, X1 = 694;
  const sx  = (c) => X0 + (c - lo) / (hi - lo) * (X1 - X0);
  const items = ps.map((p) => ({ p, s: stOf(step, p, ctx) }))
    .sort((a, b) => (a.s.rej - b.s.rej) || (a.p.id - b.p.id));
  const bucket = new Map(); let maxRow = 0;
  items.forEach((it) => {
    const key = Math.round(it.p.cost * 2);
    const idx = bucket.get(key) || 0;
    bucket.set(key, idx + 1);
    it.idx   = idx;
    maxRow   = Math.max(maxRow, Math.min(idx, 11));
  });

  const H  = 62 + (maxRow + 1) * 11 + 44, ay = H - 40;
  const span = hi - lo;
  const st = [1, 2, 5, 10, 20, 50].find((s) => span / s <= 11) || 100;
  let ticks = '';
  for (let t = Math.ceil(lo / st) * st; t <= hi; t += st)
    ticks += `<line class="tk" x1="${sx(t)}" y1="${ay}" x2="${sx(t)}" y2="${ay + 5}"/>` +
             `<text class="tkl" x="${sx(t)}" y="${ay + 17}">${t}</text>`;

  // Pruned region Ω₂
  let om = '';
  if (isFinite(step.best)) {
    const bx = sx(step.best);
    om = `<rect x="${bx}" y="22" width="${Math.max(0, X1 + 8 - bx)}" height="${ay - 22}" fill="url(#hatch)"/>` +
         (X1 - bx > 70 ? `<text class="lab om" x="${(bx + X1) / 2}" y="${ay - 6}">Ω₂ can be pruned</text>` : '');
  }

  const hasB = isFinite(step.best), hasL = step.lb != null;
  const bx   = hasB ? sx(step.best) : 0, lx = hasL ? sx(step.lb) : 0;
  let lines = '';
  if (hasL) lines += `<line class="rl-lb" x1="${lx}" y1="26" x2="${lx}" y2="${ay}"/>` +
    `<text class="lab lb" x="${hasB ? (lx <= bx ? lx - 5 : lx + 5) : lx}" y="14" style="text-anchor:${hasB ? (lx <= bx ? 'end' : 'start') : 'middle'}">lower bound ${fmt(step.lb)}</text>`;
  if (hasB) lines += `<line class="rl-best" x1="${bx}" y1="26" x2="${bx}" y2="${ay}"/>` +
    `<text class="lab best" x="${hasL ? (lx <= bx ? bx + 5 : bx - 5) : bx}" y="14" style="text-anchor:${hasL ? (lx <= bx ? 'start' : 'end') : 'middle'}">best ${fmt(step.best)} ms</text>`;
  const wx = Math.max(X0 + 40, Math.min(X1 - 40, sx(ps[n - 1].cost)));
  lines += `<line class="rl-win" x1="${sx(ps[n - 1].cost)}" y1="26" x2="${sx(ps[n - 1].cost)}" y2="${ay}"/>` +
           `<text class="lab win" x="${wx}" y="${ay + 33}">window edge (path #${n})</text>`;

  const hv   = effHover();
  const dots = items.map((it) => {
    const col = Math.floor(it.idx / 12), row = it.idx % 12;
    const off = col ? (col % 2 ? 1 : -1) * Math.ceil(col / 2) * 9 : 0;
    const cx  = sx(it.p.cost) + off, cy = ay - 12 - row * 11;
    let s = `<circle class="dot ${it.s.cls}${it.s.om ? ' om' : ''}${hv === it.p.id ? ' hover' : ''}" cx="${cx}" cy="${cy}" r="${hv === it.p.id ? 6 : 4.6}" data-id="${it.p.id}"><title>#${it.p.id}  ${fmt(it.p.cost)} ms</title></circle>`;
    if (it.s.cls === 'anchor' || it.s.cls === 'pnew')
      s += `<text class="lab id" x="${cx}" y="${cy - 9}" fill="${it.s.cls === 'anchor' ? 'var(--anchor)' : 'var(--pnew)'}">#${it.p.id}</text>`;
    return s;
  }).join('');

  return `<svg viewBox="0 0 720 ${H}" role="img" aria-label="Cost ruler">` +
    `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="7" height="7" fill="var(--omega-soft)"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--omega)" stroke-opacity=".45" stroke-width="1.5"/></pattern></defs>` +
    `${om}<line class="ax" x1="${X0}" y1="${ay}" x2="${X1}" y2="${ay}"/>` +
    `${ticks}${lines}${dots}` +
    `<text class="tkl" x="${X1 + 2}" y="${ay + 33}" style="text-anchor:end">ms</text></svg>`;
}


// ─── DPG View ─────────────────────────────────────────────────
function dpgSVG(step) {
  const M = RUN.M, n = M.n, ctx = mkCtx(step);
  const colX = {}; let x = 122; const bands = [];

  M.layers.forEach((layer, li) => {
    const x0 = x;
    layer.forEach((f, qi) => { colX[f] = x; if (qi < layer.length - 1) x += 68; });
    bands.push({ li, x0: x0 - 32, x1: x + 32 });
    x += 112;
  });

  const duX = x - 112 + 104, W = duX + 44;
  const rowGap = 36, top = 78, H = top + (n - 1) * rowGap + 40;
  const ry  = (h) => top + h * rowGap;
  const mid = (top + ry(n - 1)) / 2;
  const hv  = effHover();

  const shown = RUN.PATHS.slice(0, Math.min(step.rawN, 90));
  if (hv != null && hv <= step.rawN && !shown.some((p) => p.id === hv)) shown.push(RUN.PATHS[hv - 1]);

  const prio = { raw: 0, feas: 1, stable: 1, infeas: 0, confl: 2, inA: 3, astar: 4, anchor: 6, pnew: 6 };
  const arr  = shown.map((p) => ({ p, s: stOf(step, p, ctx) }))
    .sort((a, b) => (prio[a.s.cls] - prio[b.s.cls]) || (b.p.id - a.p.id));

  const fid  = focusId(step);
  const fp   = fid ? RUN.PATHS[fid - 1] : null;
  const on   = new Set(fp ? fp.seq.map((s) => s.f + ':' + s.h) : []);
  const fcol = fp
    ? (step.anchor === fid && hv == null ? 'var(--anchor)'
     : step.pnew   === fid && hv == null ? 'var(--pnew)'
     : hv != null ? 'var(--brand)' : 'var(--ink)')
    : '';

  let bandS = '', heads = '', circ = '';

  bands.forEach((b) => {
    bandS += `<rect class="band" x="${b.x0}" y="18" width="${b.x1 - b.x0}" height="${H - 26}" rx="8"/>` +
             `<text class="bandl" x="${b.x0 + 8}" y="34">L${b.li + 1}${M.layers[b.li].length > 1 ? ' (any order)' : ''}</text>`;
  });

  M.V.forEach((v) => {
    heads += `<text class="ph1" x="${colX[v.idx]}" y="${top - 30}">${v.name}</text>` +
             `<text class="ph2" x="${colX[v.idx]}" y="${top - 17}">${fmt(v.proc)} ms</text>`;
    for (let h = 0; h < n; h++) {
      const isOn = on.has(v.idx + ':' + h);
      circ += `<g class="rep${isOn ? ' on' : ''}">` +
              `<circle cx="${colX[v.idx]}" cy="${ry(h)}" r="11" ${isOn ? `style="stroke:${fcol}"` : ''}/>` +
              `<text x="${colX[v.idx]}" y="${ry(h)}">${M.nodes[h].name}</text></g>`;
    }
  });

  const lines = arr.map(({ p, s }) => {
    const pts = [[38, mid], ...p.seq.map((q) => [colX[q.f], ry(q.h)]), [duX, mid]]
      .map((q) => q.join(',')).join(' ');
    const cls = hv === p.id ? 'hover' : s.cls;
    return `<polyline class="pl ${cls}${s.om && cls !== 'hover' && cls !== 'anchor' ? ' om' : ''}" points="${pts}"/>`;
  }).join('');

  const ep = `<g class="ep"><rect x="8" y="${mid - 13}" width="60" height="26"/><text x="38" y="${mid}">in @ ${M.nodes[M.src].name}</text></g>` +
             `<g class="ep"><rect x="${duX - 30}" y="${mid - 13}" width="66" height="26"/><text x="${duX + 3}" y="${mid}">out @ ${M.nodes[M.dst].name}</text></g>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dependency-deployment graph with paths">${bandS}${heads}${circ}${lines}${ep}</svg>`;
}


// ─── Network Views ────────────────────────────────────────────

/** Show path route on the network. */
function routeView(step) {
  const M   = RUN.M, fid = focusId(step);
  if (!fid) return { svg: `<svg viewBox="0 0 600 340">${netSVG(cfg)}</svg>`, cap: 'No path yet.' };
  const p   = RUN.PATHS[fid - 1], hv = effHover();
  const cls = hv != null ? 'hv' : step.anchor === fid ? 'hl' : 'hv';
  const hosts = [M.src, ...p.seq.map((s) => s.h), M.dst];
  const by  = new Map(); const use = new Array(M.n).fill(0);
  p.seq.forEach((s) => {
    if (!by.has(s.h)) by.set(s.h, []);
    by.get(s.h).push(M.V[s.f].name);
    use[s.h] += M.V[s.f].dem;
  });
  return {
    svg: `<svg viewBox="0 0 600 340">${netSVG(cfg, { under: routeLines(M, hosts, cls), over: badges(M, by, cls), use })}</svg>`,
    cap: `Path #${fid}: ${pstr(M, p)}, cost ${fmt(p.cost)} ms. Numbers under a node are used / capacity of the VNFs this path puts there. Hover a row to change the path.`,
  };
}

/** Show the best scheme on the network. */
function schemeView(LM) {
  const M   = RUN.M;
  const by  = new Map(); const use = new Array(M.n).fill(0);
  M.V.forEach((v) => {
    const h = LM.hosts[v.idx];
    if (!by.has(h)) by.set(h, []);
    by.get(h).push(v.name);
    use[h] += v.dem;
  });
  let under = ''; const stages = LM.stages; let prev = [M.src];
  stages.forEach((st) => {
    const cur = st.map((f) => LM.hosts[f]);
    prev.forEach((a) => cur.forEach((b) => { under += routeLines(M, [a, b], 'sch'); }));
    prev = cur;
  });
  prev.forEach((a) => { under += routeLines(M, [a, M.dst], 'sch'); });
  const ch = [M.src, ...LM.chain.map((f) => LM.hosts[f]), M.dst];
  under += routeLines(M, ch, 'crit');
  return {
    svg: `<svg viewBox="0 0 600 340">${netSVG(cfg, { under, over: badges(M, by, 'sch'), use })}</svg>`,
    cap: `Best scheme so far: ${schemeStr(M, LM.hosts, LM.stages)}. The thick green line is the critical chain that sets the latency.`,
  };
}

/** Execution-structure diagram (boxes and arrows). */
function schemeDiagram(LM) {
  const M  = RUN.M, st = LM.stages, T = st.length;
  const colW = 96, bw = 76, bh = 38, gap = 10;
  const maxN = Math.max(...st.map((s) => s.length));
  const H  = maxN * (bh + gap) + 10, W = (T + 2) * colW;
  const xc = (j) => colW * (j + 0.5);
  const yc = (i, len) => H / 2 + (i - (len - 1) / 2) * (bh + gap);
  const cr = new Set(LM.chain);

  const cols = [[{ x: xc(0), y: H / 2, f: -1 }]];
  st.forEach((s, j) => cols.push(s.map((f, i) => ({ x: xc(j + 1), y: yc(i, s.length), f }))));
  cols.push([{ x: xc(T + 1), y: H / 2, f: -2 }]);

  const critEdge = (a, b) => {
    const ch = LM.chain;
    if (a.f === -1) return b.f === ch[0];
    if (b.f === -2) return a.f === ch[ch.length - 1];
    const i = ch.indexOf(a.f); return i >= 0 && ch[i + 1] === b.f;
  };

  let ed = '', edc = '';
  for (let j = 0; j + 1 < cols.length; j++)
    cols[j].forEach((a) => cols[j + 1].forEach((b) => {
      const x1  = a.x + (a.f >= 0 ? bw / 2 : 12);
      const x2  = b.x - (b.f >= 0 ? bw / 2 : 12);
      const xm  = (x1 + x2) / 2;
      const d   = `M${x1} ${a.y} C${xm} ${a.y} ${xm} ${b.y} ${x2} ${b.y}`;
      if (critEdge(a, b)) edc += `<path class="ed cr" d="${d}"/>`;
      else                 ed  += `<path class="ed" d="${d}"/>`;
    }));

  let bx = '';
  st.forEach((s, j) => s.forEach((f, i) => {
    const c = cols[j + 1][i];
    bx += `<rect class="bx${cr.has(f) ? ' cr' : ''}" x="${c.x - bw / 2}" y="${c.y - bh / 2}" width="${bw}" height="${bh}" rx="7"/>` +
          `<text class="bt" x="${c.x}" y="${c.y - 3}">${M.V[f].name}</text>` +
          `<text class="bs" x="${c.x}" y="${c.y + 11}">${M.nodes[LM.hosts[f]].name} · ${fmt(M.V[f].proc)} ms</text>`;
  }));

  const ends = `<circle class="ep2" cx="${xc(0)}" cy="${H / 2}" r="12"/><text class="ept" x="${xc(0)}" y="${H / 2}">${M.nodes[M.src].name}</text>` +
               `<circle class="ep2" cx="${xc(T + 1)}" cy="${H / 2}" r="12"/><text class="ept" x="${xc(T + 1)}" y="${H / 2}">${M.nodes[M.dst].name}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Execution structure of the best scheme">${ed}${edc}${bx}${ends}</svg>`;
}

/** Render the LM-PDS card. */
function lmCard(step) {
  const M = RUN.M, LM = step.LM;
  if (!LM) return `<h2>Best scheme so far</h2><div class="big" style="color:var(--ink3)">∞<small>ms</small></div><p class="muted" style="margin-top:8px">No complete scheme yet. Algorithm 2 has not built one, so nothing can be pruned.</p>`;
  const b   = LM.br, tot = LM.lat;
  const seg = (v, c) => `<i class="${c}" style="width:${(v / tot * 100).toFixed(2)}%"></i>`;
  return `<h2>Best scheme so far <small>found in round ${LM.round}, anchor #${LM.anchorId}</small></h2>
    <div class="big">${fmt(tot)}<small>ms</small></div>
    <div class="sch">${schemeStr(M, LM.hosts, LM.stages)}</div>
    <div class="bar">${seg(b.trans, 's1')}${seg(b.proc, 's2')}${seg(b.rep, 's3')}${seg(b.int, 's4')}</div>
    <div class="bl"><span><i style="background:var(--brand)"></i>links ${fmt(b.trans)}</span><span><i style="background:var(--teal)"></i>processing ${fmt(b.proc)}</span><span><i style="background:var(--pnew)"></i>replication ${fmt(b.rep)}</span><span><i style="background:var(--conf)"></i>integration ${fmt(b.int)}</span></div>
    <div class="ex">${schemeDiagram(LM)}</div>`;
}


// ─── Path Table ───────────────────────────────────────────────

const hopS = (M, s) =>
  `<span class="hop"><b>${M.V[s.f].name}</b>@${M.nodes[s.h].name}</span>`;

function tableHTML(step) {
  const M = RUN.M, n = step.rawN;
  if (!n) return `<div class="tnote">Nothing to show yet.</div>`;
  const ctx = mkCtx(step), hv = effHover(), MAXR = 300;
  let rows = '';
  RUN.PATHS.slice(0, Math.min(n, MAXR)).forEach((p) => {
    const s    = stOf(step, p, ctx);
    const chip = s.tag
      ? `<span class="chip ${s.cls === 'feas' || s.cls === 'stable' ? 'ok' : s.cls}" ${s.tip ? `title="${s.tip}"` : ''}>${s.tag}</span>`
      : '';
    rows += `<tr class="${s.cls}${s.om ? ' om' : ''}${hv === p.id ? ' hv' : ''}" data-id="${p.id}">` +
            `<td class="id">#${p.id}</td>` +
            `<td>${p.seq.map((q) => hopS(M, q)).join('<i class="arr">→</i>')}</td>` +
            `<td class="pc">${fmt(p.cost)}</td>` +
            `<td>${chip}</td></tr>`;
  });
  return `<table class="pt"><thead><tr><th>#</th><th>path: VNF@node</th><th>ms</th><th></th></tr></thead><tbody>${rows}</tbody></table>` +
         (n > MAXR ? `<div class="tnote">…and ${n - MAXR} more</div>` : '');
}

function tableTitle(step) {
  if (!step.rawN) return 'Paths';
  let t = `Paths in the window <small>${step.rawN} cheapest`;
  if (step.showFeas) t += `, ${step.rawN - Object.keys(step.infeas).length} feasible`;
  if (step.showStab) t += `, ${step.stable.length} stable`;
  return t + '</small>';
}

/** Row to auto-scroll into view in the table. */
function focusRow(step) {
  if (step.anchor) return step.anchor;
  if (step.pnew)   return step.pnew;
  if (step.phase === 'feasible') { const k = Object.keys(step.infeas); if (k.length) return +k[0]; }
  if (step.phase === 'stable')   { const k = Object.keys(step.confl);  if (k.length) return +k[0]; }
  if (step.astar && step.astar.length) return step.astar[step.astar.length - 1];
  return null;
}


// ─── Main Render Entrypoints ──────────────────────────────────

const PHASE = {
  init:       'Algorithm 3, lines 2–4',
  kpaths:     'Algorithm 3, lines 5–6',
  feasible:   'Algorithm 3, line 7',
  stable:     'Algorithm 3, lines 8–19',
  coverage:   'Algorithm 3, lines 20–23',
  a2prefix:   'Algorithm 2, lines 1–5',
  a2resume:   'Algorithm 2, lines 6–8',
  a2iter:     'Algorithm 2, lines 8–17',
  a2extend:   'Algorithm 2, lines 18–24',
  a2prune:    'Algorithm 2, lines 18–21',
  a2exhaust:  'Algorithm 2, lines 25–26, then Algorithm 3, lines 25–27',
  done:       'Algorithm 3, line 29',
};
const EVT = { kdouble: 'k doubles', update: 'LM-PDS improved', stop: 'search stops', reject: 'no scheme' };
const stat = (l, v, cls = '') => `<div class="stat ${cls}"><span>${l}</span><b>${v}</b></div>`;

/** Full re-render of the walkthrough view for the current step. */
function renderDemo() {
  const steps = RUN.steps, step = steps[S.cur], M = RUN.M;

  // Transport controls
  document.getElementById('count').textContent = `${S.cur + 1} / ${steps.length}`;
  document.getElementById('playBtn').textContent = S.playing ? 'Pause' : 'Play';
  document.querySelector('[data-act="back"]').disabled    = S.cur === 0;
  document.querySelector('[data-act="next"]').disabled    = S.cur === steps.length - 1;
  document.querySelector('[data-act="nextEvent"]').disabled = S.cur === steps.length - 1;

  // Scrubber
  document.getElementById('scrub').innerHTML = steps.map((s, i) =>
    `<button class="${s.imp === 0 ? 'k' : ''} ${s.event ? 'e-' + s.event : ''} ${i === S.cur ? 'cur' : ''} ${i < S.cur ? 'done' : ''} ${i > 0 && s.round !== steps[i - 1].round ? 'rs' : ''}" data-act="jump" data-i="${i}" title="${plain(s.title).replace(/"/g, '')}" aria-label="Step ${i + 1}"></button>`
  ).join('');

  // Stats row
  let win = step.rawN ? `${step.rawN}` : '–';
  if (step.showFeas) win += ` → ${step.rawN - Object.keys(step.infeas).length}`;
  if (step.showStab) win += ` → ${step.stable.length}`;
  let s = stat('Round', step.round || '–') + stat('k', step.k) +
    stat(step.showStab ? 'Window: raw → feasible → stable' : step.showFeas ? 'Window: raw → feasible' : 'Window', win);
  if (step.cov)      s += stat('Coverage', step.cov.missing.length ? `<span class="bad">missing ${step.cov.missing.map((f) => M.V[f].name).join(', ')}</span>` : `all ${M.V.length} VNFs`);
  if (step.lb != null) s += stat('Lower bound c<sup>max</sup>(A*)', fmt(step.lb) + ' ms', 'lb');
  s += stat('Best latency', isFinite(step.best) ? fmt(step.best) + ' ms' : '∞', 'best');
  document.getElementById('stats').innerHTML = s;

  // Narrator
  const evk = step.event
    ? `<span class="tag ${step.event}">${step.event === 'kdouble' ? (step.kreason === 'coverage' ? 'k ← 2k: coverage failed' : 'k ← 2k: window exhausted') : EVT[step.event]}</span>`
    : '';
  let extra = '';
  if (step.phase === 'a2iter' && step.cand) {
    const c = step.cand;
    extra = `<div class="cand">` +
      `<div class="c"><span>Schemes built</span><b>${c.evaluated.toLocaleString()}</b></div>` +
      `<div class="c"><span>Feasible</span><b>${c.feasible.toLocaleString()}</b></div>` +
      `<div class="c"><span>Best of this anchor</span><b>${c.best ? fmt(c.best.lat) + ' ms' : 'none'}</b></div>` +
      (c.best ? `<div class="c wide"><span>Its scheme</span><b>${schemeStr(M, c.best.hosts, c.best.stages)}</b></div>` : '') +
      `</div>`;
  }
  if (step.phase === 'done' && step.LM)
    extra = `<div class="bf"><button class="btn sm" data-act="brute">Check against brute force</button><div id="bf">${bfHTML()}</div></div>`;

  const narr = document.getElementById('narr');
  narr.className = `panel narr ${step.alg}`;
  narr.innerHTML =
    `${S.note ? `<div class="skipnote">${S.note} intermediate step${S.note > 1 ? 's' : ''} skipped. Switch to "Every iteration" to see them.</div>` : ''}` +
    `<div class="ph"><span class="pill">${PHASE[step.phase]}</span>${evk}</div>` +
    `<h3>${step.title}</h3>` +
    `<div class="body">${step.body}</div>` +
    `${extra}` +
    `<div class="watch"><b>Look at:</b> ${step.watch}</div>`;

  renderRuler();

  document.getElementById('legend').innerHTML =
    `<span><i class="l-raw"></i>in window</span>` +
    `<span><i class="l-ok"></i>kept</span>` +
    `<span><i class="l-rej"></i>infeasible</span>` +
    `<span><i class="l-conf"></i>order conflict</span>` +
    `<span><i class="l-astar"></i>A*</span>` +
    `<span><i class="l-A"></i>in A<sup>(t)</sup></span>` +
    `<span><i class="l-anchor"></i>anchor</span>` +
    `<span><i class="l-pnew"></i>next path</span>`;

  // Tabs: auto-switch to scheme when LM-PDS is updated or at done step
  if (!S.tabLock)
    S.tab = (step.phase === 'done' || (step.phase === 'a2iter' && step.event === 'update')) && step.LM ? 'scheme' : 'dpg';
  if (S.tab === 'scheme' && !step.LM) S.tab = 'dpg';
  renderVis();

  document.getElementById('tblTitle').innerHTML = tableTitle(step);
  document.getElementById('tbl').innerHTML = tableHTML(step);
  const fr = focusRow(step), tb = document.getElementById('tbl');
  if (fr) {
    const tr = tb.querySelector(`tr[data-id="${fr}"]`);
    if (tr) tb.scrollTop = Math.max(0, tr.offsetTop - tb.clientHeight / 2 + 20);
  } else tb.scrollTop = 0;

  const lm = document.getElementById('lm');
  lm.innerHTML = lmCard(step);
  lm.classList.remove('flash');
  if (step.event === 'update') { void lm.offsetWidth; lm.classList.add('flash'); }

  document.getElementById('pA3').innerHTML = pseudo(A3, step.hl.A3);
  document.getElementById('pA2').innerHTML = pseudo(A2, step.hl.A2);
}

function renderRuler() {
  document.getElementById('ruler').innerHTML = rulerSVG(RUN.steps[S.cur]);
}

function renderVis() {
  const step = RUN.steps[S.cur];
  document.getElementById('tabs').innerHTML = [['dpg', 'DPG paths'], ['route', 'Network route'], ['scheme', 'Best scheme']]
    .map(([k, l]) => `<button data-act="tab" data-v="${k}" aria-pressed="${S.tab === k}" ${k === 'scheme' && !step.LM ? 'disabled' : ''}>${l}</button>`)
    .join('');
  let h;
  if (S.tab === 'dpg') {
    h = dpgSVG(step) +
      `<div class="cap">Each column is one partition (one VNF), each circle a MEC node replica. A path is a line through one replica of every partition it visits; the highlighted circles belong to the emphasised path. Hover a table row or ruler dot to inspect a path.</div>`;
  } else if (S.tab === 'route') {
    const r = routeView(step);
    h = r.svg + `<div class="cap">${r.cap}</div>`;
  } else {
    const r = schemeView(step.LM);
    h = r.svg + `<div class="cap">${r.cap}</div>`;
  }
  document.getElementById('vis').innerHTML = h;
}
