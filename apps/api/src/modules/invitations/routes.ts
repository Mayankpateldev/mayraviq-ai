import { matchesRecipient } from "./recipient";
import { z } from "zod";
import { env } from "../../platform/runtime";
import { getAuthenticatedUser } from "../../platform/auth";
import {
  apiReply,
  readMutation,
  requestFailure,
  RequestError,
} from "../../lib/api-boundary";
import { enforceRateLimit } from "../../lib/rate-limit";
import { roomAccess } from "../rooms/access";
import { hashInvite } from "../../lib/room-token";
import { mailMode, prepareMail, sealMail, openMail, sendMail } from "./mail";
const id = z.string().uuid();
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("invite"),
      sessionId: id,
      nonce: id,
      recipient: z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("member"),
            userId: z.string().min(1).max(200),
          })
          .strict(),
        z
          .object({
            kind: z.literal("email"),
            email: z.string().trim().toLowerCase().email().max(254),
          })
          .strict(),
      ]),
      emailCopy: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("respond"),
      inviteId: id,
      response: z.enum(["accepted", "declined"]),
    })
    .strict(),
]);
type Recipient = {
  recipient_user_id: string | null;
  recipient_email: string | null;
};
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiReply({ error: "Sign in to view invitations." }, 401);
  try {
    await enforceRateLimit(env.DB!, user.userId, "invitations:read", 60);
    const url = new URL(request.url),
      preview = url.searchParams.get("previewId"),
      sessionId = url.searchParams.get("sessionId");
    if (preview) {
      if (!id.safeParse(preview).success)
        throw new RequestError("Invalid invitation.", 400);
      const mail = await env
        .DB!.prepare(
          "SELECT r.mail_ciphertext,i.session_id FROM room_invite_recipients r JOIN room_invites i ON i.id=r.invite_id WHERE i.id=? AND i.created_by=?",
        )
        .bind(preview, user.userId)
        .first<{ mail_ciphertext: string | null; session_id: string }>();
      if (
        !mail?.mail_ciphertext ||
        !(await roomAccess(mail.session_id, user.userId))?.is_member
      )
        throw new RequestError("Email preview denied.", 403);
      return apiReply(JSON.parse(openMail(mail.mail_ciphertext, preview)));
    }
    if (!sessionId) {
      const result = await env
        .DB!.prepare(
          "SELECT i.id,i.session_id,i.expires_at,i.revoked_at,r.state,s.title,s.scheduled_at,p.status AS project_status,s.status FROM room_invites i JOIN room_invite_recipients r ON r.invite_id=i.id JOIN sessions s ON s.id=i.session_id JOIN projects p ON p.id=s.project_id WHERE r.recipient_user_id=? OR (r.recipient_user_id IS NULL AND r.recipient_email=? AND ?=true) ORDER BY i.created_at DESC LIMIT 100",
        )
        .bind(user.userId, user.email.trim().toLowerCase(), user.emailVerified)
        .all();
      return apiReply({ invitations: result.results });
    }
    if (!id.safeParse(sessionId).success)
      throw new RequestError("Invalid room.", 400);
    const room = await roomAccess(sessionId, user.userId);
    if (!room?.is_member)
      throw new RequestError("Only workspace members manage invitations.", 403);
    const members = await env
      .DB!.prepare(
        "SELECT user_id,name,email FROM workspace_members WHERE workspace_id=? UNION ALL SELECT owner_id AS user_id,'Workspace owner' AS name,NULL AS email FROM workspaces WHERE id=? AND NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=owner_id)",
      )
      .bind(room.workspace_id, room.workspace_id, room.workspace_id)
      .all();
    const invites = await env
      .DB!.prepare(
        "SELECT i.id,i.expires_at,i.revoked_at,r.recipient_user_id,r.recipient_email,r.state,r.delivery,(i.created_by=?) AS can_preview FROM room_invites i JOIN room_invite_recipients r ON r.invite_id=i.id WHERE i.session_id=? ORDER BY i.created_at DESC LIMIT 100",
      )
      .bind(user.userId, sessionId)
      .all();
    return apiReply({
      members: members.results.map((m) =>
        m.user_id === user.userId
          ? { ...m, name: user.displayName, email: user.email }
          : m,
      ),
      invitations: invites.results,
      mailMode: mailMode(),
      readOnly: room.status === "ended" || room.project_status !== "active",
    });
  } catch (e) {
    return e instanceof RequestError
      ? requestFailure(e)
      : apiReply({ error: "Invitation service unavailable." }, 503);
  }
}
export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiReply({ error: "Sign in to manage invitations." }, 401);
  try {
    const parsed = input.safeParse(await readMutation(request));
    if (!parsed.success)
      throw new RequestError("Check invitation fields.", 400);
    const a = parsed.data,
      db = env.DB!,
      now = new Date().toISOString();
    await enforceRateLimit(db, user.userId, "invitations:write", 20);
    if (a.action === "respond") {
      const invitation = await db
        .prepare(
          "SELECT i.*,r.recipient_user_id,r.recipient_email,r.state,s.status,p.status AS project_status FROM room_invites i JOIN room_invite_recipients r ON r.invite_id=i.id JOIN sessions s ON s.id=i.session_id JOIN projects p ON p.id=s.project_id WHERE i.id=?",
        )
        .bind(a.inviteId)
        .first<
          Recipient & {
            id: string;
            session_id: string;
            expires_at: string;
            revoked_at: string | null;
            state: string;
            status: string;
            project_status: string;
          }
        >();
      if (
        !invitation ||
        !matchesRecipient(invitation, user) ||
        invitation.revoked_at ||
        invitation.expires_at <= now ||
        invitation.status === "ended" ||
        invitation.project_status !== "active"
      )
        throw new RequestError(
          "Invitation expired, unavailable or intended for another person.",
          403,
        );
      await db.batch([
        db
          .prepare(
            "UPDATE room_invite_recipients SET state=?,responded_at=? WHERE invite_id=?",
          )
          .bind(a.response, now, a.inviteId),
        ...(a.response === "accepted"
          ? [
              db
                .prepare(
                  "INSERT INTO room_guests(session_id,user_id,expires_at,invite_id) VALUES(?,?,?,?) ON CONFLICT(session_id,user_id) DO UPDATE SET expires_at=excluded.expires_at,invite_id=excluded.invite_id",
                )
                .bind(
                  invitation.session_id,
                  user.userId,
                  invitation.expires_at,
                  invitation.id,
                ),
            ]
          : [
              db
                .prepare(
                  "DELETE FROM room_guests WHERE session_id=? AND user_id=? AND invite_id=?",
                )
                .bind(invitation.session_id, user.userId, invitation.id),
            ]),
      ]);
      return apiReply({ ok: true, sessionId: invitation.session_id });
    }
    const room = await roomAccess(a.sessionId, user.userId);
    if (
      !room?.is_member ||
      room.status === "ended" ||
      room.project_status !== "active"
    )
      throw new RequestError(
        "Only members in an active room can invite people.",
        403,
      );
    const existing = await db
      .prepare(
        "SELECT i.created_by,i.session_id,r.delivery,r.recipient_user_id,r.recipient_email FROM room_invites i JOIN room_invite_recipients r ON r.invite_id=i.id WHERE i.id=?",
      )
      .bind(a.nonce)
      .first<
        Recipient & { created_by: string; session_id: string; delivery: string }
      >();
    if (existing) {
      if (
        existing.created_by !== user.userId ||
        existing.session_id !== room.id
      )
        throw new RequestError("Invitation ID conflict.", 409);
      const sameRecipient =
        a.recipient.kind === "member"
          ? existing.recipient_user_id === a.recipient.userId
          : !existing.recipient_user_id &&
            existing.recipient_email === a.recipient.email;
      const wantsEmail = a.recipient.kind === "email" || a.emailCopy;
      if (!sameRecipient || wantsEmail !== (existing.delivery !== "in_app"))
        throw new RequestError(
          "Invitation ID used with different recipient or delivery fields.",
          409,
        );
      return apiReply({ inviteId: a.nonce, delivery: existing.delivery });
    }
    let recipientUser: string | null = null,
      email: string | null = null;
    if (a.recipient.kind === "member") {
      const person = await db
        .prepare(
          "SELECT user_id,email FROM workspace_members WHERE workspace_id=? AND user_id=? UNION ALL SELECT owner_id AS user_id,NULL AS email FROM workspaces WHERE id=? AND owner_id=?",
        )
        .bind(
          room.workspace_id,
          a.recipient.userId,
          room.workspace_id,
          a.recipient.userId,
        )
        .first<{ user_id: string; email: string | null }>();
      if (!person)
        throw new RequestError("Choose a member of this workspace.", 403);
      recipientUser = person.user_id;
      email = person.user_id === user.userId ? user.email : person.email;
    } else email = a.recipient.email;
    const wantsEmail = a.recipient.kind === "email" || a.emailCopy,
      mode = mailMode();
    if (
      wantsEmail &&
      (mode === "disabled" || !z.string().email().safeParse(email).success)
    )
      throw new RequestError(
        "Email delivery is unavailable for this address. Invite the teammate in-app or configure email.",
        503,
      );
    const code = crypto.randomUUID(),
      expiresAt = new Date(Date.now() + 86400000).toISOString();
    const mail = wantsEmail
      ? await prepareMail({
          id: a.nonce,
          title: room.title,
          scheduledAt: room.scheduled_at,
          inviter: user.displayName,
          email: email!,
          code,
          sessionId: room.id,
        })
      : null;
    const delivery = wantsEmail
      ? mode === "smtp"
        ? "sending"
        : "preview"
      : "in_app";
    await db.batch([
      db
        .prepare("INSERT INTO room_invites VALUES(?,?,?,?,?,?,NULL)")
        .bind(
          a.nonce,
          room.id,
          await hashInvite(code),
          expiresAt,
          user.userId,
          now,
        ),
      db
        .prepare(
          "INSERT INTO room_invite_recipients(invite_id,recipient_user_id,recipient_email,delivery,mail_ciphertext) VALUES(?,?,?,?,?)",
        )
        .bind(
          a.nonce,
          recipientUser,
          email?.trim().toLowerCase() || null,
          delivery,
          mail
            ? sealMail(
                JSON.stringify({
                  raw: mail.raw,
                  subject: mail.subject,
                  text: mail.text,
                  calendar: mail.calendar,
                }),
                a.nonce,
              )
            : null,
        ),
      db
        .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          room.workspace_id,
          user.displayName,
          "Created targeted meeting invitation",
          room.id,
          now,
        ),
    ]);
    if (mail && mode === "smtp") {
      try {
        await sendMail(mail.options);
        await db
          .prepare(
            "UPDATE room_invite_recipients SET delivery='accepted_by_smtp' WHERE invite_id=?",
          )
          .bind(a.nonce)
          .run();
        return apiReply(
          { inviteId: a.nonce, delivery: "accepted_by_smtp" },
          201,
        );
      } catch {
        await db
          .prepare(
            "UPDATE room_invite_recipients SET delivery='failed' WHERE invite_id=?",
          )
          .bind(a.nonce)
          .run();
        return apiReply({ inviteId: a.nonce, delivery: "failed" }, 201);
      }
    }
    return apiReply({ inviteId: a.nonce, delivery }, 201);
  } catch (e) {
    return e instanceof RequestError
      ? requestFailure(e)
      : apiReply({ error: "Could not create invitation." }, 503);
  }
}
