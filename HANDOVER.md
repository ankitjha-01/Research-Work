# Handover: LOA Code vs Research Paper Inconsistency

**Date:** 2026-10-12  
**Topic:** Resolution of $S_{\text{parallel}}$ Construction Logic for Partially-Covered Layers  
**Files involved:** `js/engine.js` (lines 357–364, 377–385), `js/walkthrough.js`, `index.html`  
**Referenced Papers:**
- **Paper 1 (Current Base):** Liu et al., *"Joint Virtual Network Function Parallelization and Deployment in Mobile Edge Networks"*, IEEE Transactions on Networking (TON), accepted 2026 (`research-paper.pdf`).
- **Paper 2 (Predecessor Baseline):** Tian et al., *"Joint VNF Parallelization and Deployment in Mobile Edge Networks"*, IEEE Transactions on Wireless Communications (TWC), Vol. 22, No. 11, Nov 2023 (`research-paper2.pdf`).

---

## 1. Executive Summary

During our detailed audit of `js/engine.js` against the research paper, we identified a **major discrepancy** in how candidate parallelization schemes ($S_{\text{parallel}}$) are constructed for anchor paths:

- **What Research Paper 1 specifies (Section IV-B, Page 8):**
  - **Partially-covered dependency groups:** Existing execution relationships of anchor VNFs are **retained**, while remaining VNFs are **"inserted without modifying the anchor structure"**.
  - **Completely-absent dependency groups:** **"all feasible serial and parallel execution structures satisfying dependency constraints are generated"**.
- **What the current code (`js/engine.js`) implements:**
  - In `evaluateAnchor`, `structOK(st, order)` contains a check: `if (order.length < 2) return true;`.
  - When an anchor path contains only **one** VNF from a 3-VNF layer (e.g., $f_2$ from $\{f_2, f_3, f_4\}$), `order.length === 1`.
  - Consequently, `structOK` returns `true` for **all 13 ordered partitions** of $\{f_2, f_3, f_4\}$.
  - The code evaluates every serial and parallel permutation (including $f_3 \to f_2 \to f_4$, $(f_3 \parallel f_4) \to f_2$, etc.), which treats partially-covered layers identically to completely-absent layers.
- **Why this matters:**
  - The user's deduction of **3 combinations** for partially-covered layers represents the **strict intent of Paper 1**.
  - The code's evaluation of **13 combinations** represents the **exhaustive approach of Paper 2 (Tian et al.)**.
  - This discrepancy opens an **exciting research gap**: Paper 1 prunes aggressively but may miss lower-latency topologies by refusing to rearrange partial groups; Paper 2 explores everything but suffers high complexity; an adaptive/hybrid approach bridging both is a publishable research contribution.

---

## 2. Exact Research Paper Citations

### 2.1 Paper 1: IEEE TON 2026 (`research-paper.pdf`)

#### A. Section IV-B (Refinement Phase, Page 8, Left Column):
> *"In iteration $t$, the path $p^{(t)} \in A^{(t)}$ with the largest $c_d(p)$ is selected as the anchor path. Since this path determines the latency bottleneck of the current candidate solution, the algorithm preserves the execution structure of the VNFs contained in $F(p^{(t)})$ and attempts to incorporate the uncovered VNFs in $F_u \setminus F(p^{(t)})$."*
>
> *"**For dependency groups that are partially covered by the anchor path, the existing execution relationships among anchor-path VNFs are retained, while the remaining VNFs are inserted without modifying the anchor structure.**"*
>
> *"**For dependency groups that are completely absent from the anchor path, all feasible serial and parallel execution structures satisfying the dependency constraints are generated.**"*
>
> *"These group-level structures are subsequently combined according to inter-group dependencies to form the candidate scheme set $S_{\text{parallel}}^{(t)}$."*

#### B. Algorithm 2 (Lines 10–12, Page 8):
```text
10: Build S_parallel^(t) based on:
11:     Partial group reuse for F(p^(t))
12:     Full construction for Fu \ F(p^(t))
```

#### C. Complexity Analysis (Lemma 4.1, Page 9):
> *"Lemma 4.1: The time complexity of Algorithm 2 and 4 is $O(|P| \cdot \prod_{h=1}^l |\text{group}_h|)$, where each $\text{group}_h$ (for $1 \le h \le l$) denotes a set of VNFs sharing the same dependency level."*

