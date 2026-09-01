/**
 * Dependency-graph helpers — used by `container.analyze()` for debug + by
 * the registration phase (future) for proactive cycle detection.
 *
 * Iterative DFS, NOT recursive, so large graphs (100+ nodes)
 * with multiple cycles don't blow the call stack.
 */

import type { Scope, Token } from "../types.js";

export interface GraphNode {
  readonly token: Token;
  readonly scope: Scope;
  readonly isAsync: boolean;
}

export interface GraphEdge {
  readonly from: Token;
  readonly to: Token;
}

interface GraphSnapshot {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
}

/**
 * Find ALL distinct cycles in a directed graph using iterative DFS
 * (Tarjan-style SCC would be overkill for our scale). Returns each cycle
 * as a list of tokens in resolution order, ending at the cycle's first
 * token.
 */
export function findCycles(snapshot: GraphSnapshot): ReadonlyArray<ReadonlyArray<Token>> {
  const adjacency = new Map<Token, Token[]>();
  for (const edge of snapshot.edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }

  const cycles: Token[][] = [];
  const seenCycles = new Set<string>();
  const visited = new Set<Token>();
  // Identity table for the whole run, NOT per walk: two cycles found under
  // different roots must compare against the same numbering or the key means
  // nothing across them.
  const tokenIds = new Map<Token, number>();

  for (const node of snapshot.nodes) {
    if (visited.has(node.token)) continue;
    iterativeDfs(node.token, adjacency, visited, cycles, seenCycles, tokenIds);
  }

  return cycles;
}

function iterativeDfs(
  root: Token,
  adjacency: Map<Token, Token[]>,
  visited: Set<Token>,
  out: Token[][],
  seenCycles: Set<string>,
  tokenIds: Map<Token, number>,
): void {
  // Each frame on the stack: { node, neighbors, index into neighbors }.
  interface Frame {
    node: Token;
    neighbors: ReadonlyArray<Token>;
    next: number;
  }
  const stack: Frame[] = [];
  const onPath = new Set<Token>();
  const pathOrder: Token[] = [];

  function push(node: Token): void {
    if (visited.has(node)) return;
    visited.add(node);
    onPath.add(node);
    pathOrder.push(node);
    stack.push({
      node,
      neighbors: adjacency.get(node) ?? [],
      next: 0,
    });
  }

  push(root);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as Frame;
    if (frame.next >= frame.neighbors.length) {
      onPath.delete(frame.node);
      pathOrder.pop();
      stack.pop();
      continue;
    }
    const neighbor = frame.neighbors[frame.next] as Token;
    frame.next += 1;

    if (onPath.has(neighbor)) {
      // Cycle found from `neighbor` (the back edge target) along pathOrder.
      const cycleStart = pathOrder.indexOf(neighbor);
      const cycle = [...pathOrder.slice(cycleStart), neighbor];
      // Dedupe — same cycle starting from different nodes.
      const key = canonicalCycleKey(cycle, tokenIds);
      if (!seenCycles.has(key)) {
        seenCycles.add(key);
        out.push(cycle);
      }
    } else if (!visited.has(neighbor)) {
      push(neighbor);
    }
  }
}

/**
 * A key that identifies a cycle by the tokens in it, independent of which node
 * the walk entered on.
 *
 * KEYED ON IDENTITY, NEVER ON A LABEL. Until 2026-09-01 this built the key out
 * of `stringifyToken`, which renders a token for a human to read. A rendering is
 * not an identity: two DIFFERENT classes that share a `name` produced the same
 * key, and the second cycle was discarded as a duplicate of the first. Two files
 * each declaring `class Logger` and `class Service` was enough — so was any two
 * anonymous classes, or any two symbols. `analyze()` reported one cycle and
 * dropped the other with nothing to say it had (#59).
 *
 * `stringifyToken`, the renderer that built those keys, had no other caller and
 * was removed with them. Rendering a token for a message is `describeToken` in
 * `errors.ts` — exported, and the one place that knowledge lives.
 *
 * MEASURED, AND WORTH KNOWING BEFORE TOUCHING THIS: with `visited` shared across
 * roots in `findCycles`, every node is pushed at most once, so every node's
 * neighbour list is walked at most once, so every back edge yields at most one
 * report. The de-duplication therefore has no true positives — instrumented over
 * the whole suite on 2026-09-01, it fired three times and all three were the
 * defect above. It is kept rather than deleted because a correct key costs
 * nothing and a wrong absence would surface as duplicate output; if `visited`
 * ever stops being shared, this is what stops the same cycle being listed twice.
 */
function canonicalCycleKey(cycle: ReadonlyArray<Token>, tokenIds: Map<Token, number>): string {
  const ids = cycle.map((token) => {
    let id = tokenIds.get(token);
    if (id === undefined) {
      id = tokenIds.size;
      tokenIds.set(token, id);
    }
    return id;
  });
  // Rotate so the smallest id is first — the same rotation as before, over
  // values that distinguish tokens instead of describing them.
  let minIndex = 0;
  for (let i = 1; i < ids.length; i += 1) {
    if ((ids[i] as number) < (ids[minIndex] as number)) {
      minIndex = i;
    }
  }
  return [...ids.slice(minIndex), ...ids.slice(0, minIndex)].join("→");
}
