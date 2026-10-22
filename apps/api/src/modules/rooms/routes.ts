import { matchesRecipient } from "../invitations/recipient";
import { reconcileCanvas } from "../../lib/canvas-reconcile";
import { roomAccess as access } from "./access";
import { env } from "../../platform/runtime";
import { z } from "zod";
import { getAuthenticatedUser } from "../../platform/auth";
import {
  apiReply as reply,
  readMutation,
  requestFailure,
  RequestError,
} from "../../lib/api-boundary";
import { canvasInput } from "@mayraviq/contracts/canvas-schema";
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  size,
} from "@mayraviq/contracts/canvas-design";
import { roomToken, hashInvite, mediaConfigured } from "../../lib/room-token";
import { enforceRateLimit } from "../../lib/rate-limit";
const id = z.string().uuid();
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("token"),
    sessionId: id,
    clientId: id.optional(),
  }),
  z.object({ action: z.literal("invite"), sessionId: id }),
  z.object({ action: z.literal("revoke"), sessionId: id, inviteId: id }),
  z.object({
    action: z.literal("redeem"),
    sessionId: id,
    code: z.string().uuid(),
  }),
  z.object({
    action: z.literal("notes"),
    sessionId: id,
    version: z.number().int().nonnegative(),
    notes: z.string().max(30000),
  }),
  z.object({
    action: z.literal("message"),
    sessionId: id,
    body: z.string().trim().min(1).max(6000),
    nonce: id,
  }),
  z.object({
    action: z.literal("propose"),
    sessionId: id,
    title: z.string().trim().min(1).max(1000),
    owner: z.string().trim().min(1).max(120),
  }),
  canvasInput.omit({ projectId: true }).extend({ sessionId: id }),
]);
async function ensureBoard(sessionId: string) {
  await env
    .DB!.prepare("INSERT OR IGNORE INTO room_canvases(session_id) VALUES(?)")
    .bind(sessionId)
    .run();
}
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return reply({ error: "Sign in to join this room." }, 401);
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!id.safeParse(sessionId).success)
    return reply({ error: "Invalid room." }, 400);
  try {
    await enforceRateLimit(env.DB!, user.userId, "rooms:read", 180);
    const room = await access(sessionId!, user.userId);
    if (!room)
      return reply(
        { error: "This room needs an invitation or workspace membership." },
        403,
      );
    await ensureBoard(room.id);
    const result = await env.DB!.batch([
      env
        .DB!.prepare(
          "SELECT nodes,edges,version FROM room_canvases WHERE session_id=?",
        )
        .bind(room.id),
      env
        .DB!.prepare(
          "SELECT id,author_name,body,created_at FROM messages WHERE conversation_id IN(SELECT id FROM conversations WHERE session_id=?) AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100",
        )
        .bind(room.id),
      env
        .DB!.prepare(
          "SELECT id,title,owner,status FROM decisions WHERE session_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .bind(room.id),
    ]);
    return reply({
      session: {
        id: room.id,
        title: room.title,
        notes: room.notes,
        summary: room.summary,
        status: room.status,
        version: room.version,
      },
      role: room.is_member ? "member" : "guest",
      canInvite: !!room.is_member,
      readOnly: room.project_status !== "active" || room.status === "ended",
      mediaReady: mediaConfigured(env),
      canvas: result[0].results[0],
      messages: result[1].results.reverse(),
      actions: result[2].results,
      user: { id: user.userId, name: user.displayName },
    });
  } catch (error) {
    if (error instanceof RequestError) return requestFailure(error);
    console.error("Room read failed");
    return reply({ error: "Room unavailable. Try again." }, 503);
  }
}
export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return reply({ error: "Sign in to join this room." }, 401);
  let parsed;
  try {
    await enforceRateLimit(env.DB!, user.userId, "rooms:write");
    parsed = input.safeParse(await readMutation(request));
  } catch (error) {
    return requestFailure(error);
  }
  if (!parsed.success)
    return reply({ error: "Check the room request fields." }, 400);
  const a = parsed.data,
    db = env.DB!,
    now = new Date().toISOString();
  try {
    if (a.action === "redeem") {
      const invite = await db
        .prepare(
          "SELECT i.id,i.expires_at,r.recipient_user_id,r.recipient_email,r.state FROM room_invites i LEFT JOIN room_invite_recipients r ON r.invite_id=i.id JOIN sessions s ON s.id=i.session_id JOIN projects p ON p.id=s.project_id WHERE i.code_hash=? AND i.session_id=? AND i.expires_at>? AND i.revoked_at IS NULL AND s.status!='ended' AND p.status='active'",
        )
        .bind(await hashInvite(a.code), a.sessionId, now)
        .first<{
          id: string;
          expires_at: string;
          recipient_user_id: string | null;
          recipient_email: string | null;
          state: string | null;
        }>();
      if (
        !invite ||
        (invite.state &&
          (invite.state === "declined" || !matchesRecipient(invite, user)))
      )
        return reply(
          { error: "Invitation expired, revoked or unavailable." },
          403,
        );
      if (invite.state)
        await db
          .prepare(
            "UPDATE room_invite_recipients SET state='accepted',responded_at=? WHERE invite_id=?",
          )
          .bind(now, invite.id)
          .run();
      await db
        .prepare(
          "INSERT INTO room_guests(session_id,user_id,expires_at,invite_id) VALUES(?,?,?,?) ON CONFLICT(session_id,user_id) DO UPDATE SET expires_at=excluded.expires_at,invite_id=excluded.invite_id",
        )
        .bind(a.sessionId, user.userId, invite.expires_at, invite.id)
        .run();
      return reply({ ok: true });
    }
    const room = await access(a.sessionId, user.userId);
    if (!room) return reply({ error: "Room access denied." }, 403);
    if (room.project_status !== "active" || room.status === "ended")
      return reply({ error: "This room is read-only." }, 403);
    if (a.action === "token") {
      await enforceRateLimit(db, user.userId, "rooms:token", 20);
      if (!mediaConfigured(env))
        return reply(
          {
            error:
              "Calling needs a configured media service. The room canvas, notes and discussion are available.",
          },
          503,
        );
      const issuedAt = Math.floor(Date.now() / 1000);
      let expiresAt = issuedAt + 300;
      if (!room.is_member) {
        const guest = await db
          .prepare(
            "SELECT expires_at FROM room_guests WHERE session_id=? AND user_id=?",
          )
          .bind(room.id, user.userId)
          .first<{ expires_at: string }>();
        expiresAt = guest ? Math.floor(Date.parse(guest.expires_at) / 1000) : 0;
        if (!Number.isFinite(expiresAt) || expiresAt <= issuedAt)
          return reply({ error: "Room invitation expired." }, 403);
      }
      return reply({
        token: await roomToken(
          env.LIVEKIT_API_KEY!,
          env.LIVEKIT_API_SECRET!,
          "mayraviq-" + room.id,
          a.clientId ? user.userId + ":" + a.clientId : user.userId,
          user.displayName,
          issuedAt,
          expiresAt,
        ),
        url: env.LIVEKIT_URL,
      });
    }
    if (a.action === "invite" || a.action === "revoke") {
      if (!room.is_member)
        return reply(
          { error: "Only workspace members can manage room invitations." },
          403,
        );
      if (a.action === "revoke") {
        await db.batch([
          db
            .prepare(
              "UPDATE room_invites SET revoked_at=? WHERE id=? AND session_id=?",
            )
            .bind(now, a.inviteId, room.id),
          db
            .prepare(
              "DELETE FROM room_guests WHERE session_id=? AND invite_id=?",
            )
            .bind(room.id, a.inviteId),
        ]);
        return reply({ ok: true });
      }
      const code = crypto.randomUUID(),
        inviteId = crypto.randomUUID(),
        expiresAt = new Date(Date.now() + 86400000).toISOString();
      await db
        .prepare("INSERT INTO room_invites VALUES(?,?,?,?,?,?,NULL)")
        .bind(
          inviteId,
          room.id,
          await hashInvite(code),
          expiresAt,
          user.userId,
          now,
        )
        .run();
      return reply({ code, inviteId, expiresAt });
    }
    if (a.action === "canvas") {
      await ensureBoard(room.id);
      const current = await db
        .prepare(
          "SELECT nodes,edges,version FROM room_canvases WHERE session_id=?",
        )
        .bind(room.id)
        .first<{ nodes: string; edges: string; version: number }>();
      if (!current) throw new RequestError("Canvas unavailable.", 404);
      const merged = reconcileCanvas(a, current, room.id);
      a.nodes = merged.nodes;
      a.edges = merged.edges;
      a.version = merged.version;

      if (
        new Set(a.nodes.map((n) => n.id)).size !== a.nodes.length ||
        a.nodes.some(
          (n) =>
            n.x + size(n).width > BOARD_WIDTH ||
            n.y + size(n).height > BOARD_HEIGHT ||
            (n.frameId &&
              (n.kind === "frame" ||
                !a.nodes.some(
                  (f) => f.id === n.frameId && f.kind === "frame",
                ))),
        ) ||
        a.edges?.some(
          (e) =>
            e.from === e.to ||
            !a.nodes.some((n) => n.id === e.from) ||
            !a.nodes.some((n) => n.id === e.to),
        )
      )
        return reply({ error: "Invalid canvas geometry or connections." }, 400);
      await ensureBoard(room.id);
      const result = await db
        .prepare(
          "UPDATE room_canvases SET nodes=?,edges=coalesce(?,edges),version=version+1 WHERE session_id=? AND version=?",
        )
        .bind(
          JSON.stringify(a.nodes),
          a.edges ? JSON.stringify(a.edges) : null,
          room.id,
          a.version,
        )
        .run();
      if (!result.meta.changes)
        return reply(
          {
            error:
              "Another person saved this canvas. Reload the room before saving.",
          },
          409,
        );
    } else if (a.action === "notes") {
      const result = await db
        .prepare(
          "UPDATE sessions SET notes=?,version=version+1 WHERE id=? AND version=?",
        )
        .bind(a.notes, room.id, a.version)
        .run();
      if (!result.meta.changes)
        return reply(
          { error: "Notes changed elsewhere. Reload before saving." },
          409,
        );
    } else if (a.action === "propose") {
      await db.batch([
        db
          .prepare(
            "INSERT INTO decisions(id,session_id,title,owner,created_at) VALUES(?,?,?,?,?)",
          )
          .bind(crypto.randomUUID(), room.id, a.title, a.owner, now),
        db
          .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)")
          .bind(
            crypto.randomUUID(),
            room.workspace_id,
            user.displayName,
            "Proposed room action",
            room.id,
            now,
          ),
      ]);
    } else if (a.action === "message") {
      await db
        .prepare(
          "INSERT OR IGNORE INTO conversations(id,workspace_id,name,description,kind,created_by,created_at,session_id) VALUES(?,?,?,'Session discussion','room',?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          room.workspace_id,
          room.title,
          user.userId,
          now,
          room.id,
        )
        .run();
      const c = await db
        .prepare("SELECT id FROM conversations WHERE session_id=?")
        .bind(room.id)
        .first<{ id: string }>();
      const existing = await db
        .prepare("SELECT author_id,conversation_id FROM messages WHERE id=?")
        .bind(a.nonce)
        .first<{ author_id: string; conversation_id: string }>();
      if (
        existing &&
        (existing.author_id !== user.userId ||
          existing.conversation_id !== c!.id)
      )
        return reply({ error: "Message ID already used." }, 409);
      await db
        .prepare(
          "INSERT OR IGNORE INTO messages(id,conversation_id,author_id,author_name,body,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(a.nonce, c!.id, user.userId, user.displayName, a.body, now)
        .run();
    }
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof RequestError) return requestFailure(error);
    console.error("Room mutation failed");
    return reply({ error: "Could not save room changes." }, 503);
  }
}
