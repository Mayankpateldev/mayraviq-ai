import type { CanvasNode, CanvasEdge } from "./types";
export type Board = { nodes: CanvasNode[]; edges: CanvasEdge[] };
export class CanvasConflict extends Error {}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(
    a,
    a && typeof a === "object" ? Object.keys(a).sort() : undefined,
  ) ===
  JSON.stringify(
    b,
    b && typeof b === "object" ? Object.keys(b).sort() : undefined,
  );
function mergeEntities<T extends { id: string }>(
  base: T[],
  local: T[],
  remote: T[],
): T[] {
  const before = new Map(base.map((n) => [n.id, n])),
    mine = new Map(local.map((n) => [n.id, n])),
    theirs = new Map(remote.map((n) => [n.id, n]));
  const result: T[] = [];
  for (const id of new Set([
    ...theirs.keys(),
    ...mine.keys(),
    ...before.keys(),
  ])) {
    const b = before.get(id),
      l = mine.get(id),
      r = theirs.get(id);
    if (same(l, b)) {
      if (r) result.push(r);
      continue;
    }
    if (same(r, b) || same(l, r)) {
      if (l) result.push(l);
      continue;
    }
    if (!b || !l || !r)
      throw new CanvasConflict(
        "An element was changed or removed by another editor.",
      );
    const merged = { ...r } as Record<string, unknown>;
    const original = b as Record<string, unknown>,
      own = l as Record<string, unknown>,
      other = r as Record<string, unknown>;
    for (const key of new Set([
      ...Object.keys(original),
      ...Object.keys(own),
    ])) {
      if (same(own[key], original[key])) continue;
      if (!same(other[key], original[key]) && !same(other[key], own[key]))
        throw new CanvasConflict(
          "The same element property changed in another editor.",
        );
      if (own[key] === undefined) delete merged[key];
      else merged[key] = own[key];
    }
    result.push(merged as T);
  }
  return result;
}
/** Three-way reconciliation, not last-write-wins. Conflicting fields require review. */
export function mergeBoards(base: Board, local: Board, remote: Board): Board {
  return {
    nodes: mergeEntities(base.nodes, local.nodes, remote.nodes),
    edges: mergeEntities(base.edges, local.edges, remote.edges),
  };
}
