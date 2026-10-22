import type { CanvasNode } from "./types";
export const BOARD_WIDTH = 1600,
  BOARD_HEIGHT = 1000;
export const palette = {
  blue: "#edf1ff",
  teal: "#e5f7f0",
  violet: "#f3eaff",
  amber: "#fff4cf",
};
export function size(n: CanvasNode) {
  return {
    width:
      n.width ?? (n.kind === "line" ? 240 : n.kind === "frame" ? 720 : 210),
    height:
      n.height ??
      (n.kind === "line"
        ? 2
        : n.kind === "frame"
          ? 480
          : n.kind === "text"
            ? 80
            : 140),
  };
}
export function constrain(n: CanvasNode): CanvasNode {
  const s = size(n),
    width = Math.max(2, Math.min(BOARD_WIDTH, s.width)),
    height = Math.max(2, Math.min(BOARD_HEIGHT, s.height));
  return {
    ...n,
    ...(n.width !== undefined ? { width } : {}),
    ...(n.height !== undefined ? { height } : {}),
    x: Math.max(0, Math.min(BOARD_WIDTH - width, n.x)),
    y: Math.max(0, Math.min(BOARD_HEIGHT - height, n.y)),
  };
}
export function alignNodes(nodes: CanvasNode[], ids: string[], mode: string) {
  const selected = nodes.filter(
    (n) => ids.includes(n.id) && !isLocked(nodes, n),
  );
  if (selected.length < 2) return nodes;
  const left = Math.min(...selected.map((n) => n.x)),
    top = Math.min(...selected.map((n) => n.y)),
    right = Math.max(...selected.map((n) => n.x + size(n).width)),
    bottom = Math.max(...selected.map((n) => n.y + size(n).height));
  return nodes.map((n) =>
    !selected.includes(n)
      ? n
      : constrain({
          ...n,
          x:
            mode === "left"
              ? left
              : mode === "right"
                ? right - size(n).width
                : mode === "center"
                  ? (left + right - size(n).width) / 2
                  : n.x,
          y:
            mode === "top"
              ? top
              : mode === "bottom"
                ? bottom - size(n).height
                : mode === "middle"
                  ? (top + bottom - size(n).height) / 2
                  : n.y,
        }),
  );
}
export function distributeNodes(
  nodes: CanvasNode[],
  ids: string[],
  axis: "x" | "y",
) {
  const selected = nodes
    .filter((n) => ids.includes(n.id) && !isLocked(nodes, n))
    .sort((a, b) => a[axis] - b[axis]);
  if (selected.length < 3) return nodes;
  const measure = axis === "x" ? "width" : "height",
    start = selected[0][axis],
    end = selected.at(-1)![axis] + size(selected.at(-1)!)[measure],
    gap =
      (end - start - selected.reduce((sum, n) => sum + size(n)[measure], 0)) /
      (selected.length - 1);
  let cursor = start;
  const positions = new Map<string, number>();
  for (const n of selected) {
    positions.set(n.id, cursor);
    cursor += size(n)[measure] + gap;
  }
  return nodes.map((n) =>
    positions.has(n.id) ? constrain({ ...n, [axis]: positions.get(n.id)! }) : n,
  );
}
export function wrapText(text: string, width: number, fontSize: number) {
  const limit = Math.max(1, Math.floor(width / (fontSize * 0.58)));
  return text.split("\n").flatMap((line) => {
    const lines: string[] = [];
    let current = "";
    for (const word of line.split(" ")) {
      if (current.length + word.length + 1 > limit && current) {
        lines.push(current);
        current = "";
      }
      if (word.length > limit) {
        if (current) {
          lines.push(current);
          current = "";
        }
        for (let i = 0; i < word.length; i += limit) {
          const chunk = word.slice(i, i + limit);
          if (chunk.length === limit) lines.push(chunk);
          else current = chunk;
        }
      } else current += (current ? " " : "") + word;
    }
    lines.push(current);
    return lines;
  });
}
export function wireframeTemplate(): CanvasNode[] {
  const make = (
    kind: CanvasNode["kind"],
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill = "#ffffff",
    extra: Partial<CanvasNode> = {},
  ): CanvasNode => ({
    id: crypto.randomUUID(),
    kind,
    name,
    text,
    x,
    y,
    width,
    height,
    color: "blue",
    fill,
    stroke: "#e2e6ef",
    strokeWidth: kind === "text" ? 0 : 1,
    ...extra,
  });
  const nodes = [
    make(
      "frame",
      "Desktop frame",
      "Desktop · Landing page",
      100,
      100,
      1050,
      740,
      "#ffffff",
    ),
    make("rectangle", "Navigation bar", "", 130, 130, 990, 65, "#f7f8fc", {
      radius: 8,
    }),
    make("text", "Brand", "Mayraviq", 155, 147, 210, 35, "#ffffff", {
      fontSize: 22,
      fontWeight: 700,
      textColor: "#252a40",
    }),
    make(
      "text",
      "Navigation links",
      "Product     Workspace     About",
      730,
      153,
      350,
      28,
      "#ffffff",
      { fontSize: 14, textColor: "#768095" },
    ),
    make(
      "text",
      "Hero headline",
      "Make space for\nyour next big idea.",
      170,
      275,
      570,
      140,
      "#ffffff",
      { fontSize: 44, fontWeight: 700, textColor: "#252a40" },
    ),
    make(
      "text",
      "Hero description",
      "A shared place to discuss, design and move your work forward.",
      172,
      440,
      470,
      76,
      "#ffffff",
      { fontSize: 18, textColor: "#7a8498" },
    ),
    make(
      "rectangle",
      "Primary button",
      "Get started",
      172,
      548,
      170,
      48,
      "#6658ed",
      {
        radius: 8,
        textColor: "#ffffff",
        fontSize: 15,
        fontWeight: 700,
        textAlign: "center",
        strokeWidth: 0,
      },
    ),
    make(
      "rectangle",
      "Visual placeholder",
      "Your product visual",
      780,
      280,
      280,
      320,
      "#f0edfb",
      { radius: 18, textColor: "#8d7ca8", textAlign: "center", fontSize: 17 },
    ),
    make(
      "rectangle",
      "Feature card 1",
      "Connect your team",
      172,
      690,
      270,
      100,
      "#f7f8fc",
      { radius: 10, fontSize: 17, fontWeight: 700 },
    ),
    make(
      "rectangle",
      "Feature card 2",
      "Shape your ideas",
      480,
      690,
      270,
      100,
      "#f7f8fc",
      { radius: 10, fontSize: 17, fontWeight: 700 },
    ),
    make(
      "rectangle",
      "Feature card 3",
      "Keep moving forward",
      788,
      690,
      270,
      100,
      "#f7f8fc",
      { radius: 10, fontSize: 17, fontWeight: 700 },
    ),
  ];
  return nodes.map((n, i) => (i ? { ...n, frameId: nodes[0].id } : n));
}

