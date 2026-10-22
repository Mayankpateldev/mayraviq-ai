import assert from "node:assert/strict";
import {
  moveElements,
  size,
  alignNodes,
  distributeNodes,
  wrapText,
  wireframeTemplate,
  isHidden,
  isLocked,
} from "../../packages/contracts/src/canvas-design.ts";
const frame = {
  id: "f",
  text: "Frame",
  kind: "frame",
  x: 100,
  y: 100,
  width: 800,
  height: 600,
  color: "blue",
};
const child = {
  id: "a",
  text: "A",
  kind: "text",
  frameId: "f",
  x: 200,
  y: 200,
  width: 200,
  height: 60,
  color: "blue",
};
const moved = moveElements([frame, child], ["f"], 2000, 2000);
assert.equal(moved[1].x - moved[0].x, 100);
assert.equal(moved[1].y - moved[0].y, 100);
assert.equal(moved[0].x + size(moved[0]).width, 1600);
assert.equal(moved[0].y + size(moved[0]).height, 1000);
assert.deepEqual(
  moveElements([{ ...frame, locked: true }, child], ["f"], 10, 10),
  [{ ...frame, locked: true }, child],
);
assert(isHidden([{ ...frame, hidden: true }, child], child));
assert(isLocked([{ ...frame, locked: true }, child], child));
const siblings = [0, 1, 2].map((i) => ({
  ...child,
  id: String(i),
  frameId: undefined,
  x: [20, 100, 600][i],
  y: 50 + i * 20,
}));
const aligned = alignNodes(siblings, ["0", "1", "2"], "bottom");
assert.equal(new Set(aligned.map((n) => n.y + size(n).height)).size, 1);
const distributed = distributeNodes(siblings, ["0", "1", "2"], "x");
assert.equal(
  distributed[1].x - distributed[0].x,
  distributed[2].x - distributed[1].x,
);
assert(wrapText("averylongwordwithoutspaces", 40, 20).length > 1);
const template = wireframeTemplate();
assert(
  template.filter((n) => n.kind === "text").every((n) => n.strokeWidth === 0),
);
assert(template.slice(1).every((n) => n.frameId === template[0].id));
console.log(
  "12 design checks passed: grouped movement, boundaries, inherited visibility/locks, alignment, spacing, wrapping and frame template.",
);
