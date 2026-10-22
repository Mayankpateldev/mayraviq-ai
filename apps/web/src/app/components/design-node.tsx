import type { CanvasNode } from "@mayraviq/contracts/types";
import { palette, size, wrapText } from "@mayraviq/contracts/canvas-design";
export default function DesignNode({
  node: n,
  selected,
  connecting,
  onResize,
}: {
  node: CanvasNode;
  selected: boolean;
  connecting: boolean;
  onResize: (e: React.PointerEvent<SVGRectElement>) => void;
}) {
  const { width: w, height: h } = size(n),
    kind = n.kind || "note",
    drawing =
      ["freehand", "arrow", "line"].includes(kind) && !!n.points?.length,
    shape = ["rectangle", "ellipse", "diamond", "frame", "line"].includes(kind),
    textOnly = kind === "text",
    fill =
      n.fill ??
      (textOnly
        ? "none"
        : kind === "frame"
          ? "#ffffff"
          : palette[n.color as keyof typeof palette] || palette.amber),
    stroke = n.stroke ?? (textOnly ? "none" : "#dae0e8"),
    strokeWidth = n.strokeWidth ?? 1,
    fs = n.fontSize ?? (textOnly ? 24 : 14),
    family =
      n.fontFamily === "serif"
        ? "Georgia, serif"
        : n.fontFamily === "monospace"
          ? "monospace"
          : "Arial, sans-serif",
    align = n.textAlign || "left",
    pad = textOnly ? 0 : 18,
    labelHeight = kind === "note" || kind === "task" ? 35 : 0;
  const lines = wrapText(n.text, w - pad * 2, fs).slice(
      0,
      Math.max(1, Math.floor((h - labelHeight - pad) / (fs * 1.25))),
    ),
    textX = align === "center" ? w / 2 : align === "right" ? w - pad : pad,
    startY = textOnly
      ? fs
      : shape && kind !== "frame"
        ? (h - lines.length * fs * 1.25) / 2 + fs
        : labelHeight + fs + 4;
  return (
    <>
      {drawing ? (
        <g>
          <polyline
            points={n.points!.map(([x, y]) => `${x * w},${y * h}`).join(" ")}
            fill="none"
            stroke={n.stroke || "#334155"}
            strokeWidth={Math.max(1, strokeWidth)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {kind === "arrow" &&
            (() => {
              const end = n.points!.at(-1)!,
                previous = n.points!.at(-2)!;
              const angle = Math.atan2(
                  (end[1] - previous[1]) * h,
                  (end[0] - previous[0]) * w,
                ),
                length = Math.max(10, strokeWidth * 4);
              return (
                <path
                  d={`M ${end[0] * w - length * Math.cos(angle - 0.5)} ${end[1] * h - length * Math.sin(angle - 0.5)} L ${end[0] * w} ${end[1] * h} L ${end[0] * w - length * Math.cos(angle + 0.5)} ${end[1] * h - length * Math.sin(angle + 0.5)}`}
                  fill="none"
                  stroke={n.stroke || "#334155"}
                  strokeWidth={Math.max(1, strokeWidth)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })()}
        </g>
      ) : kind === "ellipse" ? (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={w / 2}
          ry={h / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : kind === "diamond" ? (
        <polygon
          points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : kind === "line" ? (
        <line
          x1="0"
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke={n.stroke || "#7c8597"}
          strokeWidth={Math.max(1, strokeWidth)}
        />
      ) : (
        <rect
          width={w}
          height={h}
          rx={n.radius ?? (textOnly || kind === "frame" ? 0 : 8)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {kind === "frame" && (
        <text
          x="0"
          y="-12"
          fontSize="12"
          fontFamily="Arial, sans-serif"
          fill="#7f8899"
        >
          {n.text || n.name || "Frame"}
        </text>
      )}
      {(kind === "note" || kind === "task") && (
        <text
          x="18"
          y="25"
          fill="#7b8091"
          fontFamily="Arial, sans-serif"
          fontSize="10"
          letterSpacing="1.3"
        >
          {kind === "task" ? (n.done ? "✓ COMPLETED" : "□ NEXT STEP") : "IDEA"}
        </text>
      )}
      {kind !== "frame" &&
        !["line", "arrow", "freehand"].includes(kind) &&
        lines.map((line, i) => (
          <text
            key={i}
            x={textX}
            y={startY + i * fs * 1.25}
            textAnchor={
              align === "center"
                ? "middle"
                : align === "right"
                  ? "end"
                  : "start"
            }
            fontSize={fs}
            fontFamily={family}
            fontWeight={n.fontWeight ?? 400}
            fill={n.textColor || "#263247"}
            textDecoration={n.done ? "line-through" : undefined}
          >
            {line}
          </text>
        ))}
      {/* Transparent hit region keeps empty shapes and text selectable. */}
      <rect
        width={w}
        height={Math.max(12, h)}
        fill="transparent"
        stroke="none"
      />
      {(selected || connecting) && (
        <g data-editor="true">
          <rect
            x="-2"
            y="-2"
            width={w + 4}
            height={Math.max(12, h) + 4}
            fill="none"
            stroke="#6658ed"
            strokeWidth="1.5"
            strokeDasharray={n.locked ? "4 3" : undefined}
          />
          {selected && !n.locked && (
            <rect
              role="button"
              tabIndex={0}
              aria-label={"Resize " + (n.name || n.text || "element")}
              x={w - 5}
              y={h - 5}
              width="10"
              height="10"
              rx="1"
              fill="#fff"
              stroke="#6658ed"
              strokeWidth="1.5"
              style={{ cursor: "nwse-resize" }}
              onPointerDown={onResize}
            />
          )}
        </g>
      )}
    </>
  );
}
