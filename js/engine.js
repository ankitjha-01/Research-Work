/* =============================================================
   LOA Walkthrough — Algorithm Engine
   Pure functions. No DOM access. Produces a step-by-step trace.

   Globals provided: EPS, K_MAX, CAND_CAP, fmt,
     buildModel, orderedPartitions, route, countPaths,
     MinHeap, kShortest,
     pathFeasible, orderPairs, stabilityFilter, covers,
     evalScheme, flat, structOK, evaluateAnchor,
     bruteForceSize, bruteForce,
     vn, pstr, structStr, schemeStr,
     runLOA
   ============================================================= */

// ─── Constants ────────────────────────────────────────────────
const EPS               = 1e-9;
const K_MAX             = 2048;    // demo safety cap on k
const CAND_CAP          = 30000;   // demo safety cap on candidate schemes per anchor
const COMBO_DISPLAY_CAP = 40;      // max per-combination rows stored for the UI

/**
 * Execution mode:
 *  'paper-strict'  → Paper 1 (TON 2026): partial groups keep anchor fixed,
 *                    remaining VNFs inserted only in parallel (3 combos for a
 *                    3-VNF layer where 1 is anchored).
 *  'all-combos'    → Paper 2 (TWC 2023) / current code: all Fubini ordered
 *                    partitions evaluated regardless of anchor coverage (13 combos).
 */
let EXEC_MODE = 'paper-strict';

/** Set the active execution mode. Call before runLOA(). */
function setExecMode(mode) { EXEC_MODE = mode; }

/** Format a number: integers are printed without decimals, others to 1 d.p. */
const fmt = (x) =>
  x === Infinity
    ? '∞'
    : Math.abs(x - Math.round(x)) < 1e-9
      ? String(Math.round(x))
      : x.toFixed(1);


// ─── Model ────────────────────────────────────────────────────

/**
 * Build the internal model from the user-facing config object.
 * Runs Floyd-Warshall for all-pairs shortest paths, then enumerates
 * VNF layers and ordered partitions (S_parallel structures).
 */
function buildModel(cfg) {
  const n = cfg.nodes.length;

  // Distance matrix initialised to ∞ (0 on diagonal)
  const d = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity))
  );
  // Next-hop matrix for path reconstruction
  const nx = Array.from({ length: n }, () => new Array(n).fill(-1));

  for (const l of cfg.links) {
    if (l.a === l.b || l.a < 0 || l.b < 0 || l.a >= n || l.b >= n) continue;
    if (l.delay < d[l.a][l.b]) {
      d[l.a][l.b] = l.delay;
      d[l.b][l.a] = l.delay;
      nx[l.a][l.b] = l.b;
      nx[l.b][l.a] = l.a;
    }
  }
  for (let i = 0; i < n; i++) nx[i][i] = i;

  // Floyd-Warshall
  for (let m = 0; m < n; m++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (d[i][m] + d[m][j] < d[i][j] - EPS) {
          d[i][j] = d[i][m] + d[m][j];
          nx[i][j] = nx[i][m];
        }

  const levels = [...new Set(cfg.vnfs.map((v) => v.level))].sort((a, b) => a - b);
  const V = cfg.vnfs.map((v, i) => ({
    idx: i,
    name: v.name,
    proc: v.proc,
    dem:  v.dem,
    layer: levels.indexOf(v.level),
  }));
  const layers = levels.map((_, li) => V.filter((v) => v.layer === li).map((v) => v.idx));
  V.forEach((v) => { v.pos = layers[v.layer].indexOf(v.idx); });

  const M = {
    n, nodes: cfg.nodes, d, nx, V, layers,
    L: layers.length,
    src: cfg.src, dst: cfg.dst,
    trep: cfg.trep, tint: cfg.tint, tmax: cfg.tmax,
  };
  M.structs    = layers.map((l) => orderedPartitions(l));
  M.totalPaths = countPaths(M);
  M.mode       = EXEC_MODE;   // snapshot mode at build time
  return M;
}

/**
 * All ordered set partitions of `items`.
 * e.g. [1,2] → [[1],[2]], [[2],[1]], [[1,2]]
 */
function orderedPartitions(items) {
  if (items.length === 0) return [[]];
  const res = [], m = items.length;
  for (let mask = 1; mask < (1 << m); mask++) {
    const first = [], rest = [];
    for (let i = 0; i < m; i++) ((mask >> i) & 1 ? first : rest).push(items[i]);
    for (const tail of orderedPartitions(rest)) res.push([first, ...tail]);
  }
  return res;
}

/** Node-index list along the shortest path from a to b. */
function route(M, a, b) {
  if (M.d[a][b] === Infinity) return [];
  const out = [a]; let c = a, guard = 0;
  while (c !== b && guard++ < 64) { c = M.nx[c][b]; out.push(c); }
  return out;
}


// ─── DPG Path Space ───────────────────────────────────────────

/** Count the total number of source-to-destination DPG paths. */
function countPaths(M) {
  const memo = new Map();
  const cnt = (l, mask, host) => {
    const key = (l * 64 + mask) * 16 + host;
    if (memo.has(key)) return memo.get(key);
    let c = 0;
    const layer = M.layers[l];
    for (let qi = 0; qi < layer.length; qi++)
      if (!((mask >> qi) & 1))
        for (let y = 0; y < M.n; y++)
          if (M.d[host][y] < Infinity) c += cnt(l, mask | (1 << qi), y);
    if (l === M.L - 1) {
      if (M.d[host][M.dst] < Infinity) c += 1;
    } else {
      for (let qi = 0; qi < M.layers[l + 1].length; qi++)
        for (let y = 0; y < M.n; y++)
          if (M.d[host][y] < Infinity) c += cnt(l + 1, 1 << qi, y);
    }
    memo.set(key, c);
    return c;
  };
  let total = 0;
  for (let qi = 0; qi < M.layers[0].length; qi++)
    for (let y = 0; y < M.n; y++)
      if (M.d[M.src][y] < Infinity) total += cnt(0, 1 << qi, y);
  return total;
}

