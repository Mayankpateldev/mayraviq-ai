import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Video,
  ArrowUpRight,
} from "lucide-react";
import type { Session, Project } from "@mayraviq/contracts/types";
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
export default function WorkspaceCalendar({
  sessions,
  projects,
  navigate,
}: {
  sessions: Session[];
  projects: Project[];
  navigate: (route: string) => boolean;
}) {
  const today = new Date();
  const [month, setMonth] = useState(
      () => new Date(today.getFullYear(), today.getMonth(), 1),
    ),
    [selected, setSelected] = useState(today),
    [view, setView] = useState("month");
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from(
    { length: 42 },
    (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
  const ordered = [...sessions].sort((a, b) =>
    a.scheduled_at.localeCompare(b.scheduled_at),
  );
  const selectedSessions = ordered.filter(
    (s) => dayKey(new Date(s.scheduled_at)) === dayKey(selected),
  );
  const move = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelected(next);
  };
  const projectName = (s: Session) =>
    projects.find((p) => p.id === s.project_id)?.title || "Project";
  return (
    <section className="workspace-calendar">
      <div className="calendar-toolbar">
        <div>
          <button
            className="icon-button"
            aria-label="Previous month"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <button
            className="icon-button"
            aria-label="Next month"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="button secondary"
            onClick={() => {
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(today);
            }}
          >
            Today
          </button>
        </div>
        <div className="calendar-view-options" aria-label="Calendar view">
          {["month", "agenda"].map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === "month" ? "Month" : "Agenda"}
            </button>
          ))}
        </div>
      </div>
      {view === "month" && (
        <div className="calendar-month-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <span className="calendar-weekday" key={d}>
              {d}
            </span>
          ))}
          {days.map((date) => {
            const items = ordered.filter(
              (s) => dayKey(new Date(s.scheduled_at)) === dayKey(date),
            );
            return (
              <div
                key={dayKey(date)}
                className={`calendar-day ${date.getMonth() !== month.getMonth() ? "outside-month" : ""} ${dayKey(date) === dayKey(selected) ? "selected-day" : ""}`}
              >
                <button
                  className={`calendar-date ${dayKey(date) === dayKey(today) ? "is-today" : ""}`}
                  aria-pressed={dayKey(date) === dayKey(selected)}
                  aria-label={`${date.toLocaleDateString(undefined, { dateStyle: "full" })}. ${items.length} sessions`}
                  onClick={() => {
                    setSelected(date);
                    if (date.getMonth() !== month.getMonth())
                      setMonth(
                        new Date(date.getFullYear(), date.getMonth(), 1),
                      );
                  }}
                >
                  {date.getDate()}
                  <span
                    className="calendar-mobile-dot"
                    hidden={!items.length}
                  />
                </button>
                <div className="calendar-cell-events">
                  {items.slice(0, 2).map((s) => (
                    <button
                      key={s.id}
                      title={`${s.title} · ${projectName(s)}`}
                      className={`calendar-event ${s.status === "ended" ? "completed" : ""}`}
                      onClick={() => navigate("session/" + s.id)}
                    >
                      <span>
                        {new Date(s.scheduled_at).toLocaleTimeString(
                          undefined,
                          { hour: "numeric", minute: "2-digit" },
                        )}
                      </span>
                      <strong>{s.title}</strong>
                    </button>
                  ))}
                  {items.length > 2 && (
                    <button
                      className="calendar-more"
                      onClick={() => setSelected(date)}
                    >
                      +{items.length - 2} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="calendar-agenda">
        <h3>
          {view === "month"
            ? selected.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "Scheduled sessions"}
        </h3>
        {(view === "month" ? selectedSessions : ordered).map((s) => (
          <button
            className="calendar-agenda-row"
            key={s.id}
            onClick={() => navigate("session/" + s.id)}
          >
            <span className="calendar-agenda-icon">
              <Video size={19} />
            </span>
            <div>
              <strong>{s.title}</strong>
              <small>
                {projectName(s)} ·{" "}
                {new Date(s.scheduled_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </small>
            </div>
            <span className={`badge ${s.status}`}>
              {s.status === "ended"
                ? "Completed"
                : s.status === "active"
                  ? "In progress"
                  : "Scheduled"}
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
        {!(view === "month" ? selectedSessions : ordered).length && (
          <div className="calendar-empty">
            <CalendarDays size={23} />
            <p>
              {view === "month"
                ? "No sessions on this day."
                : "No sessions match your filters."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