Notice the complexity bound in Lemma 4.1: $\prod |\text{group}_h|$, which is linear in the number of VNFs per group, **not** the Bell/Fubini number of ordered partitions (which would be exponential/factorial if all 13 combinations were constructed at every step).

---

## 3. Mathematical Breakdown: 3 Combinations vs. 13 Combinations

Consider a request with SFC:
$$f_1 \longrightarrow \{f_2, f_3, f_4\} \longrightarrow f_5$$
where:
- Layer 1 ($L_1$): $\{f_1\}$
- Layer 2 ($L_2$): $\{f_2, f_3, f_4\}$ (dependency group of size 3)
- Layer 3 ($L_3$): $\{f_5\}$

Suppose the chosen anchor path is $p = \langle s, f_1, f_2, f_5, d \rangle$.
- Covered VNFs: $F(p) = \{f_1, f_2, f_5\}$
- Uncovered VNFs: $F_u \setminus F(p) = \{f_3, f_4\}$
- For Layer 2, $f_2$ is in the anchor, while $\{f_3, f_4\}$ are absent.

### Option A: The Paper's Intent (3 Combinations for Partial Group)
Because $f_2$ is already fixed as the anchor's execution unit in Layer 2, inserting $\{f_3, f_4\}$ **"without modifying the anchor structure"** means $f_2$ cannot be delayed by placing $f_3$ or $f_4$ serially before or after it. $\{f_3, f_4\}$ must execute **in parallel** to $f_2$.

The 3 valid structural relationships between $f_2$ and $\{f_3, f_4\}$:
1. **Full Parallel:** $f_2 \parallel f_3 \parallel f_4$  
   (All 3 run in parallel in a single stage: `[[f2, f3, f4]]`)
2. **Parallel with sub-chain $(f_3 \to f_4)$:** $f_2 \parallel (f_3 \to f_4)$  
   ($f_3$ executes before $f_4$, but both run concurrent to $f_2$)
3. **Parallel with sub-chain $(f_4 \to f_3)$:** $f_2 \parallel (f_4 \to f_3)$  
   ($f_4$ executes before $f_3$, but both run concurrent to $f_2$)

In all 3 cases, the anchor execution of $f_2$ is **unmodified**.

### Option B: Current Code Implementation (13 Combinations)
In `engine.js`, `orderedPartitions([f2, f3, f4])` generates all 13 Fubini ordered partitions:
1. `[[f2, f3, f4]]`
2. `[[f2], [f3, f4]]` *(f2 before f3, f4)*
3. `[[f3, f4], [f2]]` *(f3, f4 before f2 — modifies anchor structure!)*
4. `[[f3], [f2, f4]]`
5. `[[f4], [f2, f3]]`
6. `[[f2, f3], [f4]]`
7. `[[f2, f4], [f3]]`
8. `[[f2], [f3], [f4]]` *(pure serial f2 -> f3 -> f4)*
9. `[[f2], [f4], [f3]]` *(pure serial f2 -> f4 -> f3)*
10. `[[f3], [f2], [f4]]` *(serial with f3 before f2)*
11. `[[f3], [f4], [f2]]` *(serial with f3, f4 before f2)*
12. `[[f4], [f2], [f3]]` *(serial with f4 before f2)*
13. `[[f4], [f3], [f2]]` *(serial with f4, f3 before f2)*

Because `structOK` in `engine.js` has:
```javascript
if (order.length < 2) return true;
```
when `order = [f2]`, `order.length < 2` is `true`. **All 13 partitions pass filter!**  
This means the code tests combinations where $f_3$ or $f_4$ are placed **in front of** $f_2$, directly modifying the anchor structure.

---

## 4. Codebase Audit: Where the Bugs / Inconsistencies Live

### In `js/engine.js`:

1. **Lines 357–364 (`structOK`):**
   ```javascript
   function structOK(st, order) {
     if (order.length < 2) return true; // <-- ISSUE: allows any partition when order has only 1 VNF
     const idx = new Map();
     st.forEach((s, i) => s.forEach((f) => idx.set(f, i)));
     for (let i = 0; i + 1 < order.length; i++)
       if (!(idx.get(order[i]) < idx.get(order[i + 1]))) return false;
     return true;
   }
   ```
   - **Flaw:** `order` only checks the relative ordering between *pairs of anchor VNFs* (`order[i] < order[i+1]`). It does **not** check whether non-anchor VNFs were inserted in a way that modifies the anchor VNF's stage.

