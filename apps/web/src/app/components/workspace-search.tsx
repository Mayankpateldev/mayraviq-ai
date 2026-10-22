import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckCheck,
  FolderKanban,
  Search,
  Video,
  X,
} from "lucide-react";
import type { WorkspaceData } from "@mayraviq/contracts/types";
export default function WorkspaceSearch({
  data,
  close,
  navigate,
}: {
  data: WorkspaceData;
  close: () => void;
  navigate: (route: string) => boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    input.current?.focus();
    return () => dialog?.close();
  }, []);
  const term = query.trim().toLowerCase();
  const results = [
    ...data.projects
      .filter((p) =>
        (p.title + " " + p.description).toLowerCase().includes(term),
      )
      .map((p) => ({
        id: p.id,
        route: "project/" + p.id,
        title: p.title,
        detail:
          "Project · " + (p.status === "archived" ? "Archived" : "Active"),
        icon: FolderKanban,
        color: p.color,
      })),
    ...data.sessions
      .filter((s) =>
        (s.title + " " + s.notes + " " + s.summary)
          .toLowerCase()
          .includes(term),
      )
      .map((s) => ({
        id: s.id,
        route: "session/" + s.id,
        title: s.title,
        detail:
          "Session · " +
          (data.projects.find((p) => p.id === s.project_id)?.title ??
            "Project"),
        icon: Video,
        color: "teal",
      })),
    ...data.decisions
      .filter((d) => (d.title + " " + d.owner).toLowerCase().includes(term))
      .map((d) => ({
        id: d.id,
        route: "session/" + d.session_id,
        title: d.title,
        detail:
          "Decision · " + (d.status === "draft" ? "Needs review" : d.status),
        icon: CheckCheck,
        color: "violet",
      })),
  ].slice(0, 18);
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);
  const choose = (to: string) => {
    if (navigate(to)) close();
  };
  return (
    <dialog
      ref={ref}
      className="workspace-search-dialog"
      onCancel={close}
      onClose={close}
      aria-label="Search workspace"
    >
      <div className="search-dialog-input">
        <Search size={22} />
        <input
          ref={input}
          aria-label="Search projects, sessions and decisions"
          role="combobox"
          aria-expanded={true}
          aria-controls="workspace-search-results"
          aria-activedescendant={
            results[selected]
              ? "search-result-" + results[selected].id
              : undefined
          }
          placeholder="Search your workspace…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((v) => Math.min(v + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((v) => Math.max(v - 1, 0));
            }
            if (e.key === "Enter" && results[selected]) {
              e.preventDefault();
              choose(results[selected].route);
            }
          }}
        />
        <button
          className="icon-button"
          aria-label="Close search"
          onClick={close}
        >
          <X size={19} />
        </button>
      </div>
      <div className="search-dialog-section">
        <span>{term ? "SEARCH RESULTS" : "YOUR WORKSPACE"}</span>
        <small>
          {results.length} {results.length === 1 ? "result" : "results"}
        </small>
      </div>
      <div
        className="search-results"
        id="workspace-search-results"
        role="listbox"
        aria-label="Workspace search results"
      >
        {results.map((r, i) => (
          <button
            role="option"
            aria-selected={selected === i}
            id={"search-result-" + r.id}
            className={`search-result ${selected === i ? "selected" : ""}`}
            key={r.id}
            onClick={() => choose(r.route)}
            onMouseEnter={() => setSelected(i)}
          >
            <span className={`search-result-icon ${r.color}`}>
              <r.icon size={20} />
            </span>
            <span className="grow">
              <strong>{r.title}</strong>
              <small>{r.detail}</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
        {!results.length && (
          <div className="search-no-results">
            <Search size={28} />
            <h3>No matching work found</h3>
            <p>
              {term
                ? "Try a different word or a shorter phrase."
                : "Create a project or session to start building context."}
            </p>
          </div>
        )}
      </div>
      <div className="search-dialog-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> to navigate <kbd>↵</kbd> to open
        </span>
        <span>
          <kbd>esc</kbd> to close
        </span>
      </div>
    </dialog>
  );
}
