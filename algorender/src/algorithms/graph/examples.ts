// Hand-placed example graphs shared by several algorithms, so learners can run
// BFS and DFS (or Prim and Kruskal) on the very same picture and compare.

/** Eight towns, two routes round: BFS and DFS visit them in very different orders. */
export const NETWORK_EDGES = 'A-B, A-C, B-C, B-D, C-E, D-F, E-F, F-G, F-H, G-H';
export const NETWORK_AT = {
  A: [0, 80],
  B: [90, 10],
  C: [90, 150],
  D: [200, 10],
  E: [200, 150],
  F: [290, 80],
  G: [390, 10],
  H: [390, 150],
} as const;

/** Two clusters with no edge between them. */
export const COMPONENTS_EDGES = 'A-B, A-C, B-C, C-D, E-F, F-G, E-G';
export const COMPONENTS_AT = {
  A: [0, 20],
  B: [100, 0],
  C: [60, 110],
  D: [150, 150],
  E: [270, 20],
  F: [370, 60],
  G: [280, 140],
} as const;

/** One-way streets: a directed graph with a cycle, where not everything is reachable from every node. */
export const ONE_WAY_EDGES = 'A>B, A>D, B>C, C>A, C>E, D>E, E>F, F>D, G>F';
export const ONE_WAY_AT = {
  A: [0, 80],
  B: [100, 0],
  C: [100, 160],
  D: [210, 80],
  E: [210, 220],
  F: [320, 150],
  G: [400, 40],
} as const;

/** Six towns with a classic weighted network: a minimum spanning tree has 5 of its 9 edges. */
export const CLASSIC_MST_EDGES = 'A-B:7, A-C:9, A-F:14, B-C:8, B-D:15, C-D:11, C-F:2, D-E:6, E-F:9';
export const CLASSIC_MST_AT = {
  A: [0, 90],
  B: [100, 0],
  C: [130, 120],
  D: [270, 10],
  E: [330, 150],
  F: [180, 220],
} as const;

/** Three strongly connected components: {A, B, C}, {D, E, F} and {G, H}. */
export const SCC_EDGES = 'A>B, B>C, C>A, B>D, D>E, E>F, F>D, G>F, G>H, H>G';
export const SCC_AT = {
  A: [0, 0],
  B: [120, 0],
  C: [60, 110],
  D: [240, 0],
  E: [360, 0],
  F: [300, 110],
  G: [200, 210],
  H: [350, 220],
} as const;

/** Everything reaches everything: one component. */
export const STRONG_EDGES = 'A>B, B>C, C>D, D>E, E>A, B>E, D>B';
export const STRONG_AT = { A: [0, 70], B: [110, 0], C: [230, 30], D: [230, 150], E: [110, 170] } as const;

/** A DAG: no cycles, so every node is its own component. */
export const DAG_EDGES = 'A>B, A>C, B>D, C>D, D>E';
export const DAG_AT = { A: [0, 80], B: [110, 0], C: [110, 160], D: [220, 80], E: [330, 80] } as const;
