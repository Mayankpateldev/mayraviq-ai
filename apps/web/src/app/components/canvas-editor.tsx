import { mergeBoards } from "@mayraviq/contracts/canvas-merge";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  Pencil,
  Hand,
  Eraser,
  Expand,
  Shrink,
  StickyNote,
  Type,
  CheckSquare,
  GitBranch,
  Plus,
  Minus,
  Maximize,
  Undo2,
  Redo2,
  Save,
  Download,
  Trash2,
  X,
  LayoutTemplate,
  Check,
  ArrowRight,
  Square,
  Circle,
  Diamond,
  Frame,
  Layers,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type {
  Project,
  CanvasNode,
  CanvasEdge,
} from "@mayraviq/contracts/types";
import DesignNode from "./design-node";
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  palette,
  size,
  constrain,
  alignNodes,
  distributeNodes,
  wireframeTemplate,
  expandSelection,
  frameFor,
  isHidden,
  isLocked,
  moveElements,
  sketchNode,
} from "@mayraviq/contracts/canvas-design";
import "./design-canvas.css";
type Board = { nodes: CanvasNode[]; edges: CanvasEdge[] };
const colors = {
  blue: "#edf1ff",
  teal: "#e5f7f0",
  violet: "#f3eaff",
  amber: "#fff4cf",
};
export default function CanvasEditor({
  project,
  canvas,
  mutate,
  busy,
  setDirty,
  onPreview,
  context = "project",
}: {
  context?: "project" | "room";
  project: Project;
  canvas: { nodes: string; edges?: string; version: number };
  mutate: (
    payload: Record<string, unknown>,
    message?: string,
  ) => Promise<boolean>;
  busy: boolean;
  setDirty: (v: boolean) => void;
  onPreview?: (board: Board) => void;
}) {
  const initial: Board = {
    nodes: JSON.parse(canvas.nodes),
    edges: JSON.parse(canvas.edges || "[]"),
  };
  const [board, setBoard] = useState<Board>(initial),
    [savedBoard, setSavedBoard] = useState<Board>(initial),
    [savedVersion, setSavedVersion] = useState(canvas.version),
    [selection, setSelection] = useState<string[]>([]),
    [layers, setLayers] = useState(false),
    [snap, setSnap] = useState(true),
    [past, setPast] = useState<Board[]>([]),
    [future, setFuture] = useState<Board[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [tool, setTool] = useState("select"),
    [zoom, setZoom] = useState(1),
    [from, setFrom] = useState<string | null>(null),
    [list, setList] = useState(false),
    [templates, setTemplates] = useState(false),
    [liveSave, setLiveSave] = useState(context === "room"),
    [syncError, setSyncError] = useState(""),
    [savingLocal, setSavingLocal] = useState(false),
    [gestureActive, setGestureActive] = useState(false),
    [marquee, setMarquee] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null),
    [stroke, setStroke] = useState("#334155"),
    [strokeWidth, setStrokeWidth] = useState(2),
    [expanded, setExpanded] = useState(false),
    [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const space = useRef(false),
    suppressClick = useRef(false),
    gesture = useRef<{
      mode: string;
      id: string;
      points: [number, number][];
      before: Board;
      left: number;
      top: number;
      clientX: number;
      clientY: number;
      erase: string[];
    } | null>(null),
    inlineText = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing?.id) inlineText.current?.focus();
  }, [editing]);
  useEffect(() => {
    const release = () => {
      space.current = false;
    };
    window.addEventListener("blur", release);
    window.addEventListener("keyup", release);
    return () => {
      window.removeEventListener("blur", release);
      window.removeEventListener("keyup", release);
    };
  }, []);

  const saveInFlight = useRef(false);
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{
      id: string;
      ids: string[];
      mode: "move" | "resize";
      x: number;
      y: number;
      before: Board;
    } | null>(null);
  const fitView = () => {
    const area = svg.current?.parentElement;
    if (!area) return;
    const style = getComputedStyle(area);
    const width =
      area.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const height =
      area.clientHeight -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom);
    const visible = board.nodes.filter((n) => !isHidden(board.nodes, n));
    const left = visible.length
      ? Math.max(0, Math.min(...visible.map((n) => n.x)) - 48)
      : 0;
    const top = visible.length
      ? Math.max(0, Math.min(...visible.map((n) => n.y)) - 48)
      : 0;
    const right = visible.length
      ? Math.min(
          BOARD_WIDTH,
          Math.max(...visible.map((n) => n.x + size(n).width)) + 48,
        )
      : BOARD_WIDTH;
    const bottom = visible.length
      ? Math.min(
          BOARD_HEIGHT,
          Math.max(...visible.map((n) => n.y + size(n).height)) + 48,
        )
      : BOARD_HEIGHT;
    const next = Math.max(
      0.2,
      Math.min(2, width / (right - left), height / (bottom - top)),
    );
    setZoom(next);
    requestAnimationFrame(() =>
      area.scrollTo({ left: left * next, top: top * next }),
    );
  };
  useEffect(() => {
    const area = svg.current?.parentElement;
    if (!area) return;
    const observer = new ResizeObserver(() => {
      if (area.clientWidth < 100 || area.clientHeight < 100) return;
      setZoom(Math.max(0.5, Math.min(1, (area.clientWidth - 48) / 1200)));
      observer.disconnect();
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  const unsaved = JSON.stringify(board) !== JSON.stringify(savedBoard),
    readOnly = project.status === "archived",
    node = board.nodes.find((n) => n.id === selected);
  useEffect(() => setDirty(unsaved), [unsaved, setDirty]);
  const lastCanvasVersion = useRef(canvas.version),
    lastPreview = useRef(JSON.stringify(board));
  useEffect(() => {
    const next = JSON.stringify(board);
    if (next !== lastPreview.current) {
      lastPreview.current = next;
      onPreview?.(board);
    }
  }, [board, onPreview]);
  useEffect(() => {
    if (
      gestureActive ||
      saveInFlight.current ||
      canvas.version === lastCanvasVersion.current
    )
      return;
    const latest = {
      nodes: JSON.parse(canvas.nodes),
      edges: JSON.parse(canvas.edges || "[]"),
    };
    if (unsaved && JSON.stringify(board) !== JSON.stringify(latest)) {
      try {
        const merged = mergeBoards(savedBoard, board, latest);
        setBoard(merged);
      } catch {
        setSyncError(
          "Another editor changed the same element. Your draft is preserved. Export it or discard it to load the latest board.",
        );
        return;
      }
    } else setBoard(latest);
    lastCanvasVersion.current = canvas.version;
    // Reconcile server updates only after a local draft is saved or discarded.
    // External save reconciliation must preserve drafts rather than remount the editor.
    setSavedBoard(latest);
    setSavedVersion(canvas.version);
    if (
      JSON.stringify(latest) !== JSON.stringify(board) &&
      JSON.stringify(latest) !== JSON.stringify(savedBoard)
    ) {
      setPast([]);
      setFuture([]);
    }
  }, [
    gestureActive,
    canvas.version,
    canvas.nodes,
    canvas.edges,
    unsaved,
    board,
    savedBoard,
    savingLocal,
  ]);
  const save = useCallback(async () => {
    if (gestureActive || saveInFlight.current || busy || readOnly || !unsaved)
      return;
    const snapshot = board;
    saveInFlight.current = true;
    setSavingLocal(true);
    try {
      const ok = await mutate(
        {
          action: "canvas",
          projectId: project.id,
          version: savedVersion,
          base: savedBoard,
          ...snapshot,
        },
        liveSave ? undefined : "Canvas saved",
      );
      if (ok) {
        setSavedBoard(snapshot);
        setSyncError("");
      } else
        setSyncError(
          "Sync paused. Your draft is preserved. Retry Save when the connection is available, or export a copy.",
        );
    } finally {
      saveInFlight.current = false;
      setSavingLocal(false);
    }
  }, [
    gestureActive,
    board,
    busy,
    readOnly,
    unsaved,
    mutate,
    project.id,
    savedVersion,
    savedBoard,
    liveSave,
  ]);
  useEffect(() => {
    if (
      gestureActive ||
      !liveSave ||
      !unsaved ||
      busy ||
      savingLocal ||
      readOnly ||
      syncError
    )
      return;
    const timer = setTimeout(() => {
      void save();
    }, 900);
    return () => clearTimeout(timer);
  }, [
    gestureActive,
    liveSave,
    unsaved,
    busy,
    savingLocal,
    readOnly,
    syncError,
    save,
  ]);
  const change = (next: Board) => {
    if (JSON.stringify(next) === JSON.stringify(board)) return;
    setPast((p) => [...p.slice(-39), board]);
    setFuture([]);
    setBoard(next);
  };
  const add = (
    kind: NonNullable<CanvasNode["kind"]> = "note",
    x?: number,
    y?: number,
  ) => {
    if (readOnly || board.nodes.length >= 200) return;
    const n: CanvasNode = {
      id: crypto.randomUUID(),
      kind,
      text:
        kind === "task"
          ? "A next step"
          : kind === "text"
            ? "Add your heading"
            : ["rectangle", "ellipse", "diamond", "line"].includes(kind)
              ? ""
              : kind === "frame"
                ? "Frame"
                : "A new idea",
      x: x ?? 70 + (board.nodes.length % 4) * 245,
      y: y ?? 70 + (Math.floor(board.nodes.length / 4) % 4) * 160,
      color: kind === "task" ? "teal" : "amber",
      done: false,
      name:
        kind === "frame"
          ? "New frame"
          : kind === "rectangle"
            ? "Rectangle"
            : kind === "ellipse"
              ? "Ellipse"
              : kind === "diamond"
                ? "Diamond"
                : kind === "line"
                  ? "Line"
                  : kind === "text"
                    ? "Text"
                    : "",
      ...(kind === "frame"
        ? { width: 720, height: 480, fill: "#ffffff", stroke: "#d8dce5" }
        : kind === "rectangle"
          ? { width: 240, height: 140, fill: "#eeebfb", radius: 12 }
          : kind === "ellipse" || kind === "diamond"
            ? { width: 160, height: 160, fill: "#e5f7f0" }
            : kind === "line"
              ? { width: 240, height: 2, stroke: "#69758a", strokeWidth: 2 }
              : kind === "text"
                ? {
                    width: 350,
                    height: 100,
                    fontSize: 28,
                    fontWeight: 700,
                    textColor: "#292d40",
                  }
                : {}),
    };
    if (kind !== "frame") n.frameId = frameFor(board.nodes, n);
    change({
      ...board,
      nodes:
        kind === "frame"
          ? [constrain(n), ...board.nodes]
          : [...board.nodes, constrain(n)],
    });
    setSelected(n.id);
    setSelection([n.id]);
    setTool("select");
    if (kind === "text") setEditing({ id: n.id, text: "" });
  };
  const remove = () => {
    const ids = expandSelection(board.nodes, selection).filter(
      (id) =>
        !isLocked(
          board.nodes,
          board.nodes.find((n) => n.id === id)!,
        ),
    );
    change({
      nodes: board.nodes.filter((n) => !ids.includes(n.id)),
      edges: board.edges.filter(
        (e) => !ids.includes(e.from) && !ids.includes(e.to),
      ),
    });
    setSelected(null);
    setSelection([]);
  };
  const undo = () => {
    if (!past.length || readOnly) return;
    setFuture((f) => [board, ...f]);
    setBoard(past[past.length - 1]);
    setPast(past.slice(0, -1));
  };
  const redo = () => {
    if (!future.length || readOnly) return;
    setPast((p) => [...p, board]);
    setBoard(future[0]);
    setFuture(future.slice(1));
  };
  const select = (n: CanvasNode, extend = false) => {
    if (tool === "connect" && !readOnly) {
      if (from && from !== n.id) {
        if (!board.edges.some((e) => e.from === from && e.to === n.id))
          change({
            ...board,
            edges: [
              ...board.edges,
              { id: crypto.randomUUID(), from, to: n.id, label: "" },
            ],
          });
        setFrom(null);
      } else setFrom(n.id);
    } else {
      const ids = extend
        ? selection.includes(n.id)
          ? selection.filter((id) => id !== n.id)
          : [...selection, n.id]
        : [n.id];
      setSelection(ids);
      setSelected(ids.includes(n.id) ? n.id : ids.at(-1) || null);
    }
  };
  const update = (patch: Partial<CanvasNode>) =>
    change({
      ...board,
      nodes: board.nodes.map((n) =>
        n.id === selected ? constrain({ ...n, ...patch }) : n,
      ),
    });
  const exportSvg = () => {
    if (!svg.current) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[data-editor]").forEach((e) => e.remove());
    clone.style.width = BOARD_WIDTH + "px";
    clone.style.height = BOARD_HEIGHT + "px";
    clone.setAttribute("width", String(BOARD_WIDTH));
    clone.setAttribute("height", String(BOARD_HEIGHT));
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], {
        type: "image/svg+xml",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = project.title.replace(/[^a-z0-9]/gi, "-") + "-canvas.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const duplicate = () => {
    const originals = board.nodes.filter((n) =>
      expandSelection(board.nodes, selection).includes(n.id),
    );
    if (readOnly || board.nodes.length + originals.length > 200) return;
    const ids = new Map(originals.map((n) => [n.id, crypto.randomUUID()]));
    const copies = originals.map((n) =>
      constrain({
        ...n,
        id: ids.get(n.id)!,
        name: (n.name || n.kind || "Element") + " copy",
        x: n.x + 24,
        y: n.y + 24,
        locked: false,
        frameId: n.frameId ? ids.get(n.frameId) || n.frameId : undefined,
      }),
    );
    change({
      nodes: [...board.nodes, ...copies],
      edges: [
        ...board.edges,
        ...board.edges
          .filter((e) => ids.has(e.from) && ids.has(e.to))
          .map((e) => ({
            ...e,
            id: crypto.randomUUID(),
            from: ids.get(e.from)!,
            to: ids.get(e.to)!,
          })),
      ],
    });
    setSelection(copies.map((n) => n.id));
    setSelected(copies.at(-1)?.id || null);
  };
  const reorder = (direction: number) => {
    if (!node || readOnly) return;
    const nodes = [...board.nodes],
      index = nodes.findIndex((n) => n.id === node.id),
      target = Math.max(0, Math.min(nodes.length - 1, index + direction));
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    change({ ...board, nodes });
  };
  const template = (type: string) => {
    if (type === "wireframe") {
      change({ ...board, nodes: [...board.nodes, ...wireframeTemplate()] });
      setTemplates(false);
      setSelected(null);
      setSelection([]);
      setZoom(0.65);
      return;
    }
    const names =
      type === "journey"
        ? ["The idea", "What we need to learn", "The next step"]
        : ["What’s working", "What could be better", "Actions to take"];
    const nodes: CanvasNode[] = names.map((text, i) => ({
      id: crypto.randomUUID(),
      text,
      x: 100 + i * 310,
      y: 220,
      color: ["blue", "violet", "teal"][i],
      kind: i === 2 ? "task" : "note",
    }));
    change({
      nodes: [...board.nodes, ...nodes],
      edges: [
        ...board.edges,
        {
          id: crypto.randomUUID(),
          from: nodes[0].id,
          to: nodes[1].id,
          label: "",
        },
        {
          id: crypto.randomUUID(),
          from: nodes[1].id,
          to: nodes[2].id,
          label: "",
        },
      ],
    });
    setTemplates(false);
  };
  const position = (e: {
    clientX: number;
    clientY: number;
  }): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(BOARD_WIDTH, ((e.clientX - r.left) * BOARD_WIDTH) / r.width),
      ),
      Math.max(
        0,
        Math.min(BOARD_HEIGHT, ((e.clientY - r.top) * BOARD_HEIGHT) / r.height),
      ),
    ];
  };
  const finishText = () => {
    if (!editing) return;
    if (!readOnly)
      change({
        ...board,
        nodes: board.nodes.map((n) =>
          n.id === editing.id && !isLocked(board.nodes, n)
            ? { ...n, text: editing.text }
            : n,
        ),
      });
    setEditing(null);
  };
  const shortcuts = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && expanded) {
      e.preventDefault();
      setExpanded(false);
      return;
    }
    if (
      (e.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return;
    const key = e.key.toLowerCase(),
      command = e.ctrlKey || e.metaKey;
    if (e.key === " ") {
      e.preventDefault();
      space.current = true;
      return;
    }
    if (command && key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (command && key === "s") {
      e.preventDefault();
      void save();
      return;
    }
    if (command && key === "a") {
      e.preventDefault();
      setSelection(
        board.nodes.filter((n) => !isHidden(board.nodes, n)).map((n) => n.id),
      );
      return;
    }
    if (command && key === "d") {
      e.preventDefault();
      duplicate();
      return;
    }
    if (key === "escape") {
      setEditing(null);
      setSelected(null);
      setSelection([]);
      setTool("select");
      setExpanded(false);
      return;
    }
    if ((key === "delete" || key === "backspace") && !readOnly) {
      e.preventDefault();
      remove();
      return;
    }
    if (command || e.altKey) return;
    const tools: Record<string, string> = {
      v: "select",
      h: "hand",
      p: "freehand",
      r: "rectangle",
      e: "ellipse",
      d: "diamond",
      a: "arrow",
      l: "line",
      t: "text",
      n: "note",
      x: "eraser",
    };
    if (tools[key] && (!readOnly || ["select", "hand"].includes(tools[key]))) {
      e.preventDefault();
      setTool(tools[key]);
      setFrom(null);
    }
  };
  const pointerStart = (e: React.PointerEvent<SVGSVGElement>) => {
    const area = svg.current!.parentElement!;
    const mode =
      tool === "hand" || space.current || e.button === 1 ? "pan" : tool;
    if (
      (e.button !== 0 && e.button !== 1) ||
      mode === "connect" ||
      (readOnly && !["select", "pan"].includes(mode))
    )
      return;
    const target = (e.target as Element).closest("[data-canvas-node]");
    if (mode === "select" && target) return;
    if (
      ![
        "pan",
        "select",
        "eraser",
        "freehand",
        "rectangle",
        "ellipse",
        "diamond",
        "frame",
        "line",
        "arrow",
        "note",
        "task",
        "text",
      ].includes(mode)
    )
      return;
    if (
      board.nodes.length >= 200 &&
      !["select", "pan", "eraser"].includes(mode)
    ) {
      setSyncError("The board has reached its 200-element limit.");
      return;
    }
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      mode,
      id: crypto.randomUUID(),
      points: [position(e)],
      before: board,
      left: area.scrollLeft,
      top: area.scrollTop,
      clientX: e.clientX,
      clientY: e.clientY,
      erase: [],
    };
    setGestureActive(true);
    if (mode === "eraser" && target)
      eraseAt(target.getAttribute("data-canvas-node")!);
  };
  const eraseAt = (id: string) => {
    const g = gesture.current;
    if (!g) return;
    const n = g.before.nodes.find((n) => n.id === id);
    if (!n || isLocked(g.before.nodes, n)) return;
    g.erase = [
      ...new Set([...g.erase, ...expandSelection(g.before.nodes, [id])]),
    ].filter(
      (id) =>
        !isLocked(
          g.before.nodes,
          g.before.nodes.find((n) => n.id === id)!,
        ),
    );
    setBoard({
      nodes: g.before.nodes.filter((n) => !g.erase.includes(n.id)),
      edges: g.before.edges.filter(
        (e) => !g.erase.includes(e.from) && !g.erase.includes(e.to),
      ),
    });
  };
  const pointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const point = position(e),
      start = g.points[0];
    if (g.mode === "pan") {
      const area = svg.current!.parentElement!;
      area.scrollLeft = g.left + g.clientX - e.clientX;
      area.scrollTop = g.top + g.clientY - e.clientY;
      return;
    }
    if (g.mode === "eraser") {
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-canvas-node]");
      if (target) eraseAt(target.getAttribute("data-canvas-node")!);
      return;
    }
    if (g.mode === "select") {
      setMarquee({
        x: Math.min(start[0], point[0]),
        y: Math.min(start[1], point[1]),
        width: Math.abs(start[0] - point[0]),
        height: Math.abs(start[1] - point[1]),
      });
      return;
    }
    if (
      ![
        "freehand",
        "rectangle",
        "ellipse",
        "diamond",
        "frame",
        "line",
        "arrow",
      ].includes(g.mode)
    )
      return;
    if (g.mode === "freehand") {
      const last = g.points.at(-1)!;
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 2) return;
      if (g.points.length >= 512)
        g.points = g.points.filter((_, i) => i % 2 === 0);
      g.points.push(point);
    } else g.points = [start, point];
    const n = sketchNode(
      g.mode as Parameters<typeof sketchNode>[0],
      g.points,
      g.id,
      stroke,
      strokeWidth,
    );
    if (
      g.before.nodes.reduce((sum, n) => sum + (n.points?.length || 0), 0) +
        (n.points?.length || 0) >
      2000
    ) {
      setSyncError(
        "Sketch detail limit reached. Remove a stroke or use another board.",
      );
      return;
    }
    setBoard({ ...g.before, nodes: [...g.before.nodes, n] });
  };
  const pointerFinish = () => {
    const g = gesture.current;
    if (!g) return;
    suppressClick.current = true;
    if (g.mode === "select" && marquee) {
      const ids = board.nodes
        .filter(
          (n) =>
            !isHidden(board.nodes, n) &&
            n.x < marquee.x + marquee.width &&
            n.x + size(n).width > marquee.x &&
            n.y < marquee.y + marquee.height &&
            n.y + size(n).height > marquee.y,
        )
        .map((n) => n.id);
      setSelection(ids);
      setSelected(ids.length === 1 ? ids[0] : null);
    } else if (["note", "task", "text"].includes(g.mode))
      add(g.mode as CanvasNode["kind"], ...g.points[0]);
    else if (g.mode === "select") {
      setSelection([]);
      setSelected(null);
    } else if (JSON.stringify(g.before) !== JSON.stringify(board)) {
      setPast((p) => [...p.slice(-39), g.before]);
      setFuture([]);
      if (g.mode !== "eraser") {
        setSelected(g.id);
        setSelection([g.id]);
      }
    }
    gesture.current = null;
    setGestureActive(false);
    setMarquee(null);
  };
  return (
    <section
      className={`visual-canvas sketch-workspace ${expanded ? "canvas-expanded" : ""} ${node && tool === "select" ? "has-properties" : ""}`}
      onKeyDown={shortcuts}
      tabIndex={-1}
    >
      <header className="visual-canvas-header">
        <div>
          <span className="eyebrow">
            {context === "room" ? "ROOM CANVAS" : "PROJECT CANVAS"}
          </span>
          <h1>{project.title}</h1>
        </div>
        <span className={`canvas-save-state ${unsaved ? "unsaved" : ""}`}>
          <span />
          {readOnly
            ? "Read-only"
            : unsaved
              ? "Unsaved changes"
              : "All changes saved"}
        </span>
        <div className="canvas-header-actions">
          <button
            className="button secondary"
            aria-label={expanded ? "Exit focus mode" : "Focus canvas"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <Shrink size={16} /> : <Expand size={16} />}
            <span>{expanded ? "Exit focus" : "Focus"}</span>
          </button>
          <button
            className="button secondary"
            aria-label="Export canvas"
            onClick={exportSvg}
          >
            <Download size={16} />
            <span>Export</span>
          </button>
          <button
            className="button primary"
            disabled={busy || readOnly || !unsaved}
            onClick={() => void save()}
          >
            <Save size={16} />
            {busy || savingLocal ? "Saving…" : "Save"}
          </button>
        </div>
      </header>
      <div className="canvas-sync-bar">
        <label>
          <input
            type="checkbox"
            checked={liveSave}
            disabled={readOnly}
            onChange={(e) => {
              setLiveSave(e.target.checked);
              setSyncError("");
            }}
          />
          Live save
        </label>
        <span role="status">
          {syncError ||
            (savingLocal
              ? "Saving changes…"
              : liveSave
                ? "Changes sync after a brief pause. Conflicting edits require review."
                : "Manual save · Your draft stays local until Save.")}
        </span>
        {syncError && (
          <button
            className="text-button"
            onClick={() => {
              if (
                confirm(
                  "Discard your unsaved draft and load the latest saved board?",
                )
              ) {
                const latest = {
                  nodes: JSON.parse(canvas.nodes),
                  edges: JSON.parse(canvas.edges || "[]"),
                };
                setBoard(latest);
                setSavedBoard(latest);
                setSavedVersion(canvas.version);
                lastCanvasVersion.current = canvas.version;
                setSyncError("");
                setPast([]);
                setFuture([]);
              }
            }}
          >
            Discard draft and reload
          </button>
        )}
      </div>
      <div className="canvas-workbench">
        <div className="canvas-topbar">
          <div
            className="canvas-tool-group"
            role="toolbar"
            aria-label="Canvas tools"
          >
            {[
              { id: "select", label: "Select (V)", icon: MousePointer2 },
              { id: "hand", label: "Hand · pan (H)", icon: Hand },
              { id: "freehand", label: "Draw (P)", icon: Pencil },
              { id: "arrow", label: "Arrow (A)", icon: ArrowRight },
              { id: "eraser", label: "Eraser (X)", icon: Eraser },
              { id: "note", label: "Sticky note", icon: StickyNote },
              { id: "task", label: "Task", icon: CheckSquare },
              { id: "text", label: "Text", icon: Type },
              { id: "rectangle", label: "Rectangle", icon: Square },
              { id: "ellipse", label: "Ellipse", icon: Circle },
              { id: "diamond", label: "Diamond", icon: Diamond },
              { id: "frame", label: "Frame", icon: Frame },
              { id: "line", label: "Line", icon: Minus },
              { id: "connect", label: "Connect notes", icon: GitBranch },
            ].map((t) => (
              <button
                key={t.id}
                className={tool === t.id ? "active" : ""}
                aria-pressed={tool === t.id}
                aria-label={t.label}
                title={t.label}
                disabled={readOnly && !["select", "hand"].includes(t.id)}
                onClick={() => {
                  setTool(t.id);
                  setFrom(null);
                  setSelected(null);
                  setSelection([]);
                  svg.current?.focus();
                }}
              >
                <t.icon size={19} />
              </button>
            ))}
          </div>
          <div className="canvas-tool-group">
            <button
              aria-label="Undo"
              disabled={!past.length || readOnly}
              onClick={undo}
            >
              <Undo2 size={18} />
            </button>
            <button
              aria-label="Redo"
              disabled={!future.length || readOnly}
              onClick={redo}
            >
              <Redo2 size={18} />
            </button>
          </div>
          <span className="grow" />
          <label className="sketch-style">
            Ink
            <input
              aria-label="Drawing color"
              type="color"
              value={stroke}
              disabled={readOnly}
              onChange={(e) => setStroke(e.target.value)}
            />
          </label>
          <label className="sketch-style">
            Weight
            <select
              aria-label="Drawing stroke width"
              value={strokeWidth}
              disabled={readOnly}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
            >
              <option value={2}>Fine</option>
              <option value={4}>Medium</option>
              <option value={7}>Bold</option>
            </select>
          </label>
          <button
            className="canvas-view-button"
            aria-pressed={layers}
            onClick={() => setLayers(!layers)}
          >
            <Layers size={16} /> Layers
          </button>
          <label className="snap-toggle">
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />{" "}
            Snap
          </label>
          <button className="canvas-view-button" onClick={() => setList(!list)}>
            {list ? "Board view" : "Notes view"}
          </button>
          <button
            className="canvas-view-button"
            disabled={readOnly || board.nodes.length > 185}
            onClick={() => setTemplates(!templates)}
          >
            <LayoutTemplate size={16} /> Templates
          </button>
        </div>
        {templates && (
          <div className="canvas-template-picker">
            <h3>Start with a little structure</h3>
            <button onClick={() => template("wireframe")}>
              <Frame size={17} /> Website wireframe <ArrowRight size={17} />
            </button>
            <button onClick={() => template("journey")}>
              Idea → Learn → Next step <ArrowRight size={17} />
            </button>
            <button onClick={() => template("retro")}>
              Team retrospective <ArrowRight size={17} />
            </button>
          </div>
        )}
        {selection.length > 1 && (
          <div
            className="design-align-toolbar"
            role="toolbar"
            aria-label="Align selected elements"
          >
            <span>{selection.length} selected</span>
            {[
              { mode: "left", icon: AlignLeft },
              { mode: "center", icon: AlignCenter },
              { mode: "right", icon: AlignRight },
              { mode: "top", icon: AlignStartVertical },
              { mode: "middle", icon: AlignCenterVertical },
              { mode: "bottom", icon: AlignEndVertical },
            ].map((a) => (
              <button
                key={a.mode}
                aria-label={"Align " + a.mode}
                disabled={readOnly}
                onClick={() =>
                  change({
                    ...board,
                    nodes: alignNodes(board.nodes, selection, a.mode),
                  })
                }
              >
                <a.icon size={17} />
              </button>
            ))}
            <button
              disabled={readOnly || selection.length < 3}
              onClick={() =>
                change({
                  ...board,
                  nodes: distributeNodes(board.nodes, selection, "x"),
                })
              }
            >
              Distribute H
            </button>
            <button
              disabled={readOnly || selection.length < 3}
              onClick={() =>
                change({
                  ...board,
                  nodes: distributeNodes(board.nodes, selection, "y"),
                })
              }
            >
              Distribute V
            </button>
            <button onClick={duplicate} disabled={readOnly}>
              <Copy size={16} />
            </button>
          </div>
        )}
        <div
          className={`canvas-surface ${list ? "list-view" : ""} ${layers ? "with-layers" : ""}`}
        >
          {layers && (
            <aside className="canvas-layer-panel">
              <div>
                <h3>Layers</h3>
                <button
                  className="icon-button"
                  aria-label="Close layers"
                  onClick={() => setLayers(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <p>Shift-click to select multiple</p>
              {[...board.nodes].reverse().map((n) => (
                <div
                  className={`design-layer-row ${selection.includes(n.id) ? "selected" : ""} ${n.frameId ? "in-frame" : ""}`}
                  key={n.id}
                >
                  <button
                    onClick={(e) => select(n, e.shiftKey)}
                    aria-pressed={selection.includes(n.id)}
                  >
                    <span>
                      {n.kind === "frame" ? (
                        <Frame size={14} />
                      ) : n.kind === "text" ? (
                        <Type size={14} />
                      ) : n.kind === "ellipse" ? (
                        <Circle size={14} />
                      ) : (
                        <Square size={14} />
                      )}
                    </span>
                    <strong>{n.name || n.text || n.kind || "Note"}</strong>
                  </button>
                  <button
                    aria-label={
                      (n.hidden ? "Show " : "Hide ") +
                      (n.name || n.text || "element")
                    }
                    disabled={readOnly}
                    onClick={() =>
                      change({
                        ...board,
                        nodes: board.nodes.map((item) =>
                          item.id === n.id
                            ? { ...item, hidden: !item.hidden }
                            : item,
                        ),
                      })
                    }
                  >
                    {n.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    aria-label={
                      (n.locked ? "Unlock " : "Lock ") +
                      (n.name || n.text || "element")
                    }
                    disabled={readOnly}
                    onClick={() =>
                      change({
                        ...board,
                        nodes: board.nodes.map((item) =>
                          item.id === n.id
                            ? { ...item, locked: !item.locked }
                            : item,
                        ),
                      })
                    }
                  >
                    {n.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                </div>
              ))}
              {!board.nodes.length && <p>Your design elements appear here.</p>}
            </aside>
          )}
          <div className="canvas-instructions">
            {tool === "connect"
              ? from
                ? "Choose a second note to connect."
                : "Choose two notes to create a connection."
              : tool === "hand"
                ? "Drag to move around the board"
                : tool === "freehand"
                  ? "Draw freely · P to sketch, V to select"
                  : tool === "eraser"
                    ? "Click or drag across elements to erase · Undo to restore"
                    : tool === "select"
                      ? "Drag to select · Double-click to edit text · Space + drag to pan"
                      : [
                            "rectangle",
                            "ellipse",
                            "diamond",
                            "frame",
                            "line",
                            "arrow",
                          ].includes(tool)
                        ? `Drag on the board to draw a ${tool}`
                        : "Click the board to add " +
                          (tool === "note"
                            ? "a sticky note"
                            : tool === "task"
                              ? "a task"
                              : "text")}
          </div>
          <div className="canvas-scroll-area">
            <svg
              ref={svg}
              viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
              xmlns="http://www.w3.org/2000/svg"
              aria-label={`Interactive ${context} canvas`}
              tabIndex={0}
              style={{
                width: BOARD_WIDTH * zoom,
                height: BOARD_HEIGHT * zoom,
                cursor:
                  tool === "hand"
                    ? "grab"
                    : tool === "select"
                      ? "default"
                      : "crosshair",
                touchAction: "none",
              }}
              onPointerDown={pointerStart}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
              }}
              onPointerMove={(e) => {
                if (gesture.current) {
                  pointerMove(e);
                  return;
                }
                if (!drag.current || !svg.current) return;
                const r = svg.current.getBoundingClientRect(),
                  x = ((e.clientX - r.left) * BOARD_WIDTH) / r.width,
                  y = ((e.clientY - r.top) * BOARD_HEIGHT) / r.height;
                const d = drag.current;
                const grid = (v: number) => (snap ? Math.round(v / 8) * 8 : v);
                setBoard({
                  ...d.before,
                  nodes:
                    d.mode === "move"
                      ? moveElements(
                          d.before.nodes,
                          d.ids,
                          grid(x - d.x),
                          grid(y - d.y),
                        )
                      : d.before.nodes.map((n) => {
                          if (
                            !d.ids.includes(n.id) ||
                            isLocked(d.before.nodes, n)
                          )
                            return n;
                          const dimensions = size(n);
                          return constrain({
                            ...n,
                            width: Math.max(
                              2,
                              grid(dimensions.width + x - d.x),
                            ),
                            height: Math.max(
                              2,
                              grid(dimensions.height + y - d.y),
                            ),
                          });
                        }),
                });
              }}
              onPointerUp={() => {
                if (gesture.current) {
                  pointerFinish();
                  return;
                }
                setGestureActive(false);
                if (drag.current) {
                  if (
                    JSON.stringify(board) !==
                    JSON.stringify(drag.current.before)
                  ) {
                    const previous = drag.current.before;
                    setPast((p) => [...p.slice(-39), previous]);
                    setFuture([]);
                  }
                  if (drag.current.mode === "move") {
                    const moved = drag.current.ids;
                    setBoard((current) => ({
                      ...current,
                      nodes: current.nodes.map((n) =>
                        moved.includes(n.id) && n.kind !== "frame"
                          ? { ...n, frameId: frameFor(current.nodes, n) }
                          : n,
                      ),
                    }));
                  }
                  drag.current = null;
                }
              }}
              onPointerCancel={() => {
                if (gesture.current) {
                  setBoard(gesture.current.before);
                  gesture.current = null;
                  setMarquee(null);
                }
                setGestureActive(false);
                if (drag.current) {
                  setBoard(drag.current.before);
                  drag.current = null;
                }
              }}
            >
              <defs>
                <pattern
                  id="canvas-dots"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="2" cy="2" r="1" fill="#dce1e9" />
                </pattern>
                <marker
                  id="canvas-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8" fill="#8c98ab" />
                </marker>
              </defs>
              <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#fafbfc" />
              <rect
                data-editor="true"
                width={BOARD_WIDTH}
                height={BOARD_HEIGHT}
                fill="url(#canvas-dots)"
              />
              {board.edges.map((e) => {
                const a = board.nodes.find((n) => n.id === e.from),
                  b = board.nodes.find((n) => n.id === e.to);
                if (
                  !a ||
                  !b ||
                  isHidden(board.nodes, a) ||
                  isHidden(board.nodes, b)
                )
                  return null;
                return (
                  <g key={e.id}>
                    <path
                      d={`M ${a.x + size(a).width} ${a.y + size(a).height / 2} C ${a.x + size(a).width + 50} ${a.y + size(a).height / 2},${b.x - 50} ${b.y + size(b).height / 2},${b.x} ${b.y + size(b).height / 2}`}
                      stroke="#8c98ab"
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#canvas-arrow)"
                    />
                    {e.label && (
                      <text
                        x={(a.x + b.x + size(a).width) / 2}
                        y={(a.y + b.y) / 2 + 56}
                        textAnchor="middle"
                        fontFamily="sans-serif"
                        fontSize="12"
                        fill="#64748b"
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {marquee && (
                <rect
                  data-editor="true"
                  {...marquee}
                  fill="#7367f020"
                  stroke="#7367f0"
                  strokeWidth={1}
                />
              )}
              {board.nodes
                .filter((n) => !isHidden(board.nodes, n))
                .map((n) => (
                  <g
                    key={n.id}
                    data-canvas-node={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${n.text || n.name || n.kind || "element"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      if (tool !== "select" && tool !== "connect") return;
                      if (
                        e.shiftKey ||
                        !selection.includes(n.id) ||
                        selection.length === 1
                      )
                        select(n, e.shiftKey);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select(n);
                      }
                      if (
                        !readOnly &&
                        !isLocked(board.nodes, n) &&
                        e.key.startsWith("Arrow")
                      ) {
                        e.preventDefault();
                        change({
                          ...board,
                          nodes: moveElements(
                            board.nodes,
                            selection.includes(n.id) ? selection : [n.id],
                            e.key === "ArrowRight"
                              ? 10
                              : e.key === "ArrowLeft"
                                ? -10
                                : 0,
                            e.key === "ArrowDown"
                              ? 10
                              : e.key === "ArrowUp"
                                ? -10
                                : 0,
                          ),
                        });
                      }
                    }}
                    onDoubleClick={(e) => {
                      if (
                        readOnly ||
                        isLocked(board.nodes, n) ||
                        ["freehand", "line", "arrow"].includes(n.kind || "")
                      )
                        return;
                      e.stopPropagation();
                      setEditing({ id: n.id, text: n.text });
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || space.current) return;
                      if (
                        readOnly ||
                        isLocked(board.nodes, n) ||
                        tool !== "select" ||
                        e.shiftKey
                      )
                        return;
                      const ids = selection.includes(n.id) ? selection : [n.id];
                      if (!selection.includes(n.id)) {
                        setSelected(n.id);
                        setSelection(ids);
                      }
                      const r = svg.current!.getBoundingClientRect();
                      setGestureActive(true);
                      drag.current = {
                        id: n.id,
                        ids: expandSelection(board.nodes, ids),
                        mode: "move",
                        x: ((e.clientX - r.left) * BOARD_WIDTH) / r.width,
                        y: ((e.clientY - r.top) * BOARD_HEIGHT) / r.height,
                        before: board,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    style={{
                      cursor: tool === "connect" ? "crosshair" : "grab",
                      touchAction: "none",
                    }}
                  >
                    <DesignNode
                      node={{ ...n, locked: isLocked(board.nodes, n) }}
                      selected={tool === "select" && selection.includes(n.id)}
                      connecting={from === n.id}
                      onResize={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (readOnly || isLocked(board.nodes, n)) return;
                        const r = svg.current!.getBoundingClientRect();
                        setGestureActive(true);
                        drag.current = {
                          id: n.id,
                          ids: [n.id],
                          mode: "resize",
                          x: ((e.clientX - r.left) * BOARD_WIDTH) / r.width,
                          y: ((e.clientY - r.top) * BOARD_HEIGHT) / r.height,
                          before: board,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                    />
                  </g>
                ))}
              {editing &&
                (() => {
                  const n = board.nodes.find((n) => n.id === editing.id);
                  return (
                    n && (
                      <foreignObject
                        data-editor="true"
                        x={n.x}
                        y={n.y}
                        width={size(n).width}
                        height={size(n).height}
                      >
                        <textarea
                          ref={inlineText}
                          className="canvas-inline-text"
                          aria-label="Edit canvas text"
                          value={editing.text}
                          maxLength={240}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            setEditing({ ...editing, text: e.target.value })
                          }
                          onBlur={finishText}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Escape") setEditing(null);
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                              finishText();
                          }}
                        />
                      </foreignObject>
                    )
                  );
                })()}
            </svg>
          </div>
          <div className="canvas-notes-list">
            {board.nodes.map((n) => (
              <button
                key={n.id}
                className={`canvas-list-note ${selected === n.id ? "selected" : ""}`}
                style={{
                  background: n.fill || colors[n.color as keyof typeof colors],
                }}
                onClick={() => select(n)}
              >
                <small>
                  {n.kind === "task"
                    ? "NEXT STEP"
                    : n.kind === "text"
                      ? "TEXT"
                      : "IDEA"}
                </small>
                <strong>
                  {n.done ? "✓ " : ""}
                  {n.text || n.name || n.kind}
                </strong>
              </button>
            ))}
            <button
              className="canvas-list-add"
              disabled={readOnly}
              onClick={() => add()}
            >
              <Plus size={22} /> Add a note
            </button>
          </div>
          {!board.nodes.length && !list && tool === "select" && (
            <div className="canvas-zero">
              <StickyNote size={32} />
              <h2>A space for your next idea.</h2>
              <p>
                Pick a tool and draw. Sketch ideas, map a flow, or start with a
                template.
              </p>
              <button
                className="button primary"
                disabled={readOnly}
                onClick={() => add()}
              >
                <Plus size={17} /> Add your first note
              </button>
            </div>
          )}
          <div className="canvas-zoom">
            <button
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(0.2, zoom - 0.1))}
            >
              <Minus size={16} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
            >
              <Plus size={16} />
            </button>
            <button
              aria-label="Fit board to view"
              title="Fit board to view"
              onClick={fitView}
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>
        {node && tool === "select" && (
          <aside className="canvas-properties">
            <div>
              <h3>
                Edit{" "}
                {node.kind === "task"
                  ? "task"
                  : node.kind === "text"
                    ? "text"
                    : "note"}
              </h3>
              <button
                className="icon-button"
                aria-label="Close note editor"
                onClick={() => {
                  setSelected(null);
                  setSelection([]);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <fieldset
              className="design-properties"
              disabled={readOnly || isLocked(board.nodes, node)}
            >
              <label>
                Layer name
                <input
                  value={node.name || ""}
                  maxLength={80}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder={node.kind || "Note"}
                />
              </label>
              {node.kind !== "frame" && (
                <label>
                  Frame
                  <select
                    aria-label="Parent frame"
                    value={node.frameId || ""}
                    onChange={(e) =>
                      update({ frameId: e.target.value || undefined })
                    }
                  >
                    <option value="">No frame</option>
                    {board.nodes
                      .filter((n) => n.kind === "frame")
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name || f.text || "Frame"}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <div className="design-geometry">
                {[
                  { key: "x", label: "X", value: node.x, max: 1598 },
                  { key: "y", label: "Y", value: node.y, max: 998 },
                  {
                    key: "width",
                    label: "W",
                    value: size(node).width,
                    max: 1600,
                  },
                  {
                    key: "height",
                    label: "H",
                    value: size(node).height,
                    max: 1000,
                  },
                ].map((f) => (
                  <label key={f.key}>
                    {f.label}
                    <input
                      aria-label={"Element " + f.key}
                      type="number"
                      min={f.key === "x" || f.key === "y" ? 0 : 2}
                      max={f.max}
                      value={Math.round(f.value)}
                      onChange={(e) => {
                        if (e.target.value !== "")
                          update({ [f.key]: Number(e.target.value) });
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="design-fill-controls">
                <label>
                  Fill
                  <input
                    type="color"
                    aria-label="Element fill"
                    value={
                      node.fill ||
                      palette[node.color as keyof typeof palette] ||
                      "#ffffff"
                    }
                    onChange={(e) => update({ fill: e.target.value })}
                  />
                </label>
                <label>
                  Border
                  <input
                    type="color"
                    aria-label="Element border color"
                    value={node.stroke || "#dae0e8"}
                    onChange={(e) => update({ stroke: e.target.value })}
                  />
                </label>
                <label>
                  Stroke
                  <input
                    type="number"
                    aria-label="Element border width"
                    min={0}
                    max={20}
                    value={node.strokeWidth ?? 1}
                    onChange={(e) =>
                      update({
                        strokeWidth: Math.max(
                          0,
                          Math.min(20, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Corner radius
                <input
                  type="range"
                  aria-label="Corner radius"
                  min="0"
                  max="100"
                  value={node.radius ?? 8}
                  onChange={(e) => update({ radius: Number(e.target.value) })}
                />
              </label>
              <label>
                Font
                <select
                  aria-label="Font family"
                  value={node.fontFamily || "sans"}
                  onChange={(e) =>
                    update({
                      fontFamily: e.target.value as CanvasNode["fontFamily"],
                    })
                  }
                >
                  <option value="sans">Sans serif</option>
                  <option value="serif">Serif</option>
                  <option value="monospace">Monospace</option>
                </select>
              </label>
              <div className="design-type-controls">
                <label>
                  Size
                  <input
                    type="number"
                    aria-label="Font size"
                    min={8}
                    max={96}
                    value={node.fontSize ?? (node.kind === "text" ? 24 : 14)}
                    onChange={(e) =>
                      update({
                        fontSize: Math.max(
                          8,
                          Math.min(96, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Weight
                  <select
                    aria-label="Font weight"
                    value={node.fontWeight ?? 400}
                    onChange={(e) =>
                      update({ fontWeight: Number(e.target.value) })
                    }
                  >
                    <option value={400}>Regular</option>
                    <option value={600}>Medium</option>
                    <option value={700}>Bold</option>
                  </select>
                </label>
                <label>
                  Text
                  <input
                    type="color"
                    aria-label="Text color"
                    value={node.textColor || "#263247"}
                    onChange={(e) => update({ textColor: e.target.value })}
                  />
                </label>
              </div>
              <div className="design-text-align">
                {[
                  { align: "left", icon: AlignLeft },
                  { align: "center", icon: AlignCenter },
                  { align: "right", icon: AlignRight },
                ].map((a) => (
                  <button
                    key={a.align}
                    aria-label={"Text align " + a.align}
                    aria-pressed={(node.textAlign || "left") === a.align}
                    onClick={() =>
                      update({ textAlign: a.align as CanvasNode["textAlign"] })
                    }
                  >
                    <a.icon size={16} />
                  </button>
                ))}
              </div>
              <label>
                Content
                <textarea
                  aria-label="Canvas note content"
                  rows={5}
                  maxLength={240}
                  disabled={readOnly}
                  value={node.text}
                  onChange={(e) => update({ text: e.target.value })}
                />
              </label>
              <label>Color</label>
              <div className="canvas-color-picker">
                {Object.entries(colors).map(([color, fill]) => (
                  <button
                    key={color}
                    aria-label={color + " note"}
                    aria-pressed={node.color === color}
                    style={{ background: fill }}
                    disabled={readOnly}
                    onClick={() => update({ color, fill })}
                  >
                    {node.color === color && <Check size={18} />}
                  </button>
                ))}
              </div>
              {node.kind === "task" && (
                <label className="task-done">
                  <input
                    type="checkbox"
                    checked={!!node.done}
                    disabled={readOnly}
                    onChange={(e) => update({ done: e.target.checked })}
                  />{" "}
                  Mark completed
                </label>
              )}
            </fieldset>
            <div className="design-layer-actions">
              <button
                disabled={readOnly || isLocked(board.nodes, node)}
                onClick={duplicate}
              >
                <Copy size={15} /> Duplicate
              </button>
              <button
                disabled={readOnly || isLocked(board.nodes, node)}
                aria-label="Bring forward"
                onClick={() => reorder(1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                disabled={readOnly || isLocked(board.nodes, node)}
                aria-label="Send backward"
                onClick={() => reorder(-1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                disabled={readOnly}
                aria-label={
                  node.locked ? "Unlock selected layer" : "Lock selected layer"
                }
                onClick={() => update({ locked: !node.locked })}
              >
                {node.locked ? <Unlock size={15} /> : <Lock size={15} />}
              </button>
            </div>
            <h3>Connections</h3>
            {board.edges
              .filter((e) => e.from === node.id || e.to === node.id)
              .map((e) => (
                <div className="canvas-edge-editor" key={e.id}>
                  <small>
                    {
                      board.nodes.find(
                        (n) => n.id === (e.from === node.id ? e.to : e.from),
                      )?.text
                    }
                  </small>
                  <input
                    aria-label="Connection label"
                    maxLength={80}
                    placeholder="Add a label"
                    disabled={readOnly}
                    value={e.label}
                    onChange={(event) =>
                      change({
                        ...board,
                        edges: board.edges.map((edge) =>
                          edge.id === e.id
                            ? { ...edge, label: event.target.value }
                            : edge,
                        ),
                      })
                    }
                  />
                  <button
                    aria-label="Remove connection"
                    disabled={readOnly}
                    onClick={() =>
                      change({
                        ...board,
                        edges: board.edges.filter((edge) => edge.id !== e.id),
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            <button
              className="button secondary"
              disabled={readOnly}
              onClick={() => {
                setFrom(node.id);
                setTool("connect");
              }}
            >
              <GitBranch size={16} /> Connect to another note
            </button>
            <button
              className="canvas-delete"
              disabled={readOnly || isLocked(board.nodes, node)}
              onClick={remove}
            >
              <Trash2 size={15} /> Remove note
            </button>
          </aside>
        )}
      </div>
      <footer className="canvas-bottom">
        <span>
          {board.nodes.length} elements · {board.edges.length} connections
        </span>
        <span>
          Saved to this {context} ·{" "}
          {liveSave ? "Live save enabled" : "Changes require Save"}
        </span>
      </footer>
    </section>
  );
}
