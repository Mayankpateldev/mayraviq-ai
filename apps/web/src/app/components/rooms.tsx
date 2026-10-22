import { useState } from "react";
import {
  Video,
  Plus,
  CalendarDays,
  ArrowUpRight,
  MessageCircle,
  FileText,
  LayoutDashboard,
  Search,
} from "lucide-react";
import type { WorkspaceData, Session } from "@mayraviq/contracts/types";
import { discussionRequest } from "../../lib/discussion-client";
export default function Rooms({
  data,
  navigate,
  schedule,
}: {
  data: WorkspaceData;
  navigate: (route: string) => boolean;
  schedule: () => void;
}) {
  const [tab, setTab] = useState("upcoming"),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [opening, setOpening] = useState("");
  const sessions = data.sessions.filter(
    (s) =>
      (tab === "upcoming"
        ? s.status === "scheduled"
        : tab === "active"
          ? s.status === "active"
          : s.status === "ended") &&
      (s.title + " " + data.projects.find((p) => p.id === s.project_id)?.title)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const chat = async (s: Session) => {
    setOpening(s.id);
    setError("");
    try {
      const r = await discussionRequest({ action: "room", sessionId: s.id });
      navigate("discussions/" + r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening("");
    }
  };
  return (
    <div className="rooms-page">
      <div className="room-page-heading">
        <div>
          <span className="eyebrow">YOUR TEAM’S WORKSPACE</span>
          <h1>Make room for ideas.</h1>
          <p>A discussion, a shared canvas, and a clear next step.</p>
        </div>
        <button className="button primary" onClick={schedule}>
          <Plus size={17} /> Schedule a room
        </button>
      </div>
      <div className="rooms-overview">
        <div>
          <Video size={20} />
          <strong>
            {data.sessions.filter((s) => s.status === "active").length}
          </strong>
          <span>Active workspaces</span>
        </div>
        <div>
          <CalendarDays size={20} />
          <strong>
            {data.sessions.filter((s) => s.status === "scheduled").length}
          </strong>
          <span>Scheduled rooms</span>
        </div>
        <p>
          Call, discuss and design in one room.
          <br />
          <span>Invite peers, teammates or clients.</span>
        </p>
      </div>
      <div className="room-list-toolbar">
        <div role="tablist" aria-label="Room status">
          {["upcoming", "active", "completed"].map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span>
                {
                  data.sessions.filter(
                    (s) =>
                      s.status ===
                      (t === "upcoming"
                        ? "scheduled"
                        : t === "completed"
                          ? "ended"
                          : "active"),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <label>
          <Search size={17} />
          <input
            placeholder="Find a room"
            aria-label="Find a room"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="discussion-error">
          {error}
        </p>
      )}
      <div className="room-card-grid">
        {sessions.map((s) => {
          const p = data.projects.find((p) => p.id === s.project_id)!;
          const dt = new Date(s.scheduled_at);
          return (
            <article className="room-card" key={s.id}>
              <div className={`room-card-cover ${p.color}`}>
                <span className="room-cover-icon">
                  <Video size={27} />
                </span>
                <span className={`room-status ${s.status}`}>
                  {s.status === "active"
                    ? "Workspace active"
                    : s.status === "ended"
                      ? "Completed"
                      : "Scheduled"}
                </span>
                <span className="room-cover-dots" />
              </div>
              <div className="room-card-body">
                <span className="room-project">{p.title}</span>
                <h2>{s.title}</h2>
                <div className="room-time">
                  <CalendarDays size={16} />
                  <span>
                    {dt.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {dt.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="room-context-tags">
                  <span>
                    <MessageCircle size={13} /> Discussion
                  </span>
                  <span>
                    <FileText size={13} /> Notes
                  </span>
                  <span>
                    <LayoutDashboard size={13} /> Canvas
                  </span>
                </div>
                <div className="room-card-actions">
                  <button
                    className="button primary"
                    disabled={!!opening || p.status === "archived"}
                    onClick={() => navigate("room/" + s.id)}
                  >
                    <Video size={16} /> Enter room
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Open discussion for " + s.title}
                    onClick={() => void chat(s)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Open canvas for " + s.title}
                    onClick={() => navigate("canvas/" + p.id)}
                  >
                    <LayoutDashboard size={18} />
                  </button>
                </div>
                {p.status === "archived" && (
                  <small>Archived project · Notes are read-only</small>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!sessions.length && (
        <div className="rooms-empty">
          <span>
            <Video size={32} />
          </span>
          <h2>
            {query
              ? "No matching rooms"
              : tab === "upcoming"
                ? "Your next conversation starts here"
                : tab === "active"
                  ? "No active workspaces"
                  : "No completed rooms yet"}
          </h2>
          <p>
            {query
              ? "Try another room or project name."
              : "Schedule a room to bring discussion, notes and ideas together."}
          </p>
          {tab === "upcoming" && !query && (
            <button className="button primary" onClick={schedule}>
              <Plus size={17} /> Schedule a room
            </button>
          )}
        </div>
      )}
    </div>
  );
}
