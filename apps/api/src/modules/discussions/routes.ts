import { env } from "../../platform/runtime";
import { getAuthenticatedUser } from "../../platform/auth";
import { workspaceFor } from "../../lib/workspace-access";
import { z } from "zod";
import {
  apiReply as reply,
  readMutation,
  requestFailure,
  RequestError,
} from "../../lib/api-boundary";
import { enforceRateLimit } from "../../lib/rate-limit";
const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(80);
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name,
    description: z.string().trim().max(500),
    kind: z.enum(["public", "private", "group", "direct"]),
    members: z.array(id).max(50),
  }),
  z.object({ action: z.literal("room"), sessionId: id }),
  z.object({
    action: z.literal("message"),
    conversationId: id,
    body: z.string().trim().min(1).max(6000),
    nonce: z.string().uuid(),
  }),
  z.object({ action: z.literal("deleteMessage"), id }),
  z.object({ action: z.literal("restoreMessage"), id }),
  z.object({ action: z.literal("invite") }),
  z.object({ action: z.literal("revokeInvite"), code: z.string().uuid() }),
  z.object({ action: z.literal("join"), code: z.string().uuid() }),
  z.object({
    action: z.literal("addMembers"),
    conversationId: id,
    members: z.array(id).min(1).max(50),
  }),
]);
const visibility =
  "(c.kind IN ('public','room') OR EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=?))";
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    return reply({ error: "Sign in to discuss with your workspace." }, 401);
  try {
    await enforceRateLimit(env.DB!, user.userId, "discussions:read", 180);
    const db = env.DB!,
      w = await workspaceFor(request, user);
    if (!w) return reply({ error: "Create or join a workspace first." }, 409);
    await db
      .prepare(
        "INSERT INTO workspace_members VALUES(?,?,?,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET name=excluded.name,email=excluded.email",
      )
      .bind(
        w.id,
        user.userId,
        user.displayName,
        user.email,
        new Date().toISOString(),
      )
      .run();
    const results = await db.batch([
      db
        .prepare(
          "SELECT m.user_id,m.name,m.email,CASE WHEN m.user_id=w.owner_id THEN 'owner' ELSE 'member' END AS role FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? ORDER BY m.name",
        )
        .bind(w.id),
      db
        .prepare(
          `SELECT c.*,(SELECT count(*) FROM messages WHERE conversation_id=c.id AND deleted_at IS NULL) AS message_count,(SELECT body FROM messages WHERE conversation_id=c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) AS last_message,(SELECT created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_at FROM conversations c WHERE c.workspace_id=? AND ${visibility} ORDER BY coalesce((SELECT created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1),c.created_at) DESC`,
        )
        .bind(w.id, user.userId),
      db
        .prepare(
          `SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.workspace_id=? AND ${visibility} AND m.id IN (SELECT id FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 200) ORDER BY m.created_at`,
        )
        .bind(w.id, user.userId),
      db
        .prepare(
          `SELECT cm.* FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE c.workspace_id=? AND ${visibility}`,
        )
        .bind(w.id, user.userId),
      db
        .prepare(
          "SELECT w.id,w.name FROM workspaces w WHERE w.owner_id=? OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=?) ORDER BY w.name",
        )
        .bind(user.userId, user.userId),
    ]);
    const memberships = results[3].results as {
      conversation_id: string;
      user_id: string;
    }[];
    return reply({
      userId: user.userId,
      role: w.role,
      members: results[0].results,
      conversations: (results[1].results as Record<string, unknown>[]).map(
        (c) => ({
          ...c,
          member_ids: memberships
            .filter((m) => m.conversation_id === c.id)
            .map((m) => m.user_id),
        }),
      ),
      messages: (results[2].results as Record<string, unknown>[]).map((m) => ({
        ...m,
        body: m.deleted_at && m.author_id !== user.userId ? "" : m.body,
      })),
      workspaces: results[4].results,
    });
  } catch (error) {
    if (error instanceof RequestError) return requestFailure(error);
    console.error("Discussions read failed");
    return reply({ error: "Could not load discussions. Try again." }, 503);
  }
}
export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return reply({ error: "Sign in to continue." }, 401);
  let parsed;
  try {
    await enforceRateLimit(env.DB!, user.userId, "discussions:write");
    parsed = input.safeParse(await readMutation(request));
  } catch (error) {
    return requestFailure(error);
  }
  if (!parsed.success)
    return reply({ error: parsed.error.issues[0]?.message }, 400);
  const a = parsed.data,
    db = env.DB!,
    now = new Date().toISOString(),
    uid = () => crypto.randomUUID();
  try {
    if (a.action === "join") {
      const invite = await db
        .prepare(
          "SELECT * FROM workspace_invites WHERE code=? AND expires_at>?",
        )
        .bind(a.code, now)
        .first<{ workspace_id: string }>();
      if (!invite)
        return reply(
          { error: "This invitation is invalid, expired or revoked." },
          404,
        );
      await db
        .prepare("INSERT OR IGNORE INTO workspace_members VALUES(?,?,?,?,?)")
        .bind(
          invite.workspace_id,
          user.userId,
          user.displayName,
          user.email,
          now,
        )
        .run();
      return reply({ ok: true, workspaceId: invite.workspace_id });
    }
    const w = await workspaceFor(request, user);
    if (!w) return reply({ error: "Create or join a workspace first." }, 409);
    const canAccess = (cid: string) =>
      db
        .prepare(
          `SELECT c.* FROM conversations c WHERE c.id=? AND c.workspace_id=? AND ${visibility}`,
        )
        .bind(cid, w.id, user.userId)
        .first<{
          id: string;
          kind: string;
          created_by: string;
          session_id: string | null;
        }>();
    if (a.action === "invite" || a.action === "revokeInvite") {
      if (w.role !== "owner")
        return reply(
          { error: "Only the workspace owner can manage invitations." },
          403,
        );
      if (a.action === "revokeInvite") {
        await db
          .prepare(
            "DELETE FROM workspace_invites WHERE code=? AND workspace_id=?",
          )
          .bind(a.code, w.id)
          .run();
        return reply({ ok: true });
      }
      const code = uid(),
        expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      await db
        .prepare("INSERT INTO workspace_invites VALUES(?,?,?,?)")
        .bind(code, w.id, expiresAt, user.userId)
        .run();
      return reply({ ok: true, code, expiresAt });
    }
    if (a.action === "create" || a.action === "addMembers") {
      const members = [...new Set(a.members)];
      for (const member of members)
        if (
          member !== user.userId &&
          !(await db
            .prepare(
              "SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?",
            )
            .bind(w.id, member)
            .first())
        )
          return reply({ error: "Choose existing workspace members." }, 400);
      if (a.action === "addMembers") {
        const c = await canAccess(a.conversationId);
        if (
          !c ||
          c.created_by !== user.userId ||
          c.kind === "direct" ||
          c.kind === "room"
        )
          return reply(
            { error: "Only the creator can add members to this discussion." },
            403,
          );
        await db.batch(
          members.map((m) =>
            db
              .prepare("INSERT OR IGNORE INTO conversation_members VALUES(?,?)")
              .bind(c.id, m),
          ),
        );
        return reply({ ok: true });
      }
      if (
        a.kind === "direct" &&
        (members.length !== 1 || members[0] === user.userId)
      )
        return reply(
          { error: "Choose one other member for a peer discussion." },
          400,
        );
      if (a.kind === "direct") {
        const existing = await db
          .prepare(
            "SELECT c.id FROM conversations c WHERE c.workspace_id=? AND c.kind='direct' AND EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=c.id AND user_id=?) AND EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=c.id AND user_id=?)",
          )
          .bind(w.id, user.userId, members[0])
          .first<{ id: string }>();
        if (existing) return reply({ ok: true, id: existing.id });
      }
      const directKey =
        a.kind === "direct"
          ? w.id + ":" + [user.userId, members[0]].sort().join(":")
          : null;
      const cid = directKey
        ? "dm-" +
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(directKey),
              ),
            ),
          )
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        : uid();
      await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO conversations(id,workspace_id,name,description,kind,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(cid, w.id, a.name, a.description, a.kind, user.userId, now),
        ...[...new Set([user.userId, ...members])].map((m) =>
          db
            .prepare("INSERT OR IGNORE INTO conversation_members VALUES(?,?)")
            .bind(cid, m),
        ),
      ]);
      return reply({ ok: true, id: cid }, 201);
    }
    if (a.action === "room") {
      const s = await db
        .prepare(
          "SELECT s.id,s.title,p.status FROM sessions s JOIN projects p ON p.id=s.project_id WHERE s.id=? AND p.workspace_id=?",
        )
        .bind(a.sessionId, w.id)
        .first<{ id: string; title: string; status: string }>();
      if (!s || s.status !== "active")
        return reply({ error: "Choose a session in an active project." }, 403);
      const cid = uid();
      await db
        .prepare(
          "INSERT OR IGNORE INTO conversations(id,workspace_id,name,description,kind,created_by,created_at,session_id) VALUES(?,?,?,'Session discussion','room',?,?,?)",
        )
        .bind(cid, w.id, s.title, user.userId, now, s.id)
        .run();
      const c = await db
        .prepare("SELECT id FROM conversations WHERE session_id=?")
        .bind(s.id)
        .first<{ id: string }>();
      return reply({ ok: true, id: c!.id });
    }
    if (a.action === "message") {
      const c = await canAccess(a.conversationId);
      if (!c) return reply({ error: "Discussion unavailable." }, 403);
      if (c.session_id) {
        const p = await db
          .prepare(
            "SELECT p.status FROM sessions s JOIN projects p ON p.id=s.project_id WHERE s.id=?",
          )
          .bind(c.session_id)
          .first<{ status: string }>();
        if (p?.status !== "active")
          return reply(
            {
              error: "This room is read-only because its project is archived.",
            },
            403,
          );
      }
      const existing = await db
        .prepare("SELECT author_id,conversation_id FROM messages WHERE id=?")
        .bind(a.nonce)
        .first<{ author_id: string; conversation_id: string }>();
      if (
        existing &&
        (existing.author_id !== user.userId ||
          existing.conversation_id !== c.id)
      )
        return reply({ error: "Message ID already used." }, 409);
      await db
        .prepare(
          "INSERT OR IGNORE INTO messages(id,conversation_id,author_id,author_name,body,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(a.nonce, c.id, user.userId, user.displayName, a.body, now)
        .run();
      return reply({ ok: true, id: a.nonce }, 201);
    }
    const m = await db
      .prepare("SELECT * FROM messages WHERE id=? AND author_id=?")
      .bind(a.id, user.userId)
      .first<{ conversation_id: string }>();
    if (!m || !(await canAccess(m.conversation_id)))
      return reply({ error: "You can only change your own messages." }, 403);
    await db
      .prepare("UPDATE messages SET deleted_at=? WHERE id=? AND author_id=?")
      .bind(a.action === "deleteMessage" ? now : null, a.id, user.userId)
      .run();
    return reply({ ok: true });
  } catch {
    console.error("Discussion mutation failed");
    return reply({ error: "Could not save. Try again." }, 503);
  }
}
