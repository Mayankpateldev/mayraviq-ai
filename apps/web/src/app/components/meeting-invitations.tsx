import { useCallback, useEffect, useState } from "react";
import { Mail, Link2, Send, Inbox, X } from "lucide-react";
import { apiFetch } from "../../auth";
import { workspaceHeaders } from "../../lib/discussion-client";
async function request(path: string, body?: unknown) {
  const r = await apiFetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...workspaceHeaders() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Invitations unavailable.");
  return data;
}
type Invite = {
  id: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  state: string;
  delivery: string;
  expires_at: string;
  revoked_at: string | null;
  can_preview: boolean;
};
type Directory = {
  members: { user_id: string; name: string; email: string | null }[];
  invitations: Invite[];
  mailMode: string;
  readOnly: boolean;
};
const state = (i: {
  revoked_at: string | null;
  expires_at: string;
  state: string;
}) =>
  i.revoked_at
    ? "Revoked"
    : Date.parse(i.expires_at) <= Date.now()
      ? "Expired"
      : i.state === "accepted"
        ? "Accepted"
        : i.state === "declined"
          ? "Declined"
          : "Awaiting response";
const delivery = (v: string) =>
  ({
    in_app: "In-app invitation",
    preview: "Email prepared · local preview",
    accepted_by_smtp: "Email submitted to server",
    failed: "Email delivery failed",
    sending: "Email submission in progress",
  })[v] || v;
