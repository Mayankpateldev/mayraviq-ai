import { mergeBoards, CanvasConflict } from "@mayraviq/contracts/canvas-merge";
import { canvasInput } from "@mayraviq/contracts/canvas-schema";
import {
  size,
  BOARD_WIDTH,
  BOARD_HEIGHT,
} from "@mayraviq/contracts/canvas-design";
import type { CanvasNode, CanvasEdge } from "@mayraviq/contracts/types";
import { RequestError } from "./api-boundary";
type Saved = { nodes: string; edges: string; version: number };
type Input = {
  nodes: CanvasNode[];
  edges?: CanvasEdge[];
  version: number;
  base?: { nodes: CanvasNode[]; edges?: CanvasEdge[] };
};
export function reconcileCanvas(
  input: Input,
  current: Saved,
  projectId: string,
) {
  if (input.version > current.version)
    throw new RequestError("Canvas version is ahead of the server.", 409);
  const invalidStatus = input.version === current.version ? 400 : 409;
  let board = {
    nodes: input.nodes,
    edges: input.edges ?? JSON.parse(current.edges),
  };
  if (input.version !== current.version) {
    if (!input.base)
      throw new RequestError(
        "Canvas changed elsewhere. Reload before saving.",
        409,
      );
    try {
      board = mergeBoards(
        { nodes: input.base.nodes, edges: input.base.edges || [] },
        board,
        { nodes: JSON.parse(current.nodes), edges: JSON.parse(current.edges) },
      );
    } catch (error) {
      throw new RequestError(
        error instanceof CanvasConflict
          ? error.message + " Your draft has been kept."
          : "Canvas could not be reconciled.",
        409,
      );
    }
  }
  const parsed = canvasInput.safeParse({
    action: "canvas",
    projectId,
    version: current.version,
    ...board,
  });
  if (!parsed.success)
    throw new RequestError("Merged canvas exceeds the supported limits.", 409);
  const { nodes, edges = [] } = parsed.data;
  if (
    new Set(nodes.map((n) => n.id)).size !== nodes.length ||
    new Set(edges.map((e) => e.id)).size !== edges.length ||
    nodes.some(
      (n) =>
        n.x + size(n).width > BOARD_WIDTH ||
        n.y + size(n).height > BOARD_HEIGHT ||
        (n.frameId &&
          (n.kind === "frame" ||
            !nodes.some((f) => f.id === n.frameId && f.kind === "frame"))),
    ) ||
    edges.some(
      (e) =>
        e.from === e.to ||
        !nodes.some((n) => n.id === e.from) ||
        !nodes.some((n) => n.id === e.to),
    )
  )
    throw new RequestError(
      "Canvas changes conflict with an element or connection. Your draft has been kept.",
      invalidStatus,
    );
  return parsed.data;
}
