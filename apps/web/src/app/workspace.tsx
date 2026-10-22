import { MeetingInvitationInbox } from "./components/meeting-invitations";
import { apiFetch, signOut } from "../auth";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Home,
  FolderKanban,
  Video,
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  ShieldCheck,
  LogOut,
  Menu,
  CircleDot,
  MoreHorizontal,
  Save,
  CheckCheck,
  Layers,
  MessageCircle,
} from "lucide-react";
import Overview from "./components/overview";
import WorkspaceSearch from "./components/workspace-search";
import "./ui.css";
import "./collaboration.css";
import Discussions from "./components/discussions";
const LiveRoom = lazy(() => import("./components/live-room"));
import Rooms from "./components/rooms";
import CanvasEditor from "./components/canvas-editor";
import WorkspaceCalendar from "./components/workspace-calendar";
import CanvasLibrary from "./components/canvas-library";
import { workspaceHeaders, discussionRequest } from "../lib/discussion-client";
import type {
  Decision,
  Project,
  Session,
  WorkspaceData,
} from "@mayraviq/contracts/types";

type Mutation = (
  payload: Record<string, unknown>,
  message?: string,
) => Promise<boolean>;
type DialogState = { kind: string; id?: string; status?: string } | null;
const date = (value: string, full = false) =>
  new Date(value).toLocaleString(
    undefined,
    full
      ? { dateStyle: "medium", timeStyle: "short" }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  );
