import test from "node:test";
import assert from "node:assert/strict";
import {
  sketchNode,
  constrain,
} from "../../packages/contracts/src/canvas-design.ts";
import { canvasInput } from "../../packages/contracts/src/canvas-schema.ts";
test("Sketch geometry preserves reverse arrows, bounds strokes and survives resize", () => {
  const arrow = sketchNode(
    "arrow",
    [
      [400, 300],
      [100, 80],
    ],
    "arrow",
    "#334155",
    4,
  );
  assert.equal(arrow.x, 100);
  assert.equal(arrow.y, 80);
  assert.deepEqual(arrow.points, [
    [1, 1],
    [0, 0],
  ]);
  const resized = constrain({ ...arrow, width: 600, height: 440 });
  assert.deepEqual(resized.points, arrow.points);
  const dense = sketchNode(
    "freehand",
    Array.from({ length: 1500 }, (_, i) => [i, Math.sin(i / 40) * 50 + 200]),
    "stroke",
    "#334155",
    2,
  );
  assert(dense.points.length <= 256);
  assert(dense.points.length >= 2);
  const result = canvasInput.parse({
    action: "canvas",
    projectId: "test",
    version: 0,
    nodes: [arrow, dense],
    edges: [],
  });
  assert.deepEqual(result.nodes[1].points, dense.points);
  assert(
    !canvasInput.safeParse({
      ...result,
      nodes: [
        {
          ...arrow,
          points: [
            [0, 0],
            [2, 1],
          ],
        },
      ],
    }).success,
  );
  assert(
    !canvasInput.safeParse({
      ...result,
      nodes: [
        {
          ...arrow,
          points: [
            [0, 0],
            [NaN, 1],
          ],
        },
      ],
    }).success,
  );
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...dense,
    id: "stroke-" + i,
  }));
  assert(
    !canvasInput.safeParse({ ...result, nodes: many }).success,
    "Bound total stroke data as well as individual points",
  );
});
