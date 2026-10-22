import {
  ArrowUpRight,
  Layers,
  Plus,
  Search,
  LayoutDashboard,
} from "lucide-react";
import { useState } from "react";
import type { CanvasNode, WorkspaceData } from "@mayraviq/contracts/types";
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  isHidden,
} from "@mayraviq/contracts/canvas-design";
import DesignNode from "./design-node";
function Preview({ nodes }: { nodes: CanvasNode[] }) {
  const visible = nodes.filter((n) => !isHidden(nodes, n));
  return visible.length ? (
    <svg viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true">
      {visible.map((n) => (
        <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
          <DesignNode
            node={n}
            selected={false}
            connecting={false}
            onResize={() => {}}
          />
        </g>
      ))}
    </svg>
  ) : (
    <div className="canvas-preview-empty">
      <LayoutDashboard size={28} />
      <span>An open space for your idea</span>
    </div>
  );
}
export default function CanvasLibrary({
  data,
  navigate,
  createProject,
}: {
  data: WorkspaceData;
  navigate: (route: string) => boolean;
  createProject: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const projects = data.projects.filter(
    (p) =>
      p.status === status &&
      p.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="canvas-library">
      <div className="page-heading">
        <div>
          <span className="eyebrow">VISUAL WORKSPACE</span>
          <h1>Your ideas, in view.</h1>
          <p>
            Design a layout, map a system, or work through the next idea
            together.
          </p>
        </div>
        <button className="button primary" onClick={createProject}>
          <Plus size={17} />
          Create project
        </button>
      </div>
      <div className="canvas-library-toolbar">
        <div className="canvas-library-filters" aria-label="Project status">
          {["active", "archived"].map((value) => (
            <button
              key={value}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              <Layers size={15} />
              {value === "active" ? "Active" : "Archived"}
              <span>
                {data.projects.filter((p) => p.status === value).length}
              </span>
            </button>
          ))}
        </div>
        <label>
          <Search size={17} />
          <input
            aria-label="Find a canvas"
            placeholder="Find a canvas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="canvas-library-grid">
        {projects.map((p) => {
          const saved = data.canvases.find((c) => c.project_id === p.id);
          const nodes: CanvasNode[] = saved ? JSON.parse(saved.nodes) : [];
          return (
            <button
              key={p.id}
              className="canvas-library-card"
              onClick={() => navigate("canvas/" + p.id)}
            >
              <div className={`canvas-preview ${p.color}`}>
                <Preview nodes={nodes} />
                <span className="canvas-card-access">
                  {p.status === "archived" ? "Read-only" : "Project canvas"}
                </span>
              </div>
              <div className="canvas-library-card-body">
                <div>
                  <h2>{p.title}</h2>
                  <ArrowUpRight size={18} />
                </div>
                <p>
                  {nodes.length} {nodes.length === 1 ? "element" : "elements"}
                  <span>·</span>
                  {p.status === "archived"
                    ? "Archived project"
                    : "Ready to edit"}
                </p>
              </div>
            </button>
          );
        })}
        <button className="canvas-library-new" onClick={createProject}>
          <span>
            <Plus size={24} />
          </span>
          <strong>Make space for an idea</strong>
          <small>Create a project with its own canvas.</small>
        </button>
      </div>
      {query && !projects.length && (
        <p className="canvas-library-no-results">
          No canvases match “{query}”. Try another project name.
        </p>
      )}
      <div className="canvas-library-guide">
        <span>
          <LayoutDashboard size={20} />
        </span>
        <div>
          <strong>A shared surface for your work</strong>
          <p>
            Use shapes, text, notes and connectors. Save your changes to keep
            the board with its project.
          </p>
        </div>
      </div>
    </section>
  );
}