const navItems = [
  { id: "home", label: "Overview", icon: Home },
  { id: "discussions", label: "Discussions", icon: MessageCircle },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "rooms", label: "Rooms", icon: Video },
  { id: "canvas", label: "Canvas", icon: LayoutDashboard },
  { id: "knowledge", label: "Intelligence", icon: Sparkles },
  { id: "decisions", label: "Decisions", icon: CheckCheck },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {status === "draft"
        ? "Needs review"
        : status === "active"
          ? "In progress"
          : status === "ended"
            ? "Completed"
            : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Layers size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action}
    </div>
  );
}
export default function Workspace() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(""),
    [route, setRoute] = useState("home"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [dialog, setDialog] = useState<DialogState>(null),
    [dialogError, setDialogError] = useState(""),
    [menu, setMenu] = useState(false),
    [filter, setFilter] = useState("all"),
    [dirty, setDirty] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(m.matches);
    update();
    m.addEventListener("change", update);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      m.removeEventListener("change", update);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/workspace", {
        headers: workspaceHeaders(),
      });
      const d = (await r.json()) as WorkspaceData & { error?: string };
      if (!r.ok) throw Error(d.error);
      setData(d);
      setError("");
      return d as WorkspaceData;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load your workspace.",
      );
      return null;
    }
  }, []);
  useEffect(() => {
    void load();
    const update = () => {
      const [path, params] = location.hash.slice(1).split("?");
      try {
        setRoute(decodeURIComponent(path) || "home");
      } catch {
        setRoute("home");
      }
      setQuery("");
      const requested = new URLSearchParams(params).get("filter");
      setFilter(
        requested &&
          [
            "active",
            "archived",
            "scheduled",
            "open",
            "ended",
            "draft",
            "accepted",
            "rejected",
          ].includes(requested)
          ? requested
          : "all",
      );
      document
        .getElementById("main-content")
        ?.scrollIntoView({ block: "start" });
      setMenu(false);
      setDirty(false);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (dialog) {
      setDialogError("");
      dialogRef.current?.showModal();
      dialogRef.current
        ?.querySelector<HTMLInputElement>("input,textarea,select")
        ?.focus();
    } else dialogRef.current?.close();
  }, [dialog]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const navigate = (to: string) => {
    if (dirty && !confirm("You have unsaved changes. Leave without saving?"))
      return false;
    setDirty(false);
    setMenu(false);
    location.hash = to;
    return true;
  };
  const open = (value: DialogState) => {
    setDialog(value);
  };
  const mutate: Mutation = async (payload, message = "Changes saved") => {
    setBusy(true);
    setDialogError("");
    try {
      const r = await apiFetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders() },
        body: JSON.stringify(payload),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      await load();
      setNotice(message);
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not save.";
      setDialogError(m);
      setNotice(m);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const [page, id] = route.split("/");
  useEffect(() => {
    const canvasOpen = page === "canvas" && !!id;
    if (!canvasOpen && !["home", "calendar", "rooms"].includes(page)) return;
    const timer = setInterval(
      () => {
        if (!document.hidden) void load();
      },
      canvasOpen ? 3000 : 15000,
    );
    return () => clearInterval(timer);
  }, [page, id, load]);
  const active = data?.projects.filter((p) => p.status === "active") ?? [],
    project = data?.projects.find((p) => p.id === id),
    session = data?.sessions.find((s) => s.id === id),
    pending = data?.decisions.filter((d) => d.status === "draft") ?? [];
  const match = (text: string) =>
    text.toLowerCase().includes(query.toLowerCase());
  const projectName = (p: string) =>
    data?.projects.find((x) => x.id === p)?.title ?? "Project";
  const sessionProject = (s: string) =>
    data?.sessions.find((x) => x.id === s)?.project_id ?? "";
  const button = (label: string, onClick: () => void, primary = false) => (
    <button
      className={`button ${primary ? "primary" : "secondary"}`}
      onClick={onClick}
      disabled={busy}
    >
      {label}
    </button>
  );
  const sessionRow = (s: Session) => (
    <button
      className="session-row"
      key={s.id}
      onClick={() => navigate("session/" + s.id)}
    >
      <span className="session-date">
        <strong>
          {new Date(s.scheduled_at).toLocaleDateString(undefined, {
            day: "2-digit",
          })}
        </strong>
        <small>
          {new Date(s.scheduled_at).toLocaleDateString(undefined, {
            month: "short",
          })}
        </small>
      </span>
      <span className="session-icon">
        <Video size={19} />
      </span>
      <span className="grow">
        <strong>{s.title}</strong>
        <small>
          {projectName(s.project_id)} ·{" "}
          {new Date(s.scheduled_at).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </small>
      </span>
      <Badge status={s.status} />
      <span className="session-open">
        Open <ArrowUpRight size={15} />
      </span>
    </button>
  );
  const projectCard = (p: Project) => (
    <button
      className="project-card"
      key={p.id}
      onClick={() => navigate("project/" + p.id)}
    >
      <div className="project-top">
        <span className={`project-icon ${p.color}`}>
          <FolderKanban size={22} />
        </span>
        <ArrowUpRight size={18} />
      </div>
      <h3>{p.title}</h3>
      <p>{p.description || "A shared space for this project’s work."}</p>
      <div className="project-bottom">
        <span>
          {data?.sessions.filter((s) => s.project_id === p.id).length} sessions
        </span>
        <span>
          <CircleDot size={12} />{" "}
          {
            data?.decisions.filter(
              (d) =>
                sessionProject(d.session_id) === p.id &&
                d.status === "accepted",
            ).length
          }{" "}
          decisions
        </span>
      </div>
      {p.status === "archived" && <Badge status="archived" />}
    </button>
  );
  const decisionCard = (d: Decision) => (
    <article className="decision-card" key={d.id}>
      <div className="decision-head">
        <Badge status={d.status} />
        <button
          className="text-button"
          onClick={() => navigate("session/" + d.session_id)}
        >
          View source <ArrowUpRight size={14} />
        </button>
      </div>
      <h3>{d.title}</h3>
      <p>
        Owner: {d.owner}
        {d.due_at
          ? " · Due " + new Date(d.due_at + "T12:00:00").toLocaleDateString()
          : ""}
      </p>
      {d.status === "draft" &&
        data?.projects.find((p) => p.id === sessionProject(d.session_id))
          ?.status === "active" && (
          <div className="button-row">
            {button(
              "Accept",
              () => open({ kind: "review", id: d.id, status: "accepted" }),
              true,
            )}
            {button("Reject", () =>
              open({ kind: "review", id: d.id, status: "rejected" }),
            )}
          </div>
        )}
      {data?.audit
        .filter((a) => a.artifact_id === d.id)
        .slice(0, 2)
        .map((a) => (
          <small className="audit-caption" key={a.id}>
            {a.action} · {a.actor} · {date(a.at)}
          </small>
        ))}
    </article>
  );
  const pageTitle =
    page === "project"
      ? project?.title
      : page === "session"
        ? session?.title
        : (navItems.find((n) => n.id === page)?.label ?? "Workspace settings");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      v = (k: string) => String(f.get(k) ?? "");
    let payload: Record<string, unknown> = {};
    const kind = dialog?.kind;
    if (kind === "setup")
      payload = {
        action: "setup",
        name: v("name"),
        transcription: f.has("transcription"),
        sample: f.has("sample"),
      };
    if (kind === "project")
      payload = {
        action: "project",
        title: v("title"),
        description: v("description"),
        color: v("color"),
      };
    if (kind === "session") {
      const time = new Date(v("scheduledAt"));
      if (isNaN(time.getTime())) {
        setDialogError("Choose a valid date and time.");
        return;
      }
      payload = {
        action: "session",
        projectId: v("projectId"),
        title: v("title"),
        scheduledAt: time.toISOString(),
      };
    }
    if (kind === "decision")
      payload = {
        action: "decision",
        sessionId: dialog?.id,
        title: v("title"),
        owner: v("owner"),
        dueAt: v("dueAt") || null,
      };
    if (kind === "archive")
      payload = {
        action: "archive",
        id: dialog?.id,
        archived: dialog?.status !== "archived",
      };
    if (kind === "review") {
      const d = data?.decisions.find((d) => d.id === dialog?.id);
      payload = {
        action: "review",
        id: d?.id,
        version: d?.version,
        status: dialog?.status,
      };
    }
    if (
      await mutate(
        payload,
        kind === "setup"
          ? "Your workspace is ready"
          : kind === "review"
            ? "Decision " + dialog?.status
            : "Saved successfully",
      )
    ) {
      setDialog(null);
      if (kind === "project") navigate("projects");
      if (kind === "session") navigate("rooms");
    }
  }
  if (page === "room" && id)
    return (
      <Suspense
        fallback={
          <main className="loading">
            <h2>Opening your room…</h2>
          </main>
        }
      >
        <LiveRoom
          key={id}
          sessionId={id}
          back={() => navigate("rooms")}
          setDirty={setDirty}
        />
      </Suspense>
    );
  if (!data)
    return (
      <main className="loading">
        <span className="brand-mark">M</span>
        <h2>
          {error ? "Could not open workspace" : "Opening your workspace…"}
        </h2>
        {error && (
          <>
            <p role="alert">{error}</p>
            {button("Try again", () => void load(), true)}
          </>
        )}
      </main>
    );
  return (
    <div
      className={`app-shell page-${page} ${page === "canvas" && id ? "canvas-detail-page" : ""}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside
        className={`sidebar ${menu ? "open" : ""}`}
        inert={mobile && !menu}
        aria-hidden={mobile && !menu}
      >
        <button
          className="brand"
          aria-label="Mayraviq home"
          onClick={() => navigate("home")}
        >
          <span className="brand-mark">M</span>
          <span>Mayraviq</span>
        </button>
        <button
          className="workspace-switch"
          aria-label="Workspace settings"
          onClick={() => navigate("settings")}
        >
          <span className="workspace-avatar">
            {(data.workspace?.name || "Your workspace")
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <span className="grow">
            <strong>{data.workspace?.name || "Your workspace"}</strong>
            <small>Shared workspace</small>
          </span>
          <ChevronDown size={16} />
        </button>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navItems.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id || (page === "project" && n.id === "projects") || (page === "session" && n.id === "rooms") ? "selected" : ""}`}
              title={n.label}
              aria-label={n.label}
              aria-current={
                page === n.id ||
                (page === "project" && n.id === "projects") ||
                (page === "session" && n.id === "rooms")
                  ? "page"
                  : undefined
              }
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "decisions" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="mini-star">✦</span>
            <strong>Ideas become progress.</strong>
            <p>A little context goes a long way.</p>
            <button onClick={() => navigate("knowledge")}>
              Find your context <ArrowRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "selected" : ""}`}
            aria-label="Settings"
            title="Settings"
            onClick={() => navigate("settings")}
          >
            <Settings size={19} /> <span>Settings</span>
          </button>
          <a
            className="nav-item"
            href="#home"
            onClick={(event) => {
              event.preventDefault();
              void signOut();
            }}
            aria-label="Sign out"
            title="Sign out"
            target="_top"
          >
            <LogOut size={19} /> <span>Sign out</span>
          </a>
          <div className="account">
            <span className="avatar">
              {data.user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{data.user.displayName}</strong>
              <small>
                {data.workspace?.role === "member"
                  ? "Workspace member"
                  : "Workspace owner"}
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        {mobile && menu && (
          <button
            className="nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <button
            className="mobile-brand"
            onClick={() => navigate("home")}
            aria-label="Mayraviq home"
          >
            <span className="brand-mark">M</span>
            <span>Mayraviq</span>
          </button>
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{page === "home" ? "Overview" : pageTitle}</strong>
          </span>
          <div className="header-actions">
            <MeetingInvitationInbox navigate={navigate} />
            <button
              className="workspace-search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Search workspace"
            >
              <Search size={18} />
              <span>Search your workspace…</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="button primary create"
              onClick={() =>
                open({ kind: data.workspace ? "create" : "setup" })
              }
            >
              <Plus size={18} /> <span>Create</span>
            </button>
            <span
              className="avatar header-avatar"
              aria-label={data.user.displayName}
            >
              {data.user.displayName.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          {(page === "project" ||
            page === "session" ||
            (page === "canvas" && id)) && (
            <button
              className="back-link"
              onClick={() =>
                navigate(
                  page === "project"
                    ? "projects"
                    : page === "session"
                      ? "rooms"
                      : "canvas",
                )
              }
            >
              <ChevronLeft size={16} /> Back to{" "}
              {page === "project"
                ? "projects"
                : page === "session"
                  ? "rooms"
                  : "canvases"}
            </button>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error} {button("Reload", () => void load())}
            </div>
          )}
          {!data.workspace && (
            <div className="setup-banner">
              <div>
                <strong>A fresh space for your next big idea.</strong>
                <p>
                  Create your workspace to start saving projects, sessions and
                  decisions.
                </p>
              </div>
              {button("Set up workspace", () => open({ kind: "setup" }), true)}
            </div>
          )}
          {page === "home" && (
            <Overview
              data={data}
              navigate={navigate}
              createProject={() =>
                open({ kind: data.workspace ? "project" : "setup" })
              }
              scheduleSession={() =>
                open({
                  kind: data.workspace
                    ? active.length
                      ? "session"
                      : "project"
                    : "setup",
                })
              }
              renderProject={projectCard}
              renderSession={sessionRow}
            />
          )}
          {page === "discussions" && (
            <Discussions
              key={data.workspace?.id || "no-workspace"}
              id={id}
              workspace={data}
              navigate={navigate}
              reloadWorkspace={load}
            />
          )}
          {page === "rooms" && (
            <Rooms
              data={data}
              navigate={navigate}
              schedule={() =>
                open({ kind: active.length ? "session" : "project" })
              }
            />
          )}
          {page === "projects" && (
            <>
              <PageHeading
                title="Projects"
                description="A home for the work you’re building together."
                action={
                  data.workspace &&
                  button("New project", () => open({ kind: "project" }), true)
                }
              />
              <Filters
                values={["all", "active", "archived"]}
                value={filter}
                setValue={setFilter}
                search={{ query, onChange: setQuery, label: "Filter " + page }}
              />
              <div className="project-grid">
                {data.projects
                  .filter(
                    (p) =>
                      (filter === "all" || p.status === filter) &&
                      match(p.title + " " + p.description),
                  )
                  .map(projectCard)}
              </div>
              {!data.projects.some(
                (p) =>
                  (filter === "all" || p.status === filter) &&
                  match(p.title + " " + p.description),
              ) && (
                <div className="panel">
                  <Empty
                    title="No projects here yet"
                    text="Create your first project or try a different search."
                  />
                </div>
              )}
            </>
          )}
          {page === "project" &&
            (project ? (
              <>
                <PageHeading
                  title={project.title}
                  description={project.description}
                  action={button(
                    project.status === "archived"
                      ? "Restore project"
                      : "Archive project",
                    () =>
                      open({
                        kind: "archive",
                        id: project.id,
                        status: project.status,
                      }),
                  )}
                />
                <Badge status={project.status} />
                <div className="detail-grid">
                  <section>
                    <SectionTitle
                      title="Sessions"
                      action={
                        project.status === "active" &&
                        button("Schedule session", () =>
                          open({ kind: "session", id: project.id }),
                        )
                      }
                    />
                    <div className="panel">
                      {data.sessions
                        .filter(
                          (s) => s.project_id === project.id && match(s.title),
                        )
                        .map(sessionRow)}
                      {!data.sessions.some(
                        (s) => s.project_id === project.id,
                      ) && (
                        <Empty
                          title="Start a conversation"
                          text="Session notes and decisions will stay connected to this project."
                        />
                      )}
                    </div>
                    <SectionTitle title="Decisions" />
                    <div className="decision-grid">
                      {data.decisions
                        .filter(
                          (d) =>
                            sessionProject(d.session_id) === project.id &&
                            match(d.title),
                        )
                        .map(decisionCard)}
                      {!data.decisions.some(
                        (d) => sessionProject(d.session_id) === project.id,
                      ) && (
                        <div className="panel">
                          <Empty
                            title="Decisions with a source"
                            text="Propose decisions from a session, then review them here."
                          />
                        </div>
                      )}
                    </div>
                  </section>
                  <aside>
                    <div className="panel project-context">
                      <span className={`project-icon ${project.color}`}>
                        <LayoutDashboard />
                      </span>
                      <h3>Make room for ideas</h3>
                      <p>Map the next step on your project canvas.</p>
                      {button(
                        "Open canvas",
                        () => navigate("canvas/" + project.id),
                        true,
                      )}
                    </div>
                    <div className="panel project-context">
                      <ShieldCheck />
                      <h3>Project context</h3>
                      <p>Created {date(project.created_at, true)}.</p>
                      <p>
                        {project.status === "archived"
                          ? "Archived projects are read-only. Restore this project to make changes."
                          : "Shared within your workspace. Workspace members can access this project."}
                      </p>
                    </div>
                  </aside>
                </div>
              </>
            ) : (
              <Empty
                title="Project unavailable"
                text="This project does not exist in your workspace."
              />
            ))}
          {page === "calendar" && (
            <>
              <PageHeading
                title="Your calendar"
                description="Your scheduled work, in your local timezone."
                action={
                  data.workspace &&
                  button(
                    "Schedule session",
                    () => open({ kind: "session" }),
                    true,
                  )
                }
              />
              <div className="info-strip">
                <Video size={18} /> Keep notes and decisions with each session.
                Open a room to call and design together.
              </div>
              <Filters
                values={["all", "open", "scheduled", "active", "ended"]}
                value={filter}
                setValue={setFilter}
                search={{ query, onChange: setQuery, label: "Filter " + page }}
              />
              <WorkspaceCalendar
                sessions={data.sessions.filter(
                  (s) =>
                    (filter === "open"
                      ? s.status !== "ended" &&
                        active.some((p) => p.id === s.project_id)
                      : filter === "all" || s.status === filter) &&
                    match(s.title + " " + projectName(s.project_id)),
                )}
                projects={data.projects}
                navigate={navigate}
              />
              <p className="footnote">
                Times shown in{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}. External
                calendar sync is not connected.
              </p>
            </>
          )}
          {page === "session" &&
            (session ? (
              <SessionView
                key={session.id + session.version}
                session={session}
                project={data.projects.find(
                  (p) => p.id === session.project_id,
                )!}
                decisions={data.decisions.filter(
                  (d) => d.session_id === session.id,
                )}
                mutate={mutate}
                busy={busy}
                openDecision={() => open({ kind: "decision", id: session.id })}
                renderDecision={decisionCard}
                setDirty={setDirty}
                openCall={() => navigate("room/" + session.id)}
                openDiscussion={async () => {
                  try {
                    const r = await discussionRequest({
                      action: "room",
                      sessionId: session.id,
                    });
                    navigate("discussions/" + r.id);
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              />
            ) : (
              <Empty
                title="Session unavailable"
                text="This session does not exist in your workspace."
              />
            ))}
          {page === "decisions" && (
            <>
              <PageHeading
                title="Decisions"
                description="Clear next steps. Traceable context. Your approval."
              />
              <Filters
                values={["all", "draft", "accepted", "rejected"]}
                value={filter}
                setValue={setFilter}
                search={{ query, onChange: setQuery, label: "Filter " + page }}
              />
              <div className="decision-grid">
                {data.decisions
                  .filter(
                    (d) =>
                      (filter === "all" || d.status === filter) &&
                      match(d.title + " " + d.owner),
                  )
                  .map(decisionCard)}
              </div>
              {!data.decisions.some(
                (d) =>
                  (filter === "all" || d.status === filter) &&
                  match(d.title + " " + d.owner),
              ) && (
                <div className="panel">
                  <Empty
                    title="Clarity starts with a conversation"
                    text="Propose a decision inside a session. It will wait here for human review."
                  />
                </div>
              )}
            </>
          )}
          {page === "canvas" && (
            <>
              {!id ? (
                <CanvasLibrary
                  data={data}
                  navigate={navigate}
                  createProject={() =>
                    open({ kind: data.workspace ? "project" : "setup" })
                  }
                />
              ) : data.canvases.find((c) => c.project_id === id) ? (
                <CanvasEditor
                  key={id}
                  project={data.projects.find((p) => p.id === id)!}
                  canvas={data.canvases.find((c) => c.project_id === id)!}
                  mutate={mutate}
                  busy={busy}
                  setDirty={setDirty}
                />
              ) : (
                <Empty
                  title="Canvas unavailable"
                  text="Choose a project to open its canvas."
                />
              )}
            </>
          )}
          {page === "knowledge" && (
            <>
              <PageHeading
                title="Intelligence & memory"
                description="Find the context behind your next step."
              />
              <section className="knowledge-hero">
                <Sparkles size={28} />
                <h2>Your work has a memory.</h2>
                <p>
                  Search your saved session notes, recaps and decisions.
                  <br />
                  Every result links back to its source.
                </p>
                <div className="search-field large">
                  <Search size={20} />
                  <input
                    aria-label="Search workspace evidence"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for a topic, idea or decision…"
                  />
                </div>
                <small>
                  Evidence search is available. AI-generated answers require a
                  model connection.
                </small>
              </section>
              <SectionTitle
                title={query ? "Matching sources" : "Recent sources"}
              />
              <div className="source-list">
                {data.sessions
                  .filter((s) =>
                    match(s.title + " " + s.notes + " " + s.summary),
                  )
                  .map((s) => (
                    <button
                      className="panel source-card"
                      key={s.id}
                      onClick={() => navigate("session/" + s.id)}
                    >
                      <FileText size={22} />
                      <div>
                        <span className="eyebrow">SESSION SOURCE</span>
                        <h3>{s.title}</h3>
                        <p>
                          {(
                            s.summary ||
                            s.notes ||
                            "No notes captured yet."
                          ).slice(0, 230)}
                        </p>
                        <small>
                          {projectName(s.project_id)} · {date(s.scheduled_at)}
                        </small>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                {data.decisions
                  .filter((d) => match(d.title + " " + d.owner))
                  .map((d) => (
                    <button
                      className="panel source-card"
                      key={d.id}
                      onClick={() => navigate("session/" + d.session_id)}
                    >
                      <CheckCheck size={22} />
                      <div>
                        <span className="eyebrow">DECISION SOURCE</span>
                        <h3>{d.title}</h3>
                        <Badge status={d.status} />
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                {!data.sessions.some((s) =>
                  match(s.title + " " + s.notes + " " + s.summary),
                ) &&
                  !data.decisions.some((d) =>
                    match(d.title + " " + d.owner),
                  ) && (
                    <div className="panel">
                      <Empty
                        title="No evidence found"
                        text="Try another term or capture notes in a session first."
                      />
                    </div>
                  )}
              </div>
            </>
          )}
          {page === "settings" && (
            <SettingsView
              data={data}
              mutate={mutate}
              busy={busy}
              setup={() => open({ kind: "setup" })}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            MAYRAVIQ <span className="muted">/</span> A space for what’s next
          </span>
          <span>First release · Private workspace</span>
        </footer>
      </div>
      {mobile && (
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {navItems
            .filter((n) =>
              ["home", "discussions", "rooms", "canvas"].includes(n.id),
            )
            .map((n) => (
              <button
                key={n.id}
                aria-label={n.label}
                aria-current={
                  page === n.id ||
                  (page === "project" && n.id === "projects") ||
                  (page === "session" && n.id === "rooms")
                    ? "page"
                    : undefined
                }
                onClick={() => navigate(n.id)}
              >
                <n.icon size={21} />
                <span>{n.label}</span>
              </button>
            ))}
          <button
            aria-label={menu ? "Close more navigation" : "More navigation"}
            aria-expanded={menu}
            className={
              menu ||
              [
                "projects",
                "project",
                "knowledge",
                "decisions",
                "calendar",
                "settings",
              ].includes(page)
                ? "selected"
                : ""
            }
            onClick={() => setMenu((v) => !v)}
          >
            <MoreHorizontal size={22} />
            <span>More</span>
          </button>
        </nav>
      )}
      {searchOpen && (
        <WorkspaceSearch
          data={data}
          close={() => setSearchOpen(false)}
          navigate={navigate}
        />
      )}
      <div
        className={`toast ${notice ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setDialog(null);
        }}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
      >
        <form onSubmit={submit}>
          <div className="dialog-heading">
            <span className="eyebrow">MAYRAVIQ WORKSPACE</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Close dialog"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              <X />
            </button>
          </div>
          <h2>
            {dialog?.kind === "create"
              ? "What would you like to create?"
              : dialog?.kind === "setup"
                ? "Make this space yours."
                : dialog?.kind === "project"
                  ? "Create a project"
                  : dialog?.kind === "session"
                    ? "Schedule a session"
                    : dialog?.kind === "decision"
                      ? "Propose a decision"
                      : dialog?.kind === "archive"
                        ? dialog.status === "archived"
                          ? "Restore this project?"
                          : "Archive this project?"
                        : `${dialog?.status === "accepted" ? "Accept" : "Reject"} this decision?`}
          </h2>
          {dialog?.kind === "create" && (
            <>
              <p>Start something new in your workspace.</p>
              <div className="create-options">
                {[
                  {
                    icon: MessageCircle,
                    label: "Discussion",
                    description: "Channels, groups and peer conversations",
                    kind: "discussions",
                    color: "blue",
                  },
                  {
                    icon: FolderKanban,
                    label: "Project",
                    description: "Connect sessions, ideas and decisions",
                    kind: "project",
                    color: "blue",
                  },
                  {
                    icon: Video,
                    label: "Session",
                    description: active.length
                      ? "Schedule time and capture the context"
                      : "Create a project first to host your session",
                    kind: active.length ? "session" : "project",
                    color: "teal",
                  },
                  {
                    icon: LayoutDashboard,
                    label: "Canvas",
                    description: "Open a visual space for your project",
                    kind: "canvas",
                    color: "violet",
                  },
                ].map((a) => (
                  <button
                    type="button"
                    key={a.label}
                    onClick={() => {
                      if (a.kind === "canvas" || a.kind === "discussions") {
                        if (navigate(a.kind)) setDialog(null);
                      } else open({ kind: a.kind });
                    }}
                  >
                    <span className={`quick-icon ${a.color}`}>
                      <a.icon size={23} />
                    </span>
                    <span className="grow">
                      <strong>{a.label}</strong>
                      <small>{a.description}</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            </>
          )}
          {dialog?.kind === "setup" && (
            <>
              <p>
                Start with a private workspace. You can build your team later.
              </p>
              <label>
                Workspace name
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="e.g. Mayraviq Studio"
                  autoFocus
                />
              </label>
              <label className="checkbox-label">
                <input name="transcription" type="checkbox" />
                <span>
                  Allow transcription when the service is connected
                  <small>
                    Off by default. Future sessions must still show participant
                    notice and consent.
                  </small>
                </span>
              </label>
              <label className="checkbox-label">
                <input name="sample" type="checkbox" />
                <span>
                  Include an example project
                  <small>
                    Illustrative notes, a draft decision and a canvas to
                    explore.
                  </small>
                </span>
              </label>
              <div className="info-strip">
                <ShieldCheck size={18} /> Recording stays off. No media is
                captured.
              </div>
            </>
          )}
          {dialog?.kind === "project" && (
            <>
              <p>Connect your sessions, context and decisions in one place.</p>
              <label>
                Project name
                <input
                  name="title"
                  required
                  maxLength={120}
                  placeholder="e.g. Product launch"
                  autoFocus
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  maxLength={1000}
                  rows={3}
                  placeholder="What are you working toward?"
                />
              </label>
              <label>
                Project color
                <select name="color">
                  <option value="blue">Cobalt</option>
                  <option value="teal">Teal</option>
                  <option value="violet">Violet</option>
                  <option value="amber">Amber</option>
                </select>
              </label>
            </>
          )}
          {dialog?.kind === "session" && (
            <>
              <p>
                A session workspace keeps the notes and next steps together.
              </p>
              {!active.length && (
                <div className="error-banner">
                  Create an active project before scheduling a session.
                </div>
              )}
              <label>
                Session title
                <input
                  name="title"
                  required
                  maxLength={120}
                  placeholder="e.g. Weekly product sync"
                  autoFocus
                />
              </label>
              <label>
                Project
                <select
                  name="projectId"
                  required
                  defaultValue={dialog.id ?? active[0]?.id}
                >
                  {active.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date & time
                <input type="datetime-local" name="scheduledAt" required />
              </label>
              <small>
                Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </small>
            </>
          )}
          {dialog?.kind === "decision" && (
            <>
              <p>
                This proposal remains a draft until you explicitly review it.
              </p>
              <label>
                Proposed decision
                <textarea
                  name="title"
                  required
                  maxLength={1000}
                  rows={3}
                  autoFocus
                  placeholder="What should happen next?"
                />
              </label>
              <label>
                Owner
                <input
                  name="owner"
                  required
                  maxLength={120}
                  defaultValue={data.user.displayName}
                />
              </label>
              <label>
                Due date <span className="muted">(optional)</span>
                <input type="date" name="dueAt" />
              </label>
            </>
          )}
          {dialog?.kind === "archive" && (
            <p>
              {dialog.status === "archived"
                ? "The project will become editable again."
                : "Sessions, decisions and canvas will become read-only. You can restore this project later."}
            </p>
          )}
          {dialog?.kind === "review" && (
            <>
              <p>{data.decisions.find((d) => d.id === dialog.id)?.title}</p>
              <div className="info-strip">
                <ShieldCheck size={18} /> Your review will be saved with your
                name and timestamp.
              </div>
            </>
          )}
          {dialogError && (
            <p className="form-error" role="alert">
              {dialogError}
            </p>
          )}
          {dialog?.kind !== "create" && (
            <div className="dialog-footer">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={
                  busy || (dialog?.kind === "session" && !active.length)
                }
              >
                {busy
                  ? "Saving…"
                  : dialog?.kind === "setup"
                    ? "Create workspace"
                    : dialog?.kind === "review"
                      ? "Confirm review"
                      : dialog?.kind === "archive"
                        ? "Confirm"
                        : "Save"}
                {!busy && <ArrowRight size={16} />}
              </button>
            </div>
          )}
        </form>
      </dialog>
    </div>
  );
}
function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">YOUR WORKSPACE</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Filters({
  values,
  value,
  setValue,
  search,
}: {
  values: string[];
  value: string;
  setValue: (v: string) => void;
  search?: { query: string; onChange: (v: string) => void; label: string };
}) {
  return (
    <div className="list-toolbar">
      <div className="filters" aria-label="Filter results">
        {values.map((v) => (
          <button
            key={v}
            aria-pressed={value === v}
            className={value === v ? "selected" : ""}
            onClick={() => setValue(v)}
          >
            {v === "all"
              ? "All"
              : v === "open"
                ? "Upcoming"
                : v === "draft"
                  ? "Needs review"
                  : v === "active"
                    ? "In progress"
                    : v === "ended"
                      ? "Completed"
                      : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      {search && (
        <div className="list-search">
          <Search size={17} />
          <input
            aria-label={search.label}
            placeholder="Filter this list…"
            value={search.query}
            onChange={(e) => search.onChange(e.target.value)}
          />
          {search.query && (
            <button
              className="icon-button"
              aria-label="Clear list filter"
              onClick={() => search.onChange("")}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function SessionView({
  session: s,
  project,
  decisions,
  mutate,
  busy,
  openDecision,
  renderDecision,
  setDirty,
  openDiscussion,
  openCall,
}: {
  session: Session;
  project: Project;
  decisions: Decision[];
  mutate: Mutation;
  busy: boolean;
  openDecision: () => void;
  renderDecision: (d: Decision) => React.ReactNode;
  setDirty: (b: boolean) => void;
  openDiscussion: () => void;
  openCall: () => void;
}) {
  const [notes, setNotes] = useState(s.notes),
    [summary, setSummary] = useState(s.summary),
    [tab, setTab] = useState("notes");
  const readOnly = project.status === "archived";
  const unsaved = notes !== s.notes || summary !== s.summary;
  useEffect(() => setDirty(unsaved), [unsaved, setDirty]);
  const save = async (status = s.status) => {
    if (
      await mutate(
        {
          action: "sessionUpdate",
          id: s.id,
          version: s.version,
          status,
          notes,
          summary,
        },
        status === "ended" && s.status !== "ended"
          ? "Session ended. Recap is ready to edit."
          : "Session saved",
      )
    )
      setDirty(false);
  };
  return (
    <>
      <PageHeading
        title={s.title}
        description={`${project.title} · ${date(s.scheduled_at, true)}`}
        action={<Badge status={s.status} />}
      />
      <div className="session-discussion-link">
        <button
          className="button secondary"
          onClick={openDiscussion}
          disabled={project.status === "archived"}
        >
          <MessageCircle size={17} /> Open room discussion
        </button>
      </div>
      <div className="session-stage">
        <div className="stage-symbol">
          <Video size={25} />
        </div>
        <div className="session-stage-copy">
          <span className="eyebrow">PROJECT SESSION</span>
          <h2>
            {s.status === "ended"
              ? "Session recap"
              : "Notes and decisions, connected."}
          </h2>
          <p>
            Call, design, take notes and turn the conversation into next steps.
          </p>
        </div>
        <div className="stage-controls">
          <button
            className="button primary"
            disabled={readOnly || s.status === "ended"}
            onClick={openCall}
          >
            <Video size={16} /> Enter call room
          </button>
          <span>
            <ShieldCheck size={15} /> Recording off
          </span>
          <span>
            <CircleDot size={15} /> Private workspace
          </span>
          {s.status === "scheduled" && !readOnly && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void save("active")}
            >
              Start workspace
            </button>
          )}
          {s.status === "active" && !readOnly && (
            <button
              className="button danger"
              disabled={busy}
              onClick={() => {
                if (confirm("End this session and move to its recap?"))
                  void save("ended");
              }}
            >
              End session
            </button>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <section>
          <div className="editor-header">
            <div className="filters">
              <button
                aria-pressed={tab === "notes"}
                className={tab === "notes" ? "selected" : ""}
                onClick={() => setTab("notes")}
              >
                Session notes
              </button>
              <button
                aria-pressed={tab === "recap"}
                className={tab === "recap" ? "selected" : ""}
                onClick={() => setTab("recap")}
              >
                Recap
              </button>
            </div>
            <span className={`save-state ${unsaved ? "unsaved" : ""}`}>
              {readOnly ? "Read-only" : unsaved ? "Unsaved changes" : "Saved"}
            </span>
            <button
              className="button primary"
              disabled={busy || readOnly || !unsaved}
              onClick={() => void save()}
            >
              <Save size={15} />
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
          <div className="panel editor">
            <label>
              {tab === "notes" ? "Notes" : "Recap summary"}
              <span className="muted"> · Written by you</span>
              <textarea
                rows={12}
                value={tab === "notes" ? notes : summary}
                disabled={readOnly}
                maxLength={tab === "notes" ? 30000 : 10000}
                placeholder={
                  tab === "notes"
                    ? "Capture the conversation, important context and next steps…"
                    : "Write a clear summary of what was discussed…"
                }
                onChange={(e) => {
                  setDirty(true);
                  if (tab === "notes") setNotes(e.target.value);
                  else setSummary(e.target.value);
                }}
              />
            </label>
            <small>
              {readOnly
                ? "Archived project · Read-only"
                : "Save changes to preserve these notes. AI does not generate or approve this content."}
            </small>
          </div>
        </section>
        <aside>
          <SectionTitle
            title="Decisions"
            action={
              !readOnly && (
                <button className="text-button" onClick={openDecision}>
                  <Plus size={15} /> Propose
                </button>
              )
            }
          />
          <div className="decision-grid single">
            {decisions.map(renderDecision)}
            {!decisions.length && (
              <div className="panel">
                <Empty
                  title="A clear next step"
                  text="Propose a decision, assign its owner and review it before accepting."
                />
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
function SettingsView({
  data,
  mutate,
  busy,
  setup,
}: {
  data: WorkspaceData;
  mutate: Mutation;
  busy: boolean;
  setup: () => void;
}) {
  return (
    <>
      <PageHeading
        title="Workspace settings"
        description="A trusted foundation for your work."
      />
      {!data.workspace ? (
        <Empty
          title="Create your workspace"
          text="Set a name and review the privacy defaults to begin."
          action={
            <button className="button primary" onClick={setup}>
              Set up workspace
            </button>
          }
        />
      ) : (
        <div className="settings-grid">
          <form
            key={data.workspace.name + data.workspace.transcription}
            className="panel settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void mutate(
                {
                  action: "settings",
                  name: String(f.get("name")),
                  transcription: f.has("transcription"),
                },
                "Workspace preferences saved",
              );
            }}
          >
            <h2>Organization & privacy</h2>
            <label>
              Workspace name
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={data.workspace.name}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="transcription"
                defaultChecked={!!data.workspace.transcription}
              />
              <span>
                Allow transcription when connected
                <small>
                  A stored preference. No audio is captured in this release.
                  Future sessions need participant notice.
                </small>
              </span>
            </label>
            <div className="info-strip">
              <ShieldCheck size={20} /> Recording is off. Session notes are
              entered manually.
            </div>
            <button
              className="button primary"
              disabled={busy || data.workspace.role === "member"}
            >
              {busy ? "Saving…" : "Save preferences"}
            </button>
            <h3>Your account</h3>
            <p>
              {data.user.displayName}
              <br />
              <span className="muted">{data.user.email}</span>
            </p>
            <h3>Connections</h3>
            <p className="muted">
              Invite teammates from Discussions. Media and AI services are
              configured by your administrator. Calendar provider integration is
              not connected.
            </p>
          </form>
          <section className="panel settings-form">
            <h2>Audit history</h2>
            <p className="muted">
              Recent changes in your workspace. Approvals include their actor
              and timestamp.
            </p>
            {data.audit.map((a) => (
              <div className="audit-row" key={a.id}>
                <span className="activity-dot" />
                <div>
                  <strong>{a.action}</strong>
                  <small>
                    {a.actor} · {date(a.at, true)}
                  </small>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