export function expandSelection(nodes: CanvasNode[], ids: string[]) {
  return nodes
    .filter(
      (n) => ids.includes(n.id) || (!!n.frameId && ids.includes(n.frameId)),
    )
    .map((n) => n.id);
}
export function frameFor(nodes: CanvasNode[], n: CanvasNode) {
  if (n.kind === "frame") return undefined;
  const { width, height } = size(n);
  return [...nodes]
    .reverse()
    .find(
      (f) =>
        f.kind === "frame" &&
        n.x + width / 2 >= f.x &&
        n.x + width / 2 <= f.x + size(f).width &&
        n.y + height / 2 >= f.y &&
        n.y + height / 2 <= f.y + size(f).height,
    )?.id;
}
export function isHidden(nodes: CanvasNode[], n: CanvasNode) {
  return (
    !!n.hidden ||
    (!!n.frameId && !!nodes.find((f) => f.id === n.frameId)?.hidden)
  );
}
export function isLocked(nodes: CanvasNode[], n: CanvasNode) {
  return (
    !!n.locked ||
    (!!n.frameId && !!nodes.find((f) => f.id === n.frameId)?.locked)
  );
}
export function moveElements(
  nodes: CanvasNode[],
  ids: string[],
  dx: number,
  dy: number,
) {
  const selected = nodes.filter(
    (n) => expandSelection(nodes, ids).includes(n.id) && !isLocked(nodes, n),
  );
  if (!selected.length) return nodes;
  const offsetX = Math.max(
      -Math.min(...selected.map((n) => n.x)),
      Math.min(
        BOARD_WIDTH - Math.max(...selected.map((n) => n.x + size(n).width)),
        dx,
      ),
    ),
    offsetY = Math.max(
      -Math.min(...selected.map((n) => n.y)),
      Math.min(
        BOARD_HEIGHT - Math.max(...selected.map((n) => n.y + size(n).height)),
        dy,
      ),
    );
  return nodes.map((n) =>
    selected.includes(n) ? { ...n, x: n.x + offsetX, y: n.y + offsetY } : n,
  );
}

/** Bound and normalize a gesture so moving/resizing uses the same geometry as shapes. */
export function sketchNode(
  kind:
    | "freehand"
    | "arrow"
    | "line"
    | "rectangle"
    | "ellipse"
    | "diamond"
    | "frame",
  input: [number, number][],
  id: string,
  stroke: string,
  strokeWidth: number,
): CanvasNode {
  const points = input.map(
    ([x, y]) =>
      [
        Math.max(0, Math.min(BOARD_WIDTH, x)),
        Math.max(0, Math.min(BOARD_HEIGHT, y)),
      ] as [number, number],
  );
  const x = Math.min(...points.map((p) => p[0])),
    y = Math.min(...points.map((p) => p[1]));
  const width = Math.max(2, Math.max(...points.map((p) => p[0])) - x),
    height = Math.max(2, Math.max(...points.map((p) => p[1])) - y);
  const path = kind === "freehand" || kind === "arrow" || kind === "line";
  const sampled = points.filter(
    (_, i) =>
      i === points.length - 1 ||
      i % Math.max(1, Math.ceil(points.length / 255)) === 0,
  );
  return constrain({
    id,
    kind,
    text: "",
    name:
      kind === "freehand" ? "Sketch" : kind[0].toUpperCase() + kind.slice(1),
    x,
    y,
    width,
    height,
    color: "blue",
    stroke,
    strokeWidth,
    fill: "#ffffff",
    radius: kind === "rectangle" ? 8 : 0,
    ...(path
      ? {
          points: sampled.map(
            (p) =>
              [
                Math.round(((p[0] - x) / width) * 1000) / 1000,
                Math.round(((p[1] - y) / height) * 1000) / 1000,
              ] as [number, number],
          ),
        }
      : {}),
  });
}