// ─── Min-Heap ─────────────────────────────────────────────────
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }

  less(x, y) {
    return x.f < y.f - EPS || (Math.abs(x.f - y.f) <= EPS && x.c < y.c);
  }

  push(v) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; }
      else break;
    }
  }

  pop() {
    const a = this.a;
    const top  = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        let l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

/**
 * Best-first k-shortest DPG paths using A* with an exact heuristic.
 * Returns { paths, exhausted }.
 */
function kShortest(M, k) {
  // Exact cost-to-go heuristic (memoised)
  const hm = new Map();
  const H = (l, mask, host) => {
    const key = (l * 64 + mask) * 16 + host;
    if (hm.has(key)) return hm.get(key);
    let best = Infinity;
    const layer = M.layers[l];
    for (let qi = 0; qi < layer.length; qi++) if (!((mask >> qi) & 1)) {
      const q = layer[qi];
      for (let y = 0; y < M.n; y++) {
        const c = M.d[host][y] + M.V[q].proc;
        if (c < Infinity) best = Math.min(best, c + H(l, mask | (1 << qi), y));
      }
    }
    if (l === M.L - 1) best = Math.min(best, M.d[host][M.dst]);
    else for (let qi = 0; qi < M.layers[l + 1].length; qi++) {
      const q = M.layers[l + 1][qi];
      for (let y = 0; y < M.n; y++) {
        const c = M.d[host][y] + M.V[q].proc;
        if (c < Infinity) best = Math.min(best, c + H(l + 1, 1 << qi, y));
      }
    }
    hm.set(key, best);
    return best;
  };

  const heap = new MinHeap(); let counter = 0;
  const out  = [];

  const pushState = (g, seq, l, mask, host) => {
    const h = H(l, mask, host);
    if (h < Infinity) heap.push({ f: g + h, g, seq, l, mask, host, done: false, c: counter++ });
  };

  for (let qi = 0; qi < M.layers[0].length; qi++) {
    const q = M.layers[0][qi];
    for (let y = 0; y < M.n; y++) {
      const c = M.d[M.src][y] + M.V[q].proc;
      if (c < Infinity) pushState(c, [{ f: q, h: y }], 0, 1 << qi, y);
    }
  }

  while (heap.size && out.length < k) {
    const it = heap.pop();
    if (it.done) { out.push({ id: out.length + 1, seq: it.seq, cost: it.f }); continue; }
    const { g, seq, l, mask, host } = it;
    const layer = M.layers[l];
    for (let qi = 0; qi < layer.length; qi++) if (!((mask >> qi) & 1)) {
      const q = layer[qi];
      for (let y = 0; y < M.n; y++) {
        const c = M.d[host][y] + M.V[q].proc;
        if (c < Infinity) pushState(g + c, [...seq, { f: q, h: y }], l, mask | (1 << qi), y);
      }
    }
    if (l === M.L - 1) {
      const c = M.d[host][M.dst];
      if (c < Infinity) heap.push({ f: g + c, g: g + c, seq, l, mask, host, done: true, c: counter++ });
    } else {
      for (let qi = 0; qi < M.layers[l + 1].length; qi++) {
        const q = M.layers[l + 1][qi];
        for (let y = 0; y < M.n; y++) {
          const c = M.d[host][y] + M.V[q].proc;
          if (c < Infinity) pushState(g + c, [...seq, { f: q, h: y }], l + 1, 1 << qi, y);
        }
      }
    }
  }
  return { paths: out, exhausted: out.length < k };
}


// ─── Path-level Filters ───────────────────────────────────────

/** Check capacity and Tmax for a single path. */
function pathFeasible(M, p) {
  const used = new Array(M.n).fill(0);
  for (const s of p.seq) used[s.h] += M.V[s.f].dem;
  for (let h = 0; h < M.n; h++)
    if (used[h] > M.nodes[h].cap + EPS)
      return { ok: false, kind: 'cap', reason: `node ${M.nodes[h].name}: demand ${fmt(used[h])} > capacity ${fmt(M.nodes[h].cap)}` };
  if (p.cost > M.tmax + EPS)
    return { ok: false, kind: 'ddl', reason: `cost ${fmt(p.cost)} > T_max ${fmt(M.tmax)}` };
  return { ok: true };
}

/** Return the set of same-layer "a before b" ordering pairs in a path. */
function orderPairs(M, p) {
  const set = new Set();
  for (let i = 0; i < p.seq.length; i++)
    for (let j = i + 1; j < p.seq.length; j++) {
      const a = p.seq[i].f, b = p.seq[j].f;
      if (M.V[a].layer === M.V[b].layer) set.add(a + '>' + b);
    }
  return set;
}

/**
 * Partition-stability filter.
 * Greedy in ascending cost: the costlier of any order-conflicting pair is dropped.
 */
function stabilityFilter(M, feas) {
  const kept = [], removed = [];
  for (const p of feas) {
    const op = orderPairs(M, p);
    let hit = null;
    for (const q of kept) {
      for (const key of op) {
        const [a, b] = key.split('>');
        if (q._op.has(b + '>' + a)) { hit = { by: q.id, a: +a, b: +b }; break; }
      }
      if (hit) break;
    }
    if (hit) removed.push({ id: p.id, ...hit });
    else { p._op = op; kept.push(p); }
  }
  return { kept, removed };
}

/** Return the set of VNF indices covered by the given paths. */
const covers = (M, paths) => {
  const s = new Set();
  for (const p of paths) for (const x of p.seq) s.add(x.f);
  return s;
};


// ─── Scheme Evaluation ────────────────────────────────────────

/**
 * Evaluate a concrete parallelization + placement scheme.
 * hosts  : array indexed by VNF index → MEC node index
 * stages : array of stages, each stage = array of VNF indices that run in parallel
 * Returns { lat, chain, br }
 */
function evalScheme(M, hosts, stages) {
  let prev = [{ f: -1, host: M.src, comp: 0, tr: 0, pr: 0, rp: 0, it: 0, pred: null }];

  for (let j = 0; j < stages.length; j++) {
    const st    = stages[j];
    const repU  = Math.max(st.length - 1, 0) * M.trep;
    const intW  = Math.max(prev.length - 1, 0) * M.tint;
    const cur   = [];
    for (const f of st) {
      let best = -Infinity, arg = null, bd = 0;
      for (const u of prev) {
        const dd = M.d[u.host][hosts[f]];
        const a  = u.comp + repU + dd;
        if (a > best) { best = a; arg = u; bd = dd; }
      }
      cur.push({ f, host: hosts[f], comp: best + intW + M.V[f].proc, tr: arg.tr + bd, pr: arg.pr + M.V[f].proc, rp: arg.rp + repU, it: arg.it + intW, pred: arg });
    }
    prev = cur;
  }

  const intD = Math.max(prev.length - 1, 0) * M.tint;
  let best = -Infinity, arg = null, bd = 0;
  for (const u of prev) {
    const dd = M.d[u.host][M.dst];
    const a  = u.comp + dd;
    if (a > best) { best = a; arg = u; bd = dd; }
  }
  const lat   = best + intD;
  const chain = []; for (let u = arg; u && u.f >= 0; u = u.pred) chain.unshift(u.f);
  return { lat, chain, br: { trans: arg.tr + bd, proc: arg.pr, rep: arg.rp, int: arg.it + intD } };
}

const flat = (layerStages) => layerStages.flat();

/** Return true iff the stage array respects the required ordering. */
function structOK(st, order) {
  if (order.length < 2) return true;
  const idx = new Map();
  st.forEach((s, i) => s.forEach((f) => idx.set(f, i)));
  for (let i = 0; i + 1 < order.length; i++)
    if (!(idx.get(order[i]) < idx.get(order[i + 1]))) return false;
  return true;
}

/**
 * Generate candidate structures for a single layer based on the current mode.
 *
 * @param {number[]} layer     - all VNF indices in this layer
 * @param {number[]} anchorVNFs - VNF indices from this layer that are on the anchor path
 * @param {number[][]} allStructs - all ordered partitions for this layer (M.structs[li])
 * @param {string}  mode        - 'paper-strict' | 'all-combos'
 * @returns {number[][][]} array of valid stage arrays
 */
function getPartialLayerStructures(layer, anchorVNFs, allStructs, mode) {
  const nAnchor = anchorVNFs.length;
  const nLayer  = layer.length;

  // Case 1: Completely absent — generate all ordered partitions
  if (nAnchor === 0) return allStructs;

  // Case 2: Fully covered — retain exactly the anchor's serial/parallel execution
  // (The anchor path already specifies which VNF is in which stage; we keep that.)
  if (nAnchor === nLayer) {
    // Filter to only structures where anchor VNFs appear in their required order
    return allStructs.filter((st) => structOK(st, anchorVNFs));
  }

  // Case 3: Partially covered — key distinction between modes
  if (mode === 'paper-strict') {
    // Paper 1 (TON 2026) strict intent:
    // The anchor VNF(s) stay in a fixed stage; non-anchor VNFs are inserted
    // IN PARALLEL to the anchor's stage ("without modifying the anchor structure").
    //
    // Concretely, if anchorVNFs = [f2] and remaining = [f3, f4], the valid
    // structures are exactly those where f2 is in a single stage together with
    // some sub-arrangement of {f3, f4}, and that whole stage is unordered w.r.t.
    // the anchor — i.e. f3/f4 must be in the SAME stage index as f2 or form
    // their own sub-chain that is entirely concurrent with f2 (i.e. same stage).
    //
    // Practically this means: generate all ordered partitions of the NON-anchor
    // VNFs, then merge each with the anchor's single-stage: the anchor stage
    // contains all of [anchorVNFs, ...oneSubsetOfRemaining] that must execute
    // in parallel in one slot.
    //
    // The 3 valid structures for anchor=[f2], remaining=[f3,f4]:
    //   1. [[f2, f3, f4]]              (full parallel)
    //   2. [[f2, f3], [f4]]   — NO — this would serial-chain f4 AFTER f2, violating anchor!
    //   Actually the correct 3 per the paper are:
    //   1. [[f2, f3, f4]]              full parallel
    //   2. [[f2, f3→f4]] = [[f2],[f3],[f4]] where f2 is parallel to the sub-chain f3→f4
    //      but since a stage is a parallel group, this means one stage = [f2] run concurrently
    //      with sub-chain [f3]->[f4]. Represented as: [[f2, f3], ...] can’t capture that.
    //      In stage representation: stage0=[f2,f3], stage1=[] is wrong.
    //      The stage array [[f2]] then [[f3,f4]] would place f3,f4 AFTER f2 — modifies anchor.
    //      The correct representation of "f2 parallel to (f3→f4)" is:
    //        stage0 = [f2, f3]  (f2 and f3 start together)
    //        stage1 = [f4]      (f4 starts after f3 finishes, but f2 may still be running)
    //      Wait — this is actually the correct parallel sub-chain encoding! f2 starts at
    //      stage 0, f3 starts at stage 0, f4 starts at stage 1. f2 is never delayed by f3/f4.
    //
    // So the 3 structures for anchor=[f2], remaining=[f3,f4] are:
    //   1. [[f2,f3,f4]]        — full parallel (all same stage)
    //   2. [[f2,f3],[f4]]      — f2∥f3 in stage 0, f4 in stage 1 (f2∥(f3→f4))
    //   3. [[f2,f4],[f3]]      — f2∥f4 in stage 0, f3 in stage 1 (f2∥(f4→f3))
    //
    // General rule: in all valid structures the anchor VNFs occupy stage 0 (or the
    // earliest stage), and any non-anchor subset can appear alongside the anchor in
    // stage 0. The remainder of non-anchor VNFs get their own subsequent sub-stages.
    // The anchor VNFs themselves NEVER appear in a stage with index > any non-anchor VNF.
    //
    // Implementation: enumerate all ordered partitions of remaining VNFs, then
    // prepend anchors into the first partition block.
    const remaining = layer.filter((f) => !anchorVNFs.includes(f));
    const remPartitions = orderedPartitions(remaining);
    const result = [];
    for (const rp of remPartitions) {
      // Merge anchor VNFs into the first stage of each remaining partition
      // This ensures anchor VNFs always appear at stage index 0 alongside
      // the first group of remaining VNFs (preserving anchor structure).
      const merged = [[...anchorVNFs, ...rp[0]], ...rp.slice(1)];
      result.push(merged);
    }
    return result;
  }

  // 'all-combos' mode: use all Fubini ordered partitions, filter only by anchor order
  return allStructs.filter((st) => structOK(st, anchorVNFs));
}

/**
 * Build S_parallel for an anchor (Algorithm 2, lines 10–12) and
 * evaluate every candidate scheme.
 */
function evaluateAnchor(M, A, anchor) {
  const fixed  = new Map(anchor.seq.map((s) => [s.f, s.h]));
  const hostC  = M.V.map(() => []);
  for (const p of A)
    for (const s of p.seq)
      if (!fixed.has(s.f) && !hostC[s.f].includes(s.h)) hostC[s.f].push(s.h);

  const layerOpts = M.layers.map((layer, li) => {
    const anchorVNFs = anchor.seq.filter((s) => M.V[s.f].layer === li).map((s) => s.f);
    return getPartialLayerStructures(layer, anchorVNFs, M.structs[li], M.mode);
  });

  const free         = M.V.filter((v) => !fixed.has(v.idx)).map((v) => v.idx);
  const hostCombos   = free.reduce((a, f) => a * hostC[f].length, 1);
  const structCombos = layerOpts.reduce((a, o) => a * o.length, 1);
  const total        = hostCombos * structCombos;
  // combos: per-combination rows for the UI (only populated when total is small enough)
  const trackCombos  = total <= COMBO_DISPLAY_CAP;
  const out          = { total, hostCombos, structCombos, evaluated: 0, feasible: 0, best: null, capped: false, freeVNFs: free, fixedVNFs: [...fixed.keys()], combos: trackCombos ? [] : null };

  const hosts    = new Array(M.V.length).fill(-1);
  fixed.forEach((h, f) => { hosts[f] = h; });
  const used     = new Array(M.n);
  const structIdx = new Array(M.L).fill(0);

  const tryHosts = () => {
    used.fill(0);
    for (let f = 0; f < M.V.length; f++) used[hosts[f]] += M.V[f].dem;
    for (let h = 0; h < M.n; h++) if (used[h] > M.nodes[h].cap + EPS) { out.evaluated += structCombos; return; }
    structIdx.fill(0);
    for (;;) {
      if (out.evaluated >= CAND_CAP) { out.capped = true; return; }
      const stages = [];
      for (let li = 0; li < M.L; li++) for (const s of layerOpts[li][structIdx[li]]) stages.push(s);
      const ev = evalScheme(M, hosts, stages);
      out.evaluated++;
      const isFeas = ev.lat <= M.tmax + EPS && ev.lat < Infinity;
      if (isFeas) {
        out.feasible++;
        if (!out.best || ev.lat < out.best.lat - EPS)
          out.best = { hosts: hosts.slice(), stages, lat: ev.lat, br: ev.br, chain: ev.chain };
      }
      // Record this combination for the UI breakdown
      if (trackCombos) {
        out.combos.push({
          label: schemeStr(M, hosts, stages),
          struct: structStr(M, stages),
          lat: ev.lat,
          feasible: isFeas,
        });
      }
      let li = M.L - 1;
      while (li >= 0 && ++structIdx[li] >= layerOpts[li].length) { structIdx[li] = 0; li--; }
      if (li < 0) break;
    }
  };

  const rec = (i) => {
    if (out.capped) return;
    if (i === free.length) { tryHosts(); return; }
    const f = free[i];
    for (const h of hostC[f]) { hosts[f] = h; rec(i + 1); if (out.capped) return; }
  };

  if (layerOpts.every((o) => o.length > 0)) rec(0);
  return out;
}


// ─── Brute Force ──────────────────────────────────────────────

/** Number of evaluations the brute-force search would need. */
function bruteForceSize(M) {
  return Math.pow(M.n, M.V.length) * M.structs.reduce((a, s) => a * s.length, 1);
}

/** Exhaustive search over every host assignment × structure. */
function bruteForce(M) {
  const hosts = new Array(M.V.length).fill(0);
  const used  = new Array(M.n);
  let best = null, count = 0;
  const structIdx = new Array(M.L).fill(0);

  const doStructs = () => {
    structIdx.fill(0);
    for (;;) {
      const stages = [];
      for (let li = 0; li < M.L; li++) for (const s of M.structs[li][structIdx[li]]) stages.push(s);
      const ev = evalScheme(M, hosts, stages); count++;
      if (ev.lat <= M.tmax + EPS && ev.lat < Infinity && (!best || ev.lat < best.lat - EPS))
        best = { hosts: hosts.slice(), stages, lat: ev.lat };
      let li = M.L - 1;
      while (li >= 0 && ++structIdx[li] >= M.structs[li].length) { structIdx[li] = 0; li--; }
      if (li < 0) break;
    }
  };

  const rec = (i) => {
    if (i === M.V.length) {
      used.fill(0);
      for (let f = 0; f < M.V.length; f++) used[hosts[f]] += M.V[f].dem;
      for (let h = 0; h < M.n; h++) if (used[h] > M.nodes[h].cap + EPS) return;
      doStructs();
      return;
    }
    for (let h = 0; h < M.n; h++) { hosts[i] = h; rec(i + 1); }
  };

  rec(0);
  return { best, count };
}


// ─── String Helpers ───────────────────────────────────────────
const vn = (M, f) => M.V[f].name;

function pstr(M, p) {
  return p.seq.map((s) => `${vn(M, s.f)}@${M.nodes[s.h].name}`).join(' → ');
}

function structStr(M, stages) {
  return stages
    .map((st) => st.length === 1 ? vn(M, st[0]) : '(' + st.map((f) => vn(M, f)).join(' ∥ ') + ')')
    .join(' → ');
}

function schemeStr(M, hosts, stages) {
  return stages
    .map((st) => st.length === 1
      ? `${vn(M, st[0])}@${M.nodes[hosts[st[0]]].name}`
      : '(' + st.map((f) => `${vn(M, f)}@${M.nodes[hosts[f]].name}`).join(' ∥ ') + ')')
    .join(' → ');
}


// ─── Trace Generator ──────────────────────────────────────────

/**
 * Run the full LOA algorithm on the given config and return an
 * annotated array of steps for the walkthrough UI.
 *
 * @param {object} cfg  User-facing configuration object
 * @returns {{ M, steps, PATHS, LM, best }}
 */
function runLOA(cfg) {
  const M    = buildModel(cfg);
  const kmax = cfg.kmax || K_MAX;
  const steps = [];
  const PATHS = []; // global; id = index + 1 (ranks are prefix-stable across rounds)
  let best = Infinity, LM = null;
  let k = M.n + 1, round = 0;
  let warm = 0, prevStable = [];

  const covName = (set) =>
    [...set].sort((a, b) => a - b).map((f) => vn(M, f)).join(', ');
  const allF = new Set(M.V.map((v) => v.idx));

  const base = () => ({
    round, k, best, LM, lb: null, rawN: 0,
    showFeas: false, showStab: false,
    infeas: {}, confl: {}, stable: [],
    cov: null, astar: null, A: null, anchor: null, pnew: null, cand: null,
    hl: { A3: [], A2: [] }, event: null, imp: 0,
  });
  const push = (s) => { s.id = steps.length; steps.push(s); return s; };

  // ── Step 0: initialisation ──────────────────────────────────
  push({
    ...base(), phase: 'init', alg: 'A3', imp: 0,
    hl: { A3: [2, 3, 4], A2: [] },
    title: 'Set up: DPG, initial k, empty LM-PDS',
    body: `Algorithm 1 has already built the delay-weighted DPG: <b>${M.L}</b> dependency layer${M.L > 1 ? 's' : ''}, <b>${M.V.length}</b> partitions, each holding one replica of all <b>${M.n}</b> MEC nodes. The graph contains <b>${M.totalPaths.toLocaleString()}</b> source-to-destination paths — far too many to look at, so LOA only ever looks at the cheapest few.<br>Best latency starts at <b>c<sub>d</sub>(LM-PDS) = ∞</b> and the first window is <b>k = |V| + 1 = ${k}</b> paths.`,
    watch: 'Every DPG path is a partial answer: it picks one host for each VNF it visits. Path cost = link delay + processing delay only.',
  });

  // ── Terminal step helper ────────────────────────────────────
  const finish = (why, extra) => {
    const b = base();
    push({
      ...b, ...extra, phase: 'done', alg: 'A3', imp: 0,
      event: LM ? 'stop' : 'reject',
      hl: { A3: [29], A2: [] },
      title: LM ? 'Stop: LM-PDS returned' : 'Stop: no feasible scheme',
      body: why,
      watch: LM
        ? 'Everything cheaper than the current best was examined; everything costlier is provably no better (Lemma 4.3).'
        : 'No feasible parallelization + placement exists under the given capacities / T_max.',
    });
  };

  // ── Main loop (Algorithm 3) ─────────────────────────────────
  for (;;) {
    round++;
    const sp  = kShortest(M, k);
    const raw = sp.paths;
    raw.forEach((p, i) => { p.id = i + 1; PATHS[i] = p; }); // keep ids prefix-stable
    const rawN     = raw.length;
    const exhausted = sp.exhausted;

    // Line 6: k shortest paths
    push({
      ...base(), phase: 'kpaths', alg: 'A3', imp: 0, rawN,
      hl: { A3: [5, 6], A2: [] },
      title: `Round ${round}: take the k = ${k} cheapest DPG paths`,
      body: `LOA asks the DPG for the <b>${rawN}</b> lowest-cost paths (k-shortest paths, sorted by c<sub>d</sub>). The cheapest costs <b>${fmt(raw[0]?.cost ?? Infinity)} ms</b>, the ${rawN}-th costs <b>${fmt(raw[rawN - 1]?.cost ?? Infinity)} ms</b>. Nothing has been checked yet — the list is raw.${exhausted ? `<br><b>The DPG only has ${rawN} paths in total, so this window already contains all of them.</b>` : ''}`,
      watch: 'Each row is a route through the DPG: which VNF runs on which MEC node, in which order.',
    });

    // Line 7: feasibility filter
    const infeas = {}; const feas = [];
    for (const p of raw) {
      const r = pathFeasible(M, p);
      if (r.ok) feas.push(p); else infeas[p.id] = r;
    }
    const nInf = Object.keys(infeas).length;
    push({
      ...base(), phase: 'feasible', alg: 'A3', imp: 0, rawN, showFeas: true, infeas,
      hl: { A3: [7], A2: [] },
      title: nInf ? `Feasibility filter: ${nInf} path${nInf > 1 ? 's' : ''} rejected` : 'Feasibility filter: all paths pass',
      body: nInf
        ? `A path is feasible only if the VNFs it places on one node fit into that node's capacity${M.tmax < 1e6 ? ' and its cost respects T<sub>max</sub>' : ''}. <b>${nInf}</b> of the ${rawN} paths break this — cheap paths that stack several heavy VNFs on the same node are typical offenders. <b>${feas.length}</b> remain.`
        : `Every one of the ${rawN} paths respects node capacities${M.tmax < 1e6 ? ' and T<sub>max</sub>' : ''}. <b>${feas.length}</b> remain.`,
      watch: 'Infeasible paths still count toward k — they were among the k cheapest, but cannot be used.',
    });

    // Lines 8–19: partition-stability filter
    const st        = stabilityFilter(M, feas);
    const confl     = {};
    st.removed.forEach((r) => { confl[r.id] = r; });
    const stable    = st.kept;
    const stableIds = stable.map((p) => p.id);
    push({
      ...base(), phase: 'stable', alg: 'A3', imp: 0, rawN,
      showFeas: true, showStab: true, infeas, confl, stable: stableIds,
      hl: { A3: [8, 19], A2: [] },
      title: st.removed.length
        ? `Partition-stability filter: ${st.removed.length} conflict${st.removed.length > 1 ? 's' : ''} removed`
        : 'Partition-stability filter: no conflicts',
      body: st.removed.length
        ? `Two VNFs of the same layer may appear in <i>opposite order</i> in different paths (e.g. ${st.removed.slice(0, 2).map((r) => `<b>${vn(M, r.a)} before ${vn(M, r.b)}</b> in #${r.by} but <b>${vn(M, r.b)} before ${vn(M, r.a)}</b> in another`).join('; ')}). The costlier path of each such pair is dropped. <b>${stable.length}</b> paths survive.`
        : `No two feasible paths impose opposite orders on the same layer. All <b>${stable.length}</b> remain in P<sub>stab</sub>.`,
      watch: 'An order conflict means the two paths could never both appear in a valid scheme — keep only the cheaper one.',
    });

    // Lines 20–23: coverage check
    const cov     = covers(M, stable);
    const missing = M.V.map((v) => v.idx).filter((f) => !cov.has(f));
    if (missing.length > 0) {
      const stop = exhausted || k >= kmax;
      push({
        ...base(), phase: 'coverage', alg: 'A3', imp: 0, rawN,
        showFeas: true, showStab: true, infeas, confl, stable: stableIds,
        cov: { covered: [...cov], missing }, hl: { A3: [20, 21, 22, 23], A2: [] },
        event: stop ? null : 'kdouble', kreason: 'coverage',
        title: stop ? 'Coverage check fails and the window cannot grow' : `Coverage check fails → k doubles to ${2 * k}`,
        body: `The union of VNFs on the surviving paths is {${covName(cov) || '—'}}. <b>${missing.map((f) => vn(M, f)).join(', ')}</b> ${missing.length > 1 ? 'appear' : 'appears'} on none of them: the window is too narrow to even <i>describe</i> a scheme, because every cheap path prefers the same VNF in its layer.<br>${stop ? (exhausted ? 'The whole DPG was already inside the window, so no scheme exists.' : `k reached the demo limit (${kmax}).`) : `Algorithm 2 is skipped. Line 21: <b>k ← 2k = ${2 * k}</b> and the loop <b>continues</b>.`}`,
        watch: 'Paths are cheap for a reason: they keep skipping the slower VNF of each parallel group.',
      });
      if (stop) { finish(exhausted ? 'The DPG was exhausted without ever covering all VNFs (capacity / T<sub>max</sub> too tight).' : 'Demo limit on k reached.'); break; }
      k *= 2; continue;
    }
    push({
      ...base(), phase: 'coverage', alg: 'A3', imp: 0, rawN,
      showFeas: true, showStab: true, infeas, confl, stable: stableIds,
      cov: { covered: [...cov], missing: [] }, hl: { A3: [20, 23], A2: [] },
      title: 'Coverage check passes',
      body: `The surviving paths together touch every VNF: {${covName(cov)}}. The window is now wide enough to assemble a complete parallelization scheme from it, so line 24 hands P<sub>stab</sub> to <b>Algorithm 2</b>.`,
      watch: 'A single path never covers everything; a scheme needs several paths that fork after one VNF and merge before another.',
    });

    // ── Algorithm 2 ────────────────────────────────────────────
    const P = stable;

    // Lines 1–2: smallest covering prefix A*
    let acc = new Set(), pre = 0;
    for (let i = 0; i < P.length; i++) {
      for (const s of P[i].seq) acc.add(s.f);
      pre = i + 1;
      if (acc.size === M.V.length) break;
    }
    const astar    = P.slice(0, pre);
    const astarIds = astar.map((p) => p.id);
    const cmax     = astar[astar.length - 1].cost;
    const prunedByBound = cmax > best + EPS;
    push({
      ...base(), phase: 'a2prefix', alg: 'A2', imp: 0, rawN,
      showFeas: true, showStab: true, infeas, confl, stable: stableIds,
      astar: astarIds, A: astarIds, lb: cmax, cov: { covered: [...allF], missing: [] },
      hl: { A3: [24], A2: prunedByBound ? [1, 2, 3, 4] : [1, 2, 3, 5] },
      title: 'Algorithm 2: smallest prefix A* that covers every VNF',
      body: `Walking down P<sub>stab</sub> in cost order, the first <b>${pre}</b> path${pre > 1 ? 's' : ''} (#${astarIds.join(', #')}) already touch all ${M.V.length} VNFs. That is <b>A*</b>.<br>Its most expensive path costs <b>c<sub>d</sub><sup>max</sup>(A*) = ${fmt(cmax)} ms</b>. Any scheme must contain enough paths to cover all VNFs, so no scheme can be faster than this: it is a <b>lower bound</b>.<br>Compare with the current best (${fmt(best)} ms): ${prunedByBound ? `<b>${fmt(cmax)} > ${fmt(best)}</b> → nothing can beat LM-PDS, return immediately (lines 3–4).` : `${fmt(cmax)} ≤ ${fmt(best)} → the bound does not exclude anything, keep searching (line 5 → 6).`}`,
      watch: 'The purple marker on the ruler is this lower bound. The scheme we are looking for lies at or to the right of it.',
    });
    if (prunedByBound) {
      finish(`Lower bound c<sub>d</sub><sup>max</sup>(A*) = ${fmt(cmax)} ms already exceeds the best latency ${fmt(best)} ms. LM-PDS is final.`,
        { astar: astarIds, A: astarIds, lb: cmax, rawN, showFeas: true, showStab: true, infeas, confl, stable: stableIds });
      break;
    }

    // Warm start
    const prefixOK = prevStable.length > 0 && prevStable.length <= P.length && prevStable.every((id, i) => P[i].id === id);
    let sizeA = pre, t = 0, needEval = true;
    if (round > 1 && prefixOK && warm >= pre) {
      sizeA = warm; t = warm - pre; needEval = false;
      push({
        ...base(), phase: 'a2resume', alg: 'A2', imp: 1, rawN,
        showFeas: true, showStab: true, infeas, confl, stable: stableIds,
        astar: astarIds, A: P.slice(0, sizeA).map((p) => p.id), lb: cmax,
        hl: { A3: [24], A2: [6, 7, 8] },
        title: `Resume: skip the ${warm - pre + 1} anchors already evaluated`,
        body: `P is sorted and the new paths were appended at the end, so A<sup>(0)</sup> … A<sup>(${warm - pre})</sup> are exactly the sets from the previous round and would give exactly the same candidates. Their result is already folded into the best latency (<b>${fmt(best)} ms</b>), so we jump to A = first ${warm} paths and look at the <i>next</i> path.<br><span class="warnline">Pseudocode restarts from t = 0; the outcome is identical, this only saves clicks.</span>`,
        watch: 'Only the paths that were added by doubling k are new work.',
      });
    }

    let outcome = null;
    for (;;) {
      const Aset   = P.slice(0, sizeA);
      const Aids   = Aset.map((p) => p.id);
      const anchor = Aset[Aset.length - 1];

      if (needEval) {
        const ev       = evaluateAnchor(M, Aset, anchor);
        const prevBest = best;
        let improved   = false;
        if (ev.best && ev.best.lat < best - EPS) {
          best = ev.best.lat;
          LM   = { ...ev.best, round, anchorId: anchor.id, t };
          improved = true;
        }
        const isLastOfSet = sizeA === P.length;
        const nextP       = !isLastOfSet ? P[sizeA] : null;
        const imp         = (t === 0 || improved || isLastOfSet || (nextP && nextP.cost > best + EPS)) ? 0 : 1;
        const modeLabel = M.mode === 'paper-strict'
          ? '<span class="badge-mode">Paper Strict</span> (TON 2026: partial layers \u2192 3 combos)'
          : '<span class="badge-mode badge-mode-all">Full Exploration</span> (TWC 2023: all Fubini partitions)';
        push({
          ...base(), best, LM, phase: 'a2iter', alg: 'A2', imp,
          event: improved ? 'update' : null, rawN,
          showFeas: true, showStab: true, infeas, confl, stable: stableIds,
          astar: astarIds, A: Aids, anchor: anchor.id, lb: cmax, t,
          cand: { ...ev, improved, prevBest },
          hl: { A3: [24], A2: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
          title: `t = ${t}: anchor #${anchor.id}, ${improved ? 'new LM-PDS ' + fmt(best) + ' ms' : 'no improvement'}`,
          body: `A<sup>(${t})</sup> holds the ${sizeA} cheapest paths. The costliest of them, <b>#${anchor.id}</b> (${fmt(anchor.cost)} ms), is the <b>anchor</b>: it decides how slow the branch bottleneck is.<br>` +
            `<b>Build S<sub>parallel</sub></b> [mode: ${modeLabel}] — keep the anchor's hosts and execution order for ${ev.fixedVNFs.map((f) => vn(M, f)).join(', ')}` +
            (ev.freeVNFs.length ? `; place ${ev.freeVNFs.map((f) => vn(M, f)).join(', ')} on hosts seen in A<sup>(${t})</sup> and try valid serial / parallel arrangements inside each layer.` : '; nothing else to place.') +
            `<br><b>${ev.evaluated.toLocaleString()}</b> candidate scheme${ev.evaluated === 1 ? '' : 's'} evaluated (with replication + integration delay), <b>${ev.feasible.toLocaleString()}</b> feasible` +
            (ev.best ? `; best <b>${fmt(ev.best.lat)} ms</b>.` : '; none feasible.') +
            (ev.capped ? ' <span class="warnline">(demo cap reached)</span>' : '') +
            `<br>${improved ? `<b>${fmt(ev.best.lat)} < ${fmt(prevBest)}</b> → update LM-PDS (line 15).` : `Not better than ${fmt(best)} ms → LM-PDS unchanged.`}`,
          watch: improved ? 'The green line on the ruler just moved left: the pruned region grew.' : 'A candidate must beat the green line to matter.',
        });
      }
      needEval = true;

      // All paths in window examined without hitting the prune test
      if (sizeA === P.length) {
        const stop = exhausted || k >= kmax;
        push({
          ...base(), best, LM, phase: 'a2exhaust', alg: 'A2', imp: 0,
          event: stop ? null : 'kdouble', kreason: 'exhausted', rawN,
          showFeas: true, showStab: true, infeas, confl, stable: stableIds,
          astar: astarIds, A: Aids, lb: cmax, pnew: null,
          hl: { A3: [25, 26, 27], A2: [25, 26] },
          title: stop ? 'Window exhausted and DPG exhausted' : `Window exhausted → k doubles to ${2 * k}`,
          body: `A<sup>(t)</sup> now equals all ${P.length} paths of P<sub>stab</sub> and <b>none</b> of them was costlier than the best latency (${fmt(best)} ms). Paths just outside the window could still lie to the left of the green line, so optimality is <b>not yet certified</b>.<br>` +
            (stop
              ? (exhausted ? 'But the DPG has no further paths — the search space is complete.' : `k reached the demo limit (${kmax}).`)
              : `Algorithm 2 returns; in Algorithm 3 <code>flag</code> is still false, so line 26: <b>k ← 2k = ${2 * k}</b> and a fresh, wider window is examined.`),
          watch: 'k is doubled for a different reason than before: not "too few VNFs covered", but "the window ended before the bound was reached".',
        });
        warm = sizeA; prevStable = P.map((p) => p.id);
        outcome = stop ? 'final' : 'double';
        break;
      }

      // Lines 18–22: next path + prune test
      const pnew = P[sizeA];
      if (pnew.cost > best + EPS) {
        push({
          ...base(), best, LM, phase: 'a2prune', alg: 'A2', imp: 0,
          event: 'stop', rawN,
          showFeas: true, showStab: true, infeas, confl, stable: stableIds,
          astar: astarIds, A: Aids, lb: cmax, pnew: pnew.id,
          hl: { A3: [24], A2: [18, 19, 20, 21] },
          title: `Prune: next path #${pnew.id} costs ${fmt(pnew.cost)} ms > best ${fmt(best)} ms`,
          body: `The cheapest path not yet in A is <b>#${pnew.id}</b> at <b>${fmt(pnew.cost)} ms</b>, already above the best latency <b>${fmt(best)} ms</b>. Every remaining path is at least that expensive, so any scheme that uses one has latency &gt; ${fmt(best)} ms. All of them form the pruned set Ω<sub>2</sub> and can be discarded without looking (Lemma 4.3).<br>Algorithm 2 returns; the search is complete.`,
          watch: 'The hatched red region on the ruler is Ω₂. The green line is the answer.',
        });
        warm = sizeA; prevStable = P.map((p) => p.id);
        outcome = 'prune'; break;
      }

      push({
        ...base(), best, LM, phase: 'a2extend', alg: 'A2', imp: 1, rawN,
        showFeas: true, showStab: true, infeas, confl, stable: stableIds,
        astar: astarIds, A: Aids, lb: cmax, pnew: pnew.id,
        hl: { A3: [24], A2: [18, 19, 22, 23, 24] },
        title: `Extend: add #${pnew.id} (${fmt(pnew.cost)} ms) to A`,
        body: `Next path <b>#${pnew.id}</b> costs ${fmt(pnew.cost)} ms ≤ best ${fmt(best)} ms, so it might still take part in a better scheme. A<sup>(${t + 1})</sup> = A<sup>(${t})</sup> ∪ {#${pnew.id}}, and #${pnew.id} becomes the new anchor.`,
        watch: 'The set grows one path at a time, always by the cheapest unexplored path.',
      });
      sizeA++; t++;
    }

    if (outcome === 'prune') {
      finish(`Algorithm 2 pruned the rest of the window. The latency-minimizing parallelization + deployment scheme (LM-PDS) is <b>${fmt(best)} ms</b>.`, { best, LM });
      break;
    }
    if (outcome === 'final') {
      finish(LM ? `The DPG has no more paths. LM-PDS = <b>${fmt(best)} ms</b>.` : 'The DPG was exhausted and no feasible scheme was found.');
      break;
    }
    k *= 2;
  }

  return { M, steps, PATHS, LM, best };
}