2. **Lines 377–380 (`evaluateAnchor`):**
   ```javascript
   const layerOpts = M.layers.map((layer, li) => {
     const order = anchor.seq.filter((s) => M.V[s.f].layer === li).map((s) => s.f);
     return M.structs[li].filter((st) => structOK(st, order));
   });
   ```
   - **Flaw:** `M.structs[li]` is populated with *all* ordered partitions via `orderedPartitions(l)`. If a layer is partially covered, it still starts with all 13 partitions and filters down with the permissive `structOK`.

3. **Preset D in `data/presets.js`:**
   - In Preset D, Layer 2 has $\{f_2, f_3\}$.
   - Anchor covers $f_2$.
   - `orderedPartitions([f2, f3])` has 3 partitions: `[[f2, f3]]`, `[[f2], [f3]]`, `[[f3], [f2]]`.
   - `structOK` allows all 3 partitions because `order.length === 1`.
   - In the walkthrough UI, it shows 6 evaluated candidate schemes (3 host combos $\times$ 2 or 3 structures).

---

## 5. The Research Gap: Why This Is a Breakthrough Idea for a New Paper

During our research across both papers, we uncovered a significant design trade-off that neither paper resolves:

| Algorithm / Paper | Search Space Strategy | Strengths | Critical Weakness |
|---|---|---|---|
| **Tian et al. (Paper 2, TWC 2023)** | Exhaustive ordered partitions (all Fubini combinations) | Does not miss optimal structure within a group | Exponential complexity; no anchor pruning; slow |
| **Liu et al. / LOA (Paper 1, TON 2026)** | Anchor-path bottleneck pruning; partial groups locked to anchor | Extremely fast ($O(|P| \cdot \prod |\text{group}_h|)$); scalable | **May miss the optimal latency!** By forbidding serial chaining of remaining VNFs relative to the anchor (e.g. $f_2 \to (f_3 \parallel f_4)$), it prunes potential solutions prematurely. |
| **Your Proposed Research Direction (LOA-Extended)** | Full combination exploration within partial groups + DPG anchor pruning & stability | Explores all 13 combinations while retaining LOA's path pruning | Balances solution optimality and runtime efficiency |

### Research Opportunity:
In the next research paper, you can demonstrate:
1. **Benchmark comparison:** Show scenarios where Paper 1's strict 3-combination heuristic fails to find the true minimum-latency parallelization scheme.
2. **Pruned-Full Search (PFS):** Introduce an adaptive search mechanism that tests whether expanding partially-covered groups to the full 13 combinations yields significant latency improvements without violating polynomial runtime bounds.

---

## 6. Step-by-Step Resolution Plan for Next Session

When resuming, follow these concrete implementation steps:

### Step 1: Add Execution Modes to `js/engine.js`
Provide a configurable mode switch so users can compare both behaviors:
- `mode: 'paper-strict'` (Paper 1 strict: 3 combinations for 3-VNF partial layer, parallel insertion only).
- `mode: 'all-combos'` (Tian et al. / Current code: all 13 combinations).

### Step 2: Fix `evaluateAnchor` for Partial Groups in Strict Mode
Implement a helper `getPartialLayerStructures(layer, anchorVnfs)`:
- If `anchorVnfs.length === 0` (Completely Absent): return `orderedPartitions(layer)` (all 13).
- If `anchorVnfs.length === layer.length` (Fully Covered): return `[anchorVnfs.map(f => [f])]` (retained serial/parallel).
- If `0 < anchorVnfs.length < layer.length` (Partially Covered):
  - In strict mode: Only generate structures where non-anchor VNFs run parallel to the anchor VNF stage (e.g., `[[f2, f3, f4]]`, or sub-stages parallel to `f2`).

### Step 3: Update Walkthrough UI (`js/walkthrough.js` & `index.html`)
- Add a toggle in the UI: **"Paper Strict (3 combos)"** vs **"Full Exploration (13 combos)"**.
- In Step 15 of the walkthrough, explain clearly in the explanation card why 3 combos vs 13 combos are shown and cite Page 8 of the IEEE TON paper.

### Step 4: Verify with Presets A, B, C, D
- Run test simulations to confirm that:
  - In `paper-strict` mode, partial groups evaluate only valid parallel insertions.
  - In `all-combos` mode, all 13 combinations are evaluated.
  - Latency and best scheme are compared side-by-side.

---
*End of Handover Document.*
