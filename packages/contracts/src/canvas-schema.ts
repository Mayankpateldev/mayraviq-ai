import { z } from "zod";
const id = z.string().min(1).max(100),
  version = z.number().int().nonnegative();
const canvasFields = z.object({
  action: z.literal("canvas"),
  projectId: id,
  version,
  nodes: z
    .array(
      z.object({
        id,
        text: z.string().max(240),
        x: z.number().min(0).max(1598),
        y: z.number().min(0).max(998),
        color: z.enum(["blue", "teal", "violet", "amber"]),
        kind: z
          .enum([
            "note",
            "task",
            "text",
            "rectangle",
            "ellipse",
            "diamond",
            "frame",
            "line",
            "arrow",
            "freehand",
          ])
          .optional(),
        points: z
          .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
          .min(2)
          .max(256)
          .optional(),
        name: z.string().max(80).optional(),
        frameId: id.optional(),
        width: z.number().min(2).max(1600).optional(),
        height: z.number().min(2).max(1000).optional(),
        fill: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        stroke: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        textColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        strokeWidth: z.number().min(0).max(20).optional(),
        radius: z.number().min(0).max(100).optional(),
        fontSize: z.number().min(8).max(96).optional(),
        fontFamily: z.enum(["sans", "serif", "monospace"]).optional(),
        fontWeight: z.number().int().min(400).max(700).optional(),
        textAlign: z.enum(["left", "center", "right"]).optional(),
        locked: z.boolean().optional(),
        hidden: z.boolean().optional(),
        done: z.boolean().optional(),
      }),
    )
    .max(200)
    .refine(
      (nodes) =>
        nodes.reduce((sum, n) => sum + (n.points?.length || 0), 0) <= 2000,
      "Drawing point limit reached",
    ),
  edges: z
    .array(z.object({ id, from: id, to: id, label: z.string().max(80) }))
    .max(200)
    .optional(),
});

export const canvasInput = canvasFields.extend({
  base: canvasFields.pick({ nodes: true, edges: true }).optional(),
});