export default function MeetingInvitations({
  sessionId,
  readOnly,
  canInvite,
}: {
  sessionId: string;
  readOnly: boolean;
  canInvite: boolean;
}) {
  const [data, setData] = useState<Directory | null>(null),
    [kind, setKind] = useState<"member" | "email">("member"),
    [member, setMember] = useState(""),
    [email, setEmail] = useState(""),
    [emailCopy, setEmailCopy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<{
      raw: string;
      subject: string;
      text: string;
      calendar: string;
    } | null>(null),
    [link, setLink] = useState<{ url: string; id: string } | null>(null);
  const load = useCallback(
    async () =>
      setData(await request("/api/invitations?sessionId=" + sessionId)),
    [sessionId],
  );
  useEffect(() => {
    if (!canInvite) return;
    void load().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden) void load().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [canInvite, load]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("/api/invitations", {
        action: "invite",
        sessionId,
        nonce: crypto.randomUUID(),
        recipient:
          kind === "member" ? { kind, userId: member } : { kind, email },
        emailCopy: kind === "email" || emailCopy,
      });
      setNotice(delivery(result.delivery));
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invitation failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!canInvite)
    return (
      <section className="room-invite-panel">
        <p>Ask a workspace member to invite another person.</p>
      </section>
    );
  return (
    <section
      className="meeting-invite-panel"
      aria-label="Invite people to meeting"
    >
      <div>
        <span className="eyebrow">BRING YOUR PEOPLE</span>
        <h2>Invite someone to this meeting</h2>
        <p>
          Choose a teammate or invite a guest by email. Guest access covers this
          room only and expires after 24 hours.
        </p>
      </div>
      {data?.mailMode === "preview" && (
        <p className="invite-notice">
          Local email preview is enabled. Emails are prepared here; they are not
          sent to anyone. Room links work on this computer.
        </p>
      )}
      {error && (
        <p role="alert" className="room-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="invite-notice">
          {notice}
        </p>
      )}
      <div className="invite-kind">
        <button
          type="button"
          aria-pressed={kind === "member"}
          onClick={() => setKind("member")}
        >
          Workspace teammate
        </button>
        <button
          type="button"
          aria-pressed={kind === "email"}
          onClick={() => setKind("email")}
        >
          Email invitation
        </button>
      </div>
      <form onSubmit={(e) => void submit(e)}>
        {kind === "member" ? (
          <label>
            Choose a teammate
            <select
              value={member}
              onChange={(e) => setMember(e.target.value)}
              required
              disabled={busy || readOnly}
            >
              <option value="">Select a person</option>
              {data?.members.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.name}
                  {p.email ? " · " + p.email : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Guest email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              placeholder="person@example.com"
              disabled={busy || readOnly}
            />
          </label>
        )}
        {kind === "member" && (
          <label className="invite-email-copy">
            <input
              type="checkbox"
              checked={emailCopy}
              onChange={(e) => setEmailCopy(e.target.checked)}
              disabled={busy || readOnly || data?.mailMode === "disabled"}
            />
            {data?.mailMode === "preview"
              ? "Also prepare an email invitation"
              : "Also email the invitation"}
          </label>
        )}
        <button
          className="button primary"
          disabled={
            busy ||
            readOnly ||
            !data ||
            (kind === "member" ? !member : !email) ||
            ((kind === "email" || emailCopy) && data.mailMode === "disabled")
          }
        >
          <Send size={15} />
          {busy
            ? "Preparing invitation…"
            : kind === "email" && data?.mailMode === "preview"
              ? "Prepare email invitation"
              : "Invite person"}
        </button>
      </form>
      {kind === "email" && data?.mailMode === "disabled" && (
        <p>Email is not configured. Teammate invitations work in the app.</p>
      )}
      {!!data?.invitations.length && (
        <div className="meeting-invited-list">
          <h3>Invited people</h3>
          {data.invitations.map((i) => (
            <article key={i.id}>
              <div>
                <strong>
                  {i.recipient_email ||
                    data.members.find((m) => m.user_id === i.recipient_user_id)
                      ?.name ||
                    "Teammate"}
                </strong>
                <span>
                  {state(i)} · {delivery(i.delivery)}
                </span>
                <small>Expires {new Date(i.expires_at).toLocaleString()}</small>
              </div>
              <div className="invite-row-actions">
                {i.can_preview && i.delivery !== "in_app" && (
                  <button
                    className="button secondary"
                    onClick={async () => {
                      try {
                        setPreview(
                          await request("/api/invitations?previewId=" + i.id),
                        );
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Preview unavailable.",
                        );
                      }
                    }}
                  >
                    <Mail size={14} /> View email
                  </button>
                )}
                {!i.revoked_at && !readOnly && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await request("/api/rooms", {
                          action: "revoke",
                          sessionId,
                          inviteId: i.id,
                        });
                        await load();
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Revoke failed.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Revoke invitation
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {preview && (
        <section
          className="invite-email-preview"
          aria-label="Invitation email preview"
        >
          <div>
            <h3>{preview.subject}</h3>
            <button
              className="icon-button"
              aria-label="Close email preview"
              onClick={() => setPreview(null)}
            >
              <X size={16} />
            </button>
          </div>
          <pre>{preview.text}</pre>
          <button
            className="button secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([preview.raw], { type: "message/rfc822" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "meeting-invitation.eml";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download email with calendar attachment
          </button>
        </section>
      )}
      <details className="invite-share-link">
        <summary>Share a room link instead</summary>
        <p>
          Anyone with this link and a permitted sign-in can request guest
          access. Use a person-specific invitation above when possible.
        </p>
        <button
          className="button secondary"
          disabled={busy || readOnly}
          onClick={async () => {
            setBusy(true);
            try {
              const i = await request("/api/rooms", {
                action: "invite",
                sessionId,
              });
              setLink({
                url:
                  location.origin + "/#room/" + sessionId + "?invite=" + i.code,
                id: i.inviteId,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Link unavailable.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Link2 size={14} /> Create share link
        </button>
        {link && (
          <>
            <input
              aria-label="Room invitation link"
              value={link.url}
              readOnly
            />
            <button
              className="button secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(link.url)
                  .then(() => setNotice("Link copied."))
                  .catch(() => setError("Select and copy the link."))
              }
            >
              Copy link
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await request("/api/rooms", {
                    action: "revoke",
                    sessionId,
                    inviteId: link.id,
                  });
                  setLink(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Revoke failed.");
                }
              }}
            >
              Revoke share link
            </button>
          </>
        )}
      </details>
    </section>
  );
}
type Incoming = {
  id: string;
  session_id: string;
  title: string;
  scheduled_at: string;
  expires_at: string;
  revoked_at: string | null;
  state: string;
  status: string;
  project_status: string;
};
export function MeetingInvitationInbox({
  navigate,
}: {
  navigate: (page: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Incoming[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const d = await request("/api/invitations");
    setItems(d.invitations);
  }, []);
  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      if (!document.hidden && !stopped) void load().catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [load]);
  const pending = items.filter(
    (i) =>
      i.state === "pending" &&
      !i.revoked_at &&
      Date.parse(i.expires_at) > Date.now() &&
      i.status !== "ended" &&
      i.project_status === "active",
  );
  return (
    <div className="meeting-inbox">
      <button
        className="icon-button"
        aria-label={`Meeting invitations${pending.length ? " · " + pending.length + " pending" : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          void load().catch((e) => setError(e.message));
        }}
      >
        <Inbox size={18} />
        {!!pending.length && <span>{pending.length}</span>}
      </button>
      {open && (
        <section
          className="meeting-inbox-panel"
          aria-label="Your meeting invitations"
        >
          <div>
            <h2>Meeting invitations</h2>
            <button
              className="icon-button"
              aria-label="Close invitations"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {!items.length && <p>No meeting invitations yet.</p>}
          {items.map((i) => {
            const available =
              !i.revoked_at &&
              Date.parse(i.expires_at) > Date.now() &&
              i.status !== "ended" &&
              i.project_status === "active";
            return (
              <article key={i.id}>
                <h3>{i.title}</h3>
                <p>
                  {new Date(i.scheduled_at).toLocaleString()} · {state(i)}
                </p>
                {available && i.state === "pending" && (
                  <div>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const d = await request("/api/invitations", {
                            action: "respond",
                            inviteId: i.id,
                            response: "accepted",
                          });
                          await load();
                          setOpen(false);
                          navigate("room/" + d.sessionId);
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Accept failed.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Accept and open room
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await request("/api/invitations", {
                            action: "respond",
                            inviteId: i.id,
                            response: "declined",
                          });
                          await load();
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Decline failed.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Decline
                    </button>
                  </div>
                )}
                {available && i.state === "accepted" && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setOpen(false);
                      navigate("room/" + i.session_id);
                    }}
                  >
                    Open room
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
