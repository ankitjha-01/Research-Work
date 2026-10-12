/* =============================================================
   LOA Walkthrough — Preset Configurations
   Globals provided: PRESETS
   ============================================================= */

/* Each preset has:
   - label  : short display name
   - blurb  : one-line description shown in the card
   - cfg    : full configuration object passed to runLOA()
*/
const PRESETS = [
  {
    label: 'Preset D — parallel wins',
    blurb: '4 VNFs, light replication/integration overhead: LOA parallelizes f2 and f3.',
    cfg: {
      nodes: [
        { name: 'A', cap: 40, x: 90,  y: 170 },
        { name: 'B', cap: 60, x: 270, y: 70  },
        { name: 'C', cap: 50, x: 300, y: 170 },
        { name: 'D', cap: 55, x: 270, y: 270 },
        { name: 'E', cap: 40, x: 510, y: 170 },
      ],
      links: [
        { a: 0, b: 4, delay: 18 },
        { a: 0, b: 1, delay: 9  },
        { a: 1, b: 4, delay: 12 },
        { a: 0, b: 2, delay: 10 },
        { a: 2, b: 4, delay: 14 },
        { a: 0, b: 3, delay: 13 },
        { a: 3, b: 4, delay: 15 },
        { a: 1, b: 2, delay: 8  },
        { a: 2, b: 3, delay: 9  },
      ],
      src: 0,
      dst: 4,
      vnfs: [
        { name: 'f1', level: 1, proc: 9,  dem: 20 },
        { name: 'f2', level: 2, proc: 12, dem: 25 },
        { name: 'f3', level: 2, proc: 15, dem: 25 },
        { name: 'f4', level: 3, proc: 10, dem: 30 },
      ],
      trep: 2,
      tint: 1,
      tmax: 200,
      kmax: 1024,
    },
  },
  {
    label: 'Preset E — serial wins',
    blurb: 'Same network, heavy replication/integration overhead: LOA runs everything serially instead.',
    cfg: {
      nodes: [
        { name: 'A', cap: 45, x: 90,  y: 170 },
        { name: 'B', cap: 55, x: 270, y: 70  },
        { name: 'C', cap: 45, x: 300, y: 170 },
        { name: 'D', cap: 40, x: 270, y: 270 },
        { name: 'E', cap: 45, x: 510, y: 170 },
      ],
      links: [
        { a: 0, b: 4, delay: 18 },
        { a: 0, b: 1, delay: 9  },
        { a: 1, b: 4, delay: 12 },
        { a: 0, b: 2, delay: 10 },
        { a: 2, b: 4, delay: 14 },
        { a: 0, b: 3, delay: 13 },
        { a: 3, b: 4, delay: 15 },
        { a: 1, b: 2, delay: 8  },
        { a: 2, b: 3, delay: 9  },
      ],
      src: 0,
      dst: 4,
      vnfs: [
        { name: 'f1', level: 1, proc: 8, dem: 25 },
        { name: 'f2', level: 2, proc: 5, dem: 25 },
        { name: 'f3', level: 2, proc: 8, dem: 25 },
        { name: 'f4', level: 3, proc: 8, dem: 25 },
      ],
      trep: 6,
      tint: 5,
      tmax: 200,
      kmax: 1024,
    },
  },
];
