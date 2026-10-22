import MeetingRecord from "./meeting-record";
import MeetingInvitations from "./meeting-invitations";
import AiAssistant from "./ai-assistant";
import { apiFetch } from "../../auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Users,
  LayoutDashboard,
  FileText,
  MessageCircle,
  ListTodo,
  Send,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import CanvasEditor from "./canvas-editor";
import DesignNode from "./design-node";
import RoomCall from "./room-call";
import { workspaceHeaders } from "../../lib/discussion-client";
import { canvasInput } from "@mayraviq/contracts/canvas-schema";
import type { CanvasNode, CanvasEdge } from "@mayraviq/contracts/types";
import "./live-room.css";
type RoomMutation = {
  ok?: boolean;
  code?: string;
  inviteId?: string;
  expiresAt?: string;
};
type Board = { nodes: CanvasNode[]; edges: CanvasEdge[] };
type RoomData = {
  session: {
    id: string;
    title: string;
    notes: string;
    summary: string;
    status: string;
    version: number;
  };
  canvas: { nodes: string; edges: string; version: number };
  role: string;
  canInvite: boolean;
  mediaReady: boolean;
  readOnly: boolean;
  user: { id: string; name: string };
  messages: {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
  }[];
  actions: { id: string; title: string; owner: string; status: string }[];
};
export default function LiveRoom({
  sessionId,
  back,
  setDirty,
}: {
  sessionId: string;
  back: () => void;
  setDirty: (v: boolean) => void;
}) {
  const [data, setData] = useState<RoomData | null>(null),
    [error, setError] = useState(""),
    [pollError, setPollError] = useState(""),
    [tab, setTab] = useState("canvas"),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState(false),
    [pendingAudio, setPendingAudio] = useState(false),
    [canvasDirty, setCanvasDirty] = useState(false),
    [notes, setNotes] = useState(""),
    [draft, setDraft] = useState(""),
    [showInvite, setShowInvite] = useState(false),
    [remote, setRemote] = useState<Board | null>(null),
    [viewLive, setViewLive] = useState(false);
  const notesDirty = useRef(false),
    notesVersion = useRef(0),
    pendingPreview = useRef<Uint8Array | null>(null),
    nonce = useRef(crypto.randomUUID());
  const request = useCallback(
    async <T = RoomData,>(payload?: Record<string, unknown>): Promise<T> => {
      const r = await apiFetch(
        "/api/rooms" +
          (payload ? "" : "?sessionId=" + encodeURIComponent(sessionId)),
        {
          method: payload ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            ...workspaceHeaders(),
          },
          ...(payload
            ? { body: JSON.stringify({ ...payload, sessionId }) }
            : {}),
        },
      );
      const value = (await r.json()) as T & { error?: string };
      if (!r.ok) {
        const failure = new Error(
          value.error || "Room unavailable.",
        ) as Error & { status: number };
        failure.status = r.status;
        throw failure;
      }
      return value;
    },
    [sessionId],
  );
  const load = useCallback(async () => {
    const value: RoomData = await request();
    setPollError("");
    setData(value);
    if (!notesDirty.current) {
      setNotes(value.session.notes);
      notesVersion.current = value.session.version;
    }
    return value;
  }, [request]);
  useEffect(() => {
    let stopped = false;
    request()
      .then((value: RoomData) => {
        if (!stopped) {
          setData(value);
          setNotes(value.session.notes);
          notesVersion.current = value.session.version;
        }
      })
      .catch((e) => {
        if (!stopped)
          setPollError(
            e instanceof SyntaxError
              ? "Room connection interrupted. Retrying…"
              : e.message,
          );
      });
    const timer = setInterval(() => {
      if (!document.hidden)
        void load().catch((e) => {
          if (!stopped) {
            setPollError(
              e instanceof SyntaxError
                ? "Room connection interrupted. Retrying…"
                : e.message,
            );
            if (e.status === 403) setData(null);
          }
        });
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [request, load]);
  useEffect(() => {
    setDirty(
      active || pendingAudio || canvasDirty || notes !== data?.session.notes,
    );
    return () => setDirty(false);
  }, [active, pendingAudio, canvasDirty, notes, data?.session.notes, setDirty]);
  const run = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const result = await request<RoomMutation>(payload);
      if (payload.action === "notes") notesDirty.current = false;
      await load();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const joinInvite = async () => {
    const code = new URLSearchParams(location.hash.split("?")[1]).get("invite");
    if (!code) {
      setError("Ask the room host for an invitation link.");
      return;
    }
    if (await run({ action: "redeem", code })) {
      location.hash = "room/" + sessionId;
      await load();
    }
  };
  const onCanvasDirty = useCallback((v: boolean) => setCanvasDirty(v), []);
  const preview = useCallback((board: Board) => {
    pendingPreview.current = new TextEncoder().encode(JSON.stringify(board));
  }, []);
  const getPreview = useCallback(() => {
    const value = pendingPreview.current;
    pendingPreview.current = null;
    return value;
  }, []);
  const receive = useCallback(
    (bytes: Uint8Array) => {
      try {
        const board = JSON.parse(new TextDecoder().decode(bytes));
        const parsed = canvasInput.safeParse({
          ...board,
          action: "canvas",
          projectId: sessionId,
          version: 0,
        });
        if (parsed.success)
          setRemote({
            nodes: parsed.data.nodes,
            edges: parsed.data.edges || [],
          });
      } catch {
        /* Non-JSON peer previews are ignored. */
      }
    },
    [sessionId],
  );
  if (!data)
    return (
      <div className="room-entry">
        <span className="brand-mark">M</span>
        <h1>Join the conversation.</h1>
        <p>{error || pollError || "Opening your room…"}</p>
        {(error || pollError) && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void joinInvite()}
          >
            Accept room invitation
          </button>
        )}
        <button className="button secondary" onClick={back}>
          Back to workspace
        </button>
        <small>
          Invitations give access to this room only. Sign-in is required.
        </small>
      </div>
    );
  return (
    <div className="live-room">
      <header className="live-room-header">
        <button
          className="icon-button"
          aria-label="Back to rooms"
          onClick={back}
        >
          <ArrowLeft size={19} />
        </button>
        <div>
          <span className="eyebrow">MAYRAVIQ ROOM</span>
          <h1>{data.session.title}</h1>
        </div>
        <span className="room-access-label">
          <ShieldCheck size={14} />
          {data.role === "guest" ? "Room guest" : "Workspace members"}
        </span>
        <button
          className="button secondary"
          onClick={() => setShowInvite((v) => !v)}
        >
          <Users size={16} />
          Invite people
        </button>
      </header>
      {(error || pollError) && (
        <p role="alert" className="discussion-error">
          {error || pollError}
        </p>
      )}
      {showInvite && (
        <MeetingInvitations
          sessionId={sessionId}
          readOnly={data.readOnly}
          canInvite={data.canInvite}
        />
      )}
      <div className="live-room-layout">
        <aside className="live-room-call-column">
          <RoomCall
            sessionId={sessionId}
            ready={data.mediaReady}
            readOnly={data.readOnly}
            onActive={setActive}
            onPending={setPendingAudio}
            onData={receive}
            onOpenNotes={() => setTab("notes")}
            getPreview={getPreview}
          />
          <div className="room-capture-info">
            <FileText size={18} />
            <div>
              <strong>Keep the conversation productive</strong>
              <p>
                Capture notes and propose actions beside the call. Use the AI
                assistant to review saved discussion and explore design ideas.
                Enable automatic meeting notes in the call panel to capture your
                speech. Each speaker opts in separately.
              </p>
            </div>
          </div>
        </aside>
        <section className="live-room-work">
          <div
            className="live-room-tabs"
            role="tablist"
            aria-label="Room workspace"
          >
            {[
              { id: "canvas", name: "Design canvas", icon: LayoutDashboard },
              { id: "notes", name: "Notes", icon: FileText },
              { id: "discussion", name: "Discussion", icon: MessageCircle },
              { id: "actions", name: "Actions", icon: ListTodo },
              { id: "ai", name: "AI assistant", icon: Sparkles },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={16} />
                {t.name}
                {t.id === "actions" && data.actions.length > 0 ? (
                  <span>{data.actions.length}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="room-work-panel" role="tabpanel">
            <div hidden={tab !== "ai"}>
              <AiAssistant
                sessionId={sessionId}
                readOnly={data.readOnly}
                onNotes={(summary) => {
                  const addition =
                    "\n\nAI draft recap (review before saving):\n" + summary;
                  if (notes.length + addition.length > 30000) {
                    setError(
                      "Make room in the notes before adding this AI recap.",
                    );
                    return false;
                  }
                  if (!notesDirty.current)
                    notesVersion.current = data.session.version;
                  notesDirty.current = true;
                  setNotes((previous) => (previous + addition).trim());
                  setTab("notes");
                  return true;
                }}
                onAction={async (title) =>
                  !!(await run({
                    action: "propose",
                    title,
                    owner: data.user.name,
                  }))
                }
              />
            </div>{" "}
            <div hidden={tab !== "canvas"}>
              {remote && (
                <div className="room-live-preview-controls">
                  <span>A participant is designing live</span>
                  <button onClick={() => setViewLive((v) => !v)}>
                    {viewLive ? "Edit saved canvas" : "View live design"}
                  </button>
                </div>
              )}
              {viewLive && remote ? (
                <div className="room-live-preview">
                  <svg
                    viewBox="0 0 1600 1000"
                    role="img"
                    aria-label="Live participant design preview"
                  >
                    <rect width="1600" height="1000" fill="#fafbfc" />
                    {remote.nodes
                      .filter((n) => !n.hidden)
                      .map((n) => (
                        <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                          <DesignNode
                            node={n}
                            selected={false}
                            connecting={false}
                            onResize={() => {}}
                          />
                        </g>
                      ))}
                  </svg>
                  <p>
                    Live preview · Save commits changes. Return to the saved
                    canvas to edit.
                  </p>
                </div>
              ) : null}
              <div hidden={viewLive && !!remote}>
                <CanvasEditor
                  context="room"
                  project={{
                    id: sessionId,
                    title: "Shared room canvas",
                    description: "",
                    color: "blue",
                    status: data.readOnly ? "archived" : "active",
                    created_at: "",
                  }}
                  canvas={data.canvas}
                  busy={busy}
                  setDirty={onCanvasDirty}
                  onPreview={preview}
                  mutate={async (payload) => !!(await run(payload))}
                />
              </div>
              <p className="room-canvas-caption">
                Live previews travel with the call. Live save combines
                independent changes; conflicting edits pause for review.
              </p>
            </div>
            <div hidden={tab !== "notes"} className="room-notes">
              <MeetingRecord
                sessionId={sessionId}
                active={tab === "notes"}
                readOnly={data.readOnly}
                onAction={async (title) =>
                  !!(await run({
                    action: "propose",
                    title,
                    owner: data.user.name,
                  }))
                }
              />

              <div>
                <h2>Your written notes</h2>
                <span>
                  {notes !== data.session.notes ? "Unsaved changes" : "Saved"}
                </span>
                <button
                  className="button primary"
                  disabled={
                    busy || data.readOnly || notes === data.session.notes
                  }
                  onClick={async () => {
                    if (
                      !(await run({
                        action: "notes",
                        notes,
                        version: notesVersion.current,
                      }))
                    )
                      notesDirty.current = true;
                  }}
                >
                  <Save size={15} />
                  Save notes
                </button>
              </div>
              <textarea
                aria-label="Room notes"
                maxLength={30000}
                disabled={data.readOnly}
                value={notes}
                onChange={(e) => {
                  if (!notesDirty.current)
                    notesVersion.current = data.session.version;
                  notesDirty.current = true;
                  setNotes(e.target.value);
                }}
                placeholder="Capture key ideas, questions, context and next steps…"
              />
              <small>
                Your written notes are preserved when the automatic recap
                updates.
              </small>
            </div>
            <div hidden={tab !== "discussion"} className="room-discussion">
              <div className="room-messages">
                {!data.messages.length && (
                  <div className="room-work-empty">
                    <MessageCircle />
                    <h2>Keep the discussion together.</h2>
                    <p>Share links, questions and context while you talk.</p>
                  </div>
                )}
                {data.messages.map((m) => (
                  <article key={m.id}>
                    <strong>{m.author_name}</strong>
                    <time>
                      {new Date(m.created_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                    <p>{m.body}</p>
                  </article>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await run({
                      action: "message",
                      body: draft,
                      nonce: nonce.current,
                    })
                  ) {
                    setDraft("");
                    nonce.current = crypto.randomUUID();
                  }
                }}
              >
                <textarea
                  aria-label="Room message"
                  value={draft}
                  maxLength={6000}
                  disabled={data.readOnly}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Add to the conversation…"
                />
                <button
                  className="button primary"
                  disabled={busy || data.readOnly || !draft.trim()}
                >
                  <Send size={16} />
                  Send
                </button>
              </form>
            </div>
            <div hidden={tab !== "actions"} className="room-actions">
              <h2>Turn the conversation into next steps.</h2>
              <p>Proposals stay drafts until reviewed by the workspace team.</p>
              {data.actions.map((a) => (
                <article key={a.id}>
                  <ListTodo size={18} />
                  <div>
                    <strong>{a.title}</strong>
                    <small>{a.owner}</small>
                  </div>
                  <span>
                    {a.status === "draft" ? "Needs review" : a.status}
                  </span>
                </article>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    f = new FormData(form);
                  if (
                    await run({
                      action: "propose",
                      title: f.get("title"),
                      owner: f.get("owner"),
                    })
                  )
                    form.reset();
                }}
              >
                <label>
                  Next step
                  <input
                    required
                    name="title"
                    maxLength={1000}
                    disabled={data.readOnly}
                    placeholder="What should happen next?"
                  />
                </label>
                <label>
                  Owner
                  <input
                    required
                    name="owner"
                    defaultValue={data.user.name}
                    maxLength={120}
                    disabled={data.readOnly}
                  />
                </label>
                <button
                  className="button primary"
                  disabled={busy || data.readOnly}
                >
                  <ListTodo size={16} />
                  Propose action
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
