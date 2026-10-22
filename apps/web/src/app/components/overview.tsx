import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  FolderKanban,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Sparkles,
  Video,
  MessageCircle,
} from "lucide-react";
import type {
  Project,
  Session,
  WorkspaceData,
} from "@mayraviq/contracts/types";

type Props = {
  data: WorkspaceData;
  navigate: (route: string) => boolean;
  createProject: () => void;
  scheduleSession: () => void;
  renderProject: (project: Project) => React.ReactNode;
  renderSession: (session: Session) => React.ReactNode;
};
export default function Overview({
  data,
  navigate,
  createProject,
  scheduleSession,
  renderProject,
  renderSession,
}: Props) {
  const active = data.projects.filter((p) => p.status === "active");
  const sessions = data.sessions.filter(
    (s) => s.status !== "ended" && active.some((p) => p.id === s.project_id),
  );
  const drafts = data.decisions.filter((d) => d.status === "draft");
  const sources = data.sessions.filter(
    (s) => s.notes.trim() || s.summary.trim(),
  );
  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 17
        ? "Good afternoon"
        : "Good evening";
  const name = data.user.displayName.includes("@")
    ? "there"
    : data.user.displayName.split(" ")[0];
  const actions = [
    {
      icon: MessageCircle,
      title: "Start a discussion",
      text: "Your people, one conversation",
      color: "blue",
      run: () => navigate("discussions"),
    },
    {
      icon: Plus,
      title: "New project",
      text: "Give your work a home",
      color: "violet",
      run: createProject,
    },
    {
      icon: LayoutDashboard,
      title: "Open canvas",
      text: "Map an idea",
      color: "teal",
      run: () => navigate("canvas"),
    },
    {
      icon: Sparkles,
      title: "Find context",
      text: "Search your saved work",
      color: "amber",
      run: () => navigate("knowledge"),
    },
  ];
  return (
    <div className="overview">
      <div className="page-heading overview-heading">
        <div>
          <span className="eyebrow">WORKSPACE OVERVIEW</span>
          <h1>
            {greeting}, {name}
            <span className="greeting-dot">.</span>
          </h1>
          <p>Here’s what’s happening in your workspace.</p>
        </div>
        <span className="today">
          <CalendarDays size={17} />
          {now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
      <section
        className="workspace-hero"
        aria-label="Collaborate with your team"
      >
        <div className="workspace-hero-copy">
          <span className="hero-label">
            <span /> A SPACE TO THINK TOGETHER
          </span>
          <h2>
            Bring your team.
            <br />
            <span>Build the idea.</span>
          </h2>
          <p>
            Meet in a room, sketch on a shared canvas, and turn the conversation
            into a clear next step.
          </p>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={() => navigate("rooms")}
            >
              <Video size={18} /> Open rooms <ArrowRight size={17} />
            </button>
            <button
              className="button secondary"
              onClick={() => navigate("canvas")}
            >
              <LayoutDashboard size={17} /> Explore canvas
            </button>
          </div>
          <span className="hero-privacy">
            <ShieldCheck size={14} /> Your workspace. Your team's context.
          </span>
        </div>
        <div className="collaboration-illustration" aria-hidden="true">
          <div className="illustration-board">
            <div className="illustration-toolbar">
              <span className="illustration-logo">M</span>
              <strong>Idea canvas</strong>
              <span className="illustration-tools">
                <Plus size={14} />
                <LayoutDashboard size={14} />
              </span>
            </div>
            <div className="illustration-content">
              <span className="illustration-caption">
                FROM CONVERSATION TO CREATION
              </span>
              <div className="idea-flow">
                <span>Explore</span>
                <ArrowRight size={19} />
                <span>Design</span>
                <ArrowRight size={19} />
                <span>Decide</span>
              </div>
              <div className="idea-sticky">
                <span>THE NEXT BIG IDEA</span>
                <strong>
                  What could we
                  <br />
                  build together?
                </strong>
                <i />
              </div>
              <div className="idea-wireframe">
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <b />
                <b />
              </div>
            </div>
          </div>
          <div className="illustration-discussion">
            <span>
              <MessageCircle size={18} />
            </span>
            <div>
              <strong>Keep the discussion connected</strong>
              <small>Rooms · Canvas · Notes · AI</small>
            </div>
          </div>
        </div>
      </section>
      <section
        className="overview-metrics"
        aria-label="Workspace overview counts"
      >
        {[
          {
            label: "Active projects",
            value: active.length,
            detail: "Explore your projects",
            icon: FolderKanban,
            color: "blue",
            route: "projects?filter=active",
          },
          {
            label: "Planned sessions",
            value: sessions.length,
            detail: sessions.some((s) => s.status === "active")
              ? "A session is in progress"
              : "Scheduled or in progress",
            icon: Video,
            color: "teal",
            route: "rooms?filter=open",
          },
          {
            label: "Needs your review",
            value: drafts.length,
            detail: drafts.length
              ? "Decisions waiting for you"
              : "All decisions reviewed",
            icon: CheckCheck,
            color: "violet",
            route: "decisions?filter=draft",
          },
        ].map((m) => (
          <button
            key={m.label}
            className={`metric-card metric-${m.color}`}
            onClick={() => navigate(m.route)}
          >
            <div className="metric-top">
              <span>{m.label}</span>
              <span className={`metric-icon ${m.color}`}>
                <m.icon size={18} />
              </span>
            </div>
            <div className="metric-bottom">
              <strong>{String(m.value).padStart(2, "0")}</strong>
              <span>
                {m.detail}
                <ArrowUpRight size={14} />
              </span>
            </div>
          </button>
        ))}
      </section>
      <section className="quick-actions" aria-label="Quick actions">
        {actions.map((a) => (
          <button className="quick-action" key={a.title} onClick={a.run}>
            <span className={`quick-icon ${a.color}`}>
              <a.icon size={21} />
            </span>
            <div>
              <strong>{a.title}</strong>
              <small>{a.text}</small>
            </div>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </section>
      <div className="dashboard-grid">
        <div className="dashboard-work">
          <section className="panel dashboard-section">
            <div className="panel-heading">
              <div>
                <h2>
                  Upcoming sessions{" "}
                  <span className="count-pill">{sessions.length}</span>
                </h2>
                <p>A place to keep the conversation moving.</p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("rooms?filter=open")}
              >
                View all <ArrowRight size={16} />
              </button>
            </div>
            {sessions.length ? (
              sessions.slice(0, 3).map(renderSession)
            ) : (
              <div className="overview-empty">
                <span className="empty-symbol">
                  <Video size={25} />
                </span>
                <div>
                  <h3>Make room for your next conversation</h3>
                  <p>
                    Schedule a session to capture notes and decisions together.
                  </p>
                </div>
                <button className="button secondary" onClick={scheduleSession}>
                  Schedule session <Plus size={16} />
                </button>
              </div>
            )}
          </section>
          <section className="recent-projects-section">
            <div className="section-title">
              <div>
                <h2>Recent projects</h2>
                <p className="section-description">
                  Pick up where you left off.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("projects?filter=active")}
              >
                All projects <ArrowRight size={16} />
              </button>
            </div>
            <div className="project-grid compact">
              {active.slice(0, 2).map(renderProject)}
              {active.length < 2 && (
                <button className="new-project-card" onClick={createProject}>
                  <span>
                    <Plus size={23} />
                  </span>
                  <strong>Create a project</strong>
                  <small>Connect ideas, sessions and next steps.</small>
                </button>
              )}
            </div>
          </section>
          <section className="context-shortcut">
            <span className="context-shortcut-icon">
              <FileContextIcon />
            </span>
            <div>
              <strong>Your context stays with you</strong>
              <p>
                {sources.length
                  ? `${sources.length} saved session ${sources.length === 1 ? "source" : "sources"}, linked to your work.`
                  : "Save session notes to build your workspace memory."}
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("knowledge")}
            >
              Explore memory <ArrowRight size={16} />
            </button>
          </section>
        </div>
        <aside className="dashboard-right">
          <section className="review-inbox">
            <div className="review-heading">
              <span className="review-symbol">
                <CheckCheck size={20} />
              </span>
              <span>DECISION INBOX</span>
              <ShieldCheck size={17} />
            </div>
            <h2>
              {drafts.length ? (
                <>
                  A clear next step
                  <br />
                  starts with you.
                </>
              ) : (
                <>
                  All caught up.
                  <br />
                  Keep moving forward.
                </>
              )}
            </h2>
            <p>
              {drafts.length
                ? `${drafts.length} proposed ${drafts.length === 1 ? "decision needs" : "decisions need"} your review before becoming part of the plan.`
                : "There are no draft decisions waiting for your approval."}
            </p>
            <div className="inbox-items">
              {drafts.slice(0, 2).map((d) => (
                <button
                  key={d.id}
                  onClick={() => navigate("session/" + d.session_id)}
                >
                  <span className="inbox-dot" />
                  <span>{d.title}</span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
              {!drafts.length && (
                <div className="inbox-clear">
                  <Check size={20} /> Human review. Traceable decisions.
                </div>
              )}
            </div>
            <button
              className="button inbox-button"
              onClick={() => navigate("decisions?filter=draft")}
            >
              Review decisions <ArrowRight size={17} />
            </button>
          </section>
          <section className="panel activity-panel">
            <div className="section-title">
              <h2>Workspace activity</h2>
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                History <ArrowUpRight size={14} />
              </button>
            </div>
            {data.audit.slice(0, 4).map((a) => (
              <div className="activity" key={a.id}>
                <span
                  className={`activity-icon ${a.action.includes("Decision") ? "teal" : a.action.includes("project") ? "violet" : "blue"}`}
                >
                  {a.action.includes("Decision") ? (
                    <CheckCheck size={15} />
                  ) : a.action.includes("project") ? (
                    <FolderKanban size={15} />
                  ) : (
                    <CalendarDays size={15} />
                  )}
                </span>
                <div>
                  <strong>{a.action}</strong>
                  <small>
                    {new Date(a.at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              </div>
            ))}
            {!data.audit.length && (
              <p className="muted activity-empty">
                Your workspace activity will appear here.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
function FileContextIcon() {
  return <Sparkles size={22} />;
}
