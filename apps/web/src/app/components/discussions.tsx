import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hash,
  Lock,
  Users,
  MessageCircle,
  Plus,
  Send,
  ArrowLeft,
  Info,
  X,
  UserPlus,
  Check,
  Copy,
  RefreshCw,
  Trash2,
  RotateCcw,
  Video,
} from "lucide-react";
import type {
  Conversation,
  DiscussionData,
  WorkspaceData,
} from "@mayraviq/contracts/types";
import { discussionRequest } from "../../lib/discussion-client";
const KindIcon = ({ kind }: { kind: string }) =>
  kind === "public" ? (
    <Hash size={18} />
  ) : kind === "private" ? (
    <Lock size={17} />
  ) : kind === "room" ? (
    <Video size={18} />
  ) : kind === "direct" ? (
    <MessageCircle size={18} />
  ) : (
    <Users size={18} />
  );
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export default function Discussions({
  id,
  workspace,
  navigate,
  reloadWorkspace,
}: {
  id?: string;
  workspace: WorkspaceData;
  navigate: (route: string) => boolean;
  reloadWorkspace: () => Promise<unknown>;
}) {
  const [data, setData] = useState<DiscussionData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showInfo, setShowInfo] = useState(false),
    [modal, setModal] = useState<
      "create" | "invite" | "join" | "members" | null
    >(null),
    [kind, setKind] = useState<Conversation["kind"]>("public"),
    [members, setMembers] = useState<string[]>([]),
    [filter, setFilter] = useState(""),
    [draft, setDraft] = useState(""),
    [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(
      null,
    ),
    [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    end = useRef<HTMLDivElement>(null),
    drafts = useRef<Record<string, string>>({}),
    nonce = useRef(crypto.randomUUID()),
    lastCount = useRef(0);
  const load = useCallback(async () => {
    try {
      setData(await discussionRequest());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let active = true;
    discussionRequest()
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [load]);
  useEffect(() => {
    setDraft(
      sessionStorage.getItem(
        "mayraviq-draft-" +
          data?.userId +
          "-" +
          workspace.workspace?.id +
          "-" +
          (id || ""),
      ) ||
        drafts.current[id || ""] ||
        "",
    );
    nonce.current = crypto.randomUUID();
    lastCount.current = 0;
    setShowInfo(false);
  }, [id, data?.userId, workspace.workspace?.id]);
  useEffect(() => {
    if (modal) {
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [modal]);
  const conversation = data?.conversations.find((c) => c.id === id),
    messages = data?.messages.filter((m) => m.conversation_id === id) || [];
  useEffect(() => {
    if (messages.length !== lastCount.current) {
      end.current?.scrollIntoView({ block: "nearest" });
      lastCount.current = messages.length;
    }
  }, [messages.length, id]);
  const run = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const result = await discussionRequest(payload);
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const peers = data?.members.filter((m) => m.user_id !== data.userId) || [];
  const openCreate = (next: Conversation["kind"]) => {
    setKind(next);
    setMembers([]);
    setModal("create");
  };
  const nameOf = (c: Conversation) =>
    c.kind === "direct"
      ? data?.members.find(
          (m) => c.member_ids.includes(m.user_id) && m.user_id !== data.userId,
        )?.name || c.name
      : c.name;
  const isArchived =
    conversation?.session_id &&
    workspace.projects.find(
      (p) =>
        p.id ===
        workspace.sessions.find((s) => s.id === conversation.session_id)
          ?.project_id,
    )?.status === "archived";
  if (!data && !error)
    return (
      <div className="discussion-loading" role="status">
        <MessageCircle size={30} />
        <p>Loading your discussions…</p>
      </div>
    );
  return (
    <div className={`discussion-layout ${id ? "has-thread" : ""}`}>
      <aside className="conversation-sidebar">
        <div className="conversation-title">
          <h1>Discussions</h1>
          <button
            className="icon-button"
            aria-label="New discussion"
            onClick={() => openCreate("public")}
          >
            <Plus size={19} />
          </button>
        </div>
        <label className="conversation-filter">
          <MessageCircle size={16} />
          <input
            aria-label="Find a discussion"
            placeholder="Find a conversation"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <div className="discussion-workspace-switch">
          <label>
            Workspace
            <select
              aria-label="Select workspace"
              value={workspace.workspace?.id || ""}
              onChange={async (e) => {
                localStorage.setItem("mayraviq-workspace", e.target.value);
                await reloadWorkspace();
                await load();
                navigate("discussions");
              }}
            >
              {data?.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(
          [
            ["Channels", ["public", "private"]],
            ["Group discussions", ["group"]],
            ["Peer discussions", ["direct"]],
            ["Room threads", ["room"]],
          ] as [string, string[]][]
        ).map(([label, kinds]) => (
          <section className="conversation-section" key={label}>
            <div className="conversation-section-heading">
              <span>{label}</span>
              {label !== "Room threads" && (
                <button
                  aria-label={"New " + label.toLowerCase()}
                  onClick={() => openCreate(kinds[0] as Conversation["kind"])}
                >
                  <Plus size={15} />
                </button>
              )}
            </div>
            {data?.conversations
              .filter(
                (c) =>
                  kinds.includes(c.kind) &&
                  nameOf(c).toLowerCase().includes(filter.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  className={`conversation-item ${id === c.id ? "current" : ""}`}
                  onClick={() => navigate("discussions/" + c.id)}
                >
                  <KindIcon kind={c.kind} />
                  <span>
                    <strong>{nameOf(c)}</strong>
                    {c.last_message && <small>{c.last_message}</small>}
                  </span>
                </button>
              ))}
            {!data?.conversations.some((c) => kinds.includes(c.kind)) && (
              <p className="conversation-none">
                {label === "Peer discussions"
                  ? "Start a one-to-one conversation."
                  : label === "Room threads"
                    ? "Open a discussion from a room."
                    : "Create your first " +
                      (label === "Channels" ? "channel." : "group.")}
              </p>
            )}
          </section>
        ))}
        <div className="discussion-members">
          <span>
            {data?.members.length || 1} workspace member
            {data?.members.length === 1 ? "" : "s"}
          </span>
          <div>
            <button onClick={() => setModal("join")}>Join workspace</button>
            {data?.role === "owner" && (
              <button onClick={() => setModal("invite")}>
                <UserPlus size={14} /> Invite
              </button>
            )}
          </div>
        </div>
      </aside>
      <section className="conversation-thread">
        {conversation ? (
          <>
            <header className="thread-header">
              <button
                className="icon-button discussion-back"
                aria-label="Back to discussions"
                onClick={() => navigate("discussions")}
              >
                <ArrowLeft size={18} />
              </button>
              <span className="thread-kind-icon">
                <KindIcon kind={conversation.kind} />
              </span>
              <div className="grow">
                <h2>{nameOf(conversation)}</h2>
                <p>
                  {conversation.kind === "public"
                    ? "Public · Everyone in this workspace"
                    : conversation.kind === "room"
                      ? "Room discussion · Workspace members"
                      : conversation.kind === "direct"
                        ? "Peer discussion · Only you and your peer"
                        : "Private · Invited members only"}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Discussion details"
                aria-pressed={showInfo}
                onClick={() => setShowInfo(!showInfo)}
              >
                <Info size={19} />
              </button>
            </header>
            <div
              className="message-timeline"
              role="log"
              aria-label="Discussion messages"
              aria-live="polite"
            >
              <div className="thread-welcome">
                <span>
                  <KindIcon kind={conversation.kind} />
                </span>
                <h2>
                  {conversation.kind === "public" ? "# " : ""}
                  {nameOf(conversation)}
                </h2>
                <p>
                  {conversation.description ||
                    "A space to share ideas, ask questions and move the work forward."}
                </p>
                <small>
                  {messages.length
                    ? "Showing the latest 200 messages"
                    : "This is the beginning of your conversation."}
                </small>
              </div>
              {messages.map((m, i) => (
                <div key={m.id}>
                  {(i === 0 ||
                    new Date(messages[i - 1].created_at).toDateString() !==
                      new Date(m.created_at).toDateString()) && (
                    <div className="message-date">
                      <span>
                        {new Date(m.created_at).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  <article
                    className={`discussion-message ${m.author_id === data?.userId ? "own-message" : ""}`}
                  >
                    <span className="message-avatar">
                      {initials(m.author_name)}
                    </span>
                    <div className="grow">
                      <div className="message-meta">
                        <strong>{m.author_name}</strong>
                        {m.author_id === data?.userId && (
                          <span className="you-label">you</span>
                        )}
                        <time dateTime={m.created_at}>
                          {new Date(m.created_at).toLocaleTimeString(
                            undefined,
                            { hour: "numeric", minute: "2-digit" },
                          )}
                        </time>
                      </div>
                      <p className={m.deleted_at ? "deleted-message" : ""}>
                        {m.deleted_at ? "Message removed" : m.body}
                      </p>
                    </div>
                    {m.author_id === data?.userId && (
                      <button
                        className="message-action"
                        disabled={busy}
                        aria-label={
                          m.deleted_at ? "Restore message" : "Remove message"
                        }
                        onClick={() =>
                          void run({
                            action: m.deleted_at
                              ? "restoreMessage"
                              : "deleteMessage",
                            id: m.id,
                          })
                        }
                      >
                        {m.deleted_at ? (
                          <RotateCcw size={15} />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    )}
                  </article>
                </div>
              ))}
              <div ref={end} />
            </div>
            {error && (
              <p className="discussion-error" role="alert">
                {error}
              </p>
            )}
            <form
              className="message-composer"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draft.trim() || busy) return;
                const result = await run({
                  action: "message",
                  conversationId: id,
                  body: draft,
                  nonce: nonce.current,
                });
                if (result) {
                  drafts.current[id!] = "";
                  sessionStorage.removeItem(
                    "mayraviq-draft-" +
                      data?.userId +
                      "-" +
                      workspace.workspace?.id +
                      "-" +
                      id,
                  );
                  setDraft("");
                  nonce.current = crypto.randomUUID();
                  end.current?.scrollIntoView({ block: "nearest" });
                }
              }}
            >
              <textarea
                aria-label="Message"
                placeholder={
                  "Message " +
                  (conversation.kind === "public" ? "# " : "") +
                  nameOf(conversation)
                }
                rows={2}
                maxLength={6000}
                value={draft}
                disabled={!!isArchived}
                onChange={(e) => {
                  setDraft(e.target.value);
                  drafts.current[id!] = e.target.value;
                  sessionStorage.setItem(
                    "mayraviq-draft-" +
                      data?.userId +
                      "-" +
                      workspace.workspace?.id +
                      "-" +
                      id,
                    e.target.value,
                  );
                  nonce.current = crypto.randomUUID();
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="composer-footer">
                <span>
                  {isArchived
                    ? "Archived project · Discussion is read-only"
                    : "Enter to send · Shift + Enter for a new line"}
                </span>
                <button
                  type="submit"
                  disabled={busy || !draft.trim() || !!isArchived}
                  aria-label="Send message"
                >
                  <Send size={17} />
                  <span>{busy ? "Sending…" : "Send"}</span>
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="discussion-landing">
            <span className="discussion-landing-icon">
              <MessageCircle size={38} />
            </span>
            <span className="eyebrow">MAKE SPACE FOR THE CONVERSATION</span>
            <h2>
              Good work starts
              <br />
              with a discussion.
            </h2>
            <p>
              Bring your team’s ideas into one place. Create an open channel,
              gather a smaller group, or talk to a peer.
            </p>
            <div className="discussion-start-options">
              <button onClick={() => openCreate("public")}>
                <Hash />
                <strong>Public channel</strong>
                <span>Open to your workspace</span>
                <Plus size={17} />
              </button>
              <button onClick={() => openCreate("private")}>
                <Lock />
                <strong>Private channel</strong>
                <span>For invited members</span>
                <Plus size={17} />
              </button>
              <button onClick={() => openCreate("group")}>
                <Users />
                <strong>Group discussion</strong>
                <span>A focused conversation</span>
                <Plus size={17} />
              </button>
              <button onClick={() => openCreate("direct")}>
                <MessageCircle />
                <strong>Peer discussion</strong>
                <span>Talk one-to-one</span>
                <Plus size={17} />
              </button>
            </div>
            {error && (
              <p role="alert" className="discussion-error">
                {error}
                <button onClick={() => void load()}>
                  <RefreshCw size={14} /> Retry
                </button>
              </p>
            )}
          </div>
        )}
      </section>
      {showInfo && conversation && (
        <aside className="thread-details">
          <div className="conversation-title">
            <h3>About this discussion</h3>
            <button
              className="icon-button"
              aria-label="Close details"
              onClick={() => setShowInfo(false)}
            >
              <X size={17} />
            </button>
          </div>
          <span className="details-kind">
            <KindIcon kind={conversation.kind} />
            {conversation.kind}
          </span>
          <h2>{nameOf(conversation)}</h2>
          <p>{conversation.description || "No description yet."}</p>
          {conversation.session_id && (
            <button
              className="button secondary"
              onClick={() => navigate("session/" + conversation.session_id)}
            >
              <Video size={17} /> Open session notes
            </button>
          )}
          <h3>Members</h3>
          {data?.members
            .filter(
              (m) =>
                conversation.kind === "public" ||
                conversation.kind === "room" ||
                conversation.member_ids.includes(m.user_id),
            )
            .map((m) => (
              <div className="discussion-member" key={m.user_id}>
                <span className="message-avatar">{initials(m.name)}</span>
                <div>
                  <strong>{m.name}</strong>
                  <small>{m.role}</small>
                </div>
              </div>
            ))}
          {conversation.created_by === data?.userId &&
            ["group", "private", "public"].includes(conversation.kind) && (
              <button
                className="button secondary"
                onClick={() => {
                  setMembers([]);
                  setModal("members");
                }}
              >
                <UserPlus size={16} /> Add members
              </button>
            )}
          <p className="footnote">
            {conversation.kind === "public" || conversation.kind === "room"
              ? "Visible to every member of this workspace."
              : "Messages are only visible to the listed members."}
          </p>
        </aside>
      )}
      <dialog
        ref={dialog}
        className="discussion-dialog"
        onCancel={() => setModal(null)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (modal === "join") {
              const result = await run({
                action: "join",
                code: String(f.get("code")).trim(),
              });
              if (result) {
                localStorage.setItem("mayraviq-workspace", result.workspaceId);
                await reloadWorkspace();
                await load();
                setModal(null);
                navigate("discussions");
              }
            } else if (modal === "members") {
              if (
                await run({ action: "addMembers", conversationId: id, members })
              )
                setModal(null);
            } else if (modal === "create") {
              const result = await run({
                action: "create",
                kind,
                name:
                  kind === "direct"
                    ? peers.find((p) => p.user_id === members[0])?.name
                    : String(f.get("name")),
                description: String(f.get("description") || ""),
                members,
              });
              if (result) {
                setModal(null);
                navigate("discussions/" + result.id);
              }
            }
          }}
        >
          <div className="conversation-title">
            <span className="eyebrow">DISCUSSIONS</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Close discussion dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
          </div>
          <h2>
            {modal === "invite"
              ? "Bring your team together"
              : modal === "join"
                ? "Join a workspace"
                : modal === "members"
                  ? "Add discussion members"
                  : "Start a conversation"}
          </h2>
          {modal === "create" && (
            <>
              <div className="discussion-kind-picker">
                {(["public", "private", "group", "direct"] as const).map(
                  (k) => (
                    <button
                      type="button"
                      key={k}
                      className={kind === k ? "chosen" : ""}
                      onClick={() => {
                        setKind(k);
                        setMembers([]);
                      }}
                    >
                      <KindIcon kind={k} />
                      {k === "direct" ? "Peer" : k}
                    </button>
                  ),
                )}
              </div>
              {kind !== "direct" && (
                <>
                  <label>
                    {kind === "group" ? "Group name" : "Channel name"}
                    <input
                      name="name"
                      required
                      maxLength={80}
                      placeholder={
                        kind === "group"
                          ? "e.g. Design feedback"
                          : "e.g. product-design"
                      }
                    />
                  </label>
                  <label>
                    Description <span className="muted">(optional)</span>
                    <textarea
                      name="description"
                      rows={2}
                      maxLength={500}
                      placeholder="What is this conversation for?"
                    />
                  </label>
                </>
              )}
              <p className="access-explainer">
                {kind === "public"
                  ? "Everyone in this workspace can read and post here."
                  : kind === "direct"
                    ? "Choose one workspace member for a private conversation."
                    : "Only the people you select can access this conversation. You can add more members later."}
              </p>
            </>
          )}
          {(modal === "members" ||
            (modal === "create" && kind !== "public")) && (
            <div className="member-picker">
              <h3>{kind === "direct" ? "Choose a peer" : "Invite members"}</h3>
              {peers
                .filter(
                  (p) =>
                    modal !== "members" ||
                    !conversation?.member_ids.includes(p.user_id),
                )
                .map((p) => (
                  <label key={p.user_id}>
                    <input
                      type={
                        kind === "direct" && modal === "create"
                          ? "radio"
                          : "checkbox"
                      }
                      name="member"
                      checked={members.includes(p.user_id)}
                      onChange={() =>
                        setMembers(
                          kind === "direct" && modal === "create"
                            ? [p.user_id]
                            : members.includes(p.user_id)
                              ? members.filter((m) => m !== p.user_id)
                              : [...members, p.user_id],
                        )
                      }
                    />
                    <span className="message-avatar">{initials(p.name)}</span>
                    <span>{p.name}</span>
                  </label>
                ))}
              {!peers.length && (
                <p>
                  You’re the first member. Invite teammates to start a peer
                  discussion.
                </p>
              )}
            </div>
          )}
          {modal === "join" && (
            <>
              <p>Ask your workspace owner for an invitation code.</p>
              <label>
                Invitation code
                <input
                  name="code"
                  required
                  placeholder="Paste your invitation code"
                />
              </label>
            </>
          )}
          {modal === "invite" && (
            <>
              <p>
                Share a code with teammates so they can join this workspace.
                They will get access to public channels, projects and room
                threads.
              </p>
              {!invite ? (
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    const r = await run({ action: "invite" });
                    if (r) setInvite(r);
                  }}
                >
                  <UserPlus size={17} /> Create invitation code
                </button>
              ) : (
                <div className="invite-code">
                  <code>{invite.code}</code>
                  <small>
                    Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </small>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(invite.code);
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                    {copied ? "Copied" : "Copy code"}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await run({ action: "revokeInvite", code: invite.code })
                      ) {
                        setInvite(null);
                        setCopied(false);
                      }
                    }}
                  >
                    Revoke invitation
                  </button>
                </div>
              )}
            </>
          )}
          {error && (
            <p className="discussion-error" role="alert">
              {error}
            </p>
          )}
          {modal !== "invite" && (
            <div className="dialog-footer">
              <button
                className="button secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={
                  busy ||
                  (modal === "create" &&
                    kind === "direct" &&
                    members.length !== 1) ||
                  (modal === "members" && !members.length)
                }
              >
                {busy
                  ? "Saving…"
                  : modal === "join"
                    ? "Join workspace"
                    : modal === "members"
                      ? "Add members"
                      : "Create " +
                        (kind === "direct"
                          ? "discussion"
                          : kind === "group"
                            ? "group"
                            : "channel")}
              </button>
            </div>
          )}
        </form>
      </dialog>
    </div>
  );
}
