import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeBoards,
  CanvasConflict,
} from "../../packages/contracts/src/canvas-merge.ts";
const a = { id: "a", text: "A", x: 10, y: 10, color: "blue" },
  b = { id: "b", text: "B", x: 300, y: 10, color: "teal" };
const base = { nodes: [a, b], edges: [] };
test("Different objects and fields reconcile without overwriting peer edits", () => {
  const local = { nodes: [{ ...a, text: "Updated" }, b], edges: [] };
  const remote = { nodes: [a, { ...b, x: 350 }], edges: [] };
  const result = mergeBoards(base, local, remote);
  assert.equal(result.nodes.find((n) => n.id === "a").text, "Updated");
  assert.equal(result.nodes.find((n) => n.id === "b").x, 350);
  const fields = mergeBoards(
    base,
    { nodes: [{ ...a, x: 30 }, b], edges: [] },
    { nodes: [{ ...a, text: "Other" }, b], edges: [] },
  );
  assert.equal(fields.nodes[0].x, 30);
  assert.equal(fields.nodes[0].text, "Other");
});
test("Concurrent conflicting fields, delete/edit and ID collisions require review", () => {
  assert.throws(
    () =>
      mergeBoards(
        base,
        { nodes: [{ ...a, text: "Mine" }, b], edges: [] },
        { nodes: [{ ...a, text: "Theirs" }, b], edges: [] },
      ),
    CanvasConflict,
  );
  assert.throws(
    () =>
      mergeBoards(
        base,
        { nodes: [b], edges: [] },
        { nodes: [{ ...a, x: 20 }, b], edges: [] },
      ),
    CanvasConflict,
  );
  assert.throws(
    () =>
      mergeBoards(
        { nodes: [], edges: [] },
        { nodes: [a], edges: [] },
        { nodes: [{ ...a, text: "Collision" }], edges: [] },
      ),
    CanvasConflict,
  );
  assert.deepEqual(mergeBoards(base, base, { nodes: [b], edges: [] }), {
    nodes: [b],
    edges: [],
  });
});
test("Identical updates and disjoint additions converge after persistence", () => {
  const changed = { nodes: [{ ...a, text: "Same" }, b], edges: [] };
  assert.deepEqual(mergeBoards(base, changed, changed), changed);
  const local = { nodes: [...base.nodes, { ...a, id: "c" }], edges: [] },
    remote = { nodes: [...base.nodes, { ...b, id: "d" }], edges: [] };
  assert.equal(mergeBoards(base, local, remote).nodes.length, 4);
});
