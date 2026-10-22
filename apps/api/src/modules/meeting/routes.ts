import { saveRecap, transcriptionAllowed as allowed } from "./recap";
import { z } from "zod";
import { getAuthenticatedUser } from "../../platform/auth";
import { env } from "../../platform/runtime";
import {
  apiReply,
  readMutation,
  requestFailure,
  RequestError,
} from "../../lib/api-boundary";
import { roomAccess } from "../rooms/access";
import { enforceRateLimit } from "../../lib/rate-limit";
import { aiConfiguration } from "../ai/provider";
import { speechConfiguration, transcribe } from "./speech";
const base = { sessionId: z.string().uuid() };
const input = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("clip"),
      acknowledged: z.literal(true),
      id: z.string().uuid(),
      capturedAt: z.string().datetime(),
      audio: z.string().min(1).max(214000),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("recap"),
      refresh: z.boolean().optional(),
    })
    .strict(),
]);
const generating = new Set<string>();
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiReply({ error: "Authentication required." }, 401);
  try {
    const id = new URL(request.url).searchParams.get("sessionId");
    if (!z.string().uuid().safeParse(id).success)
      throw new RequestError("Invalid room.", 400);
    const room = await roomAccess(id!, user.userId);
    if (!room) throw new RequestError("Room access denied.", 403);
    await enforceRateLimit(env.DB!, user.userId, "meeting:read", 60);
    const clips = await env
      .DB!.prepare(
        "SELECT id,speaker,body,captured_at FROM meeting_transcripts WHERE session_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
      )
      .bind(id)
      .all();
    const count = await env
      .DB!.prepare(
        "SELECT count(*) AS count FROM meeting_transcripts WHERE session_id=?",
      )
      .bind(id)
      .first<{ count: number | string }>();
    const recap = await env
      .DB!.prepare(
        "SELECT draft,source_count,generated_at FROM meeting_recaps WHERE session_id=?",
      )
      .bind(id)
      .first<{ draft: string; source_count: number; generated_at: string }>();
    return apiReply({
      enabled: speechConfiguration() && (await allowed(room.workspace_id)),
      aiEnabled: aiConfiguration().enabled,
      member: !!room.is_member,
      clips: clips.results.reverse(),
      count: Number(count?.count || 0),
      recap: recap ? { ...recap, draft: JSON.parse(recap.draft) } : null,
    });
  } catch (e) {
    return e instanceof RequestError
      ? requestFailure(e)
      : apiReply({ error: "Meeting notes unavailable." }, 503);
  }
}
export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiReply({ error: "Authentication required." }, 401);
  try {
    const parsed = input.safeParse(await readMutation(request));
    if (!parsed.success)
      throw new RequestError(
        "Invalid meeting request. Consent is required for audio.",
        400,
      );
    const a = parsed.data,
      room = await roomAccess(a.sessionId, user.userId);
    if (!room || room.status === "ended" || room.project_status !== "active")
      throw new RequestError("Active room access required.", 403);
    if (!(await allowed(room.workspace_id)))
      throw new RequestError(
        "Workspace transcription is disabled. Ask the owner to enable it in Settings.",
        403,
      );
    if (a.action === "clip") {
      await enforceRateLimit(env.DB!, user.userId, "meeting:clip", 10);
      const existing = await env
        .DB!.prepare(
          "SELECT session_id,user_id FROM meeting_transcripts WHERE id=?",
        )
        .bind(a.id)
        .first<{ session_id: string; user_id: string }>();
      if (existing) {
        if (existing.session_id !== room.id || existing.user_id !== user.userId)
          throw new RequestError("Clip ID conflict.", 409);
        return apiReply({ saved: true });
      }
      const text = await transcribe(a.audio);
      const current = await roomAccess(room.id, user.userId);
      if (
        !current ||
        current.status === "ended" ||
        current.project_status !== "active" ||
        !(await allowed(room.workspace_id))
      )
        throw new RequestError("Room access changed. Audio discarded.", 403);
      if (text.trim())
        await env.DB!.batch([
          env
            .DB!.prepare(
              "INSERT OR IGNORE INTO meeting_transcripts VALUES(?,?,?,?,?,?,?)",
            )
            .bind(
              a.id,
              room.id,
              user.userId,
              user.displayName,
              text,
              a.capturedAt,
              new Date().toISOString(),
            ),
          env
            .DB!.prepare(
              "INSERT INTO meeting_recap_jobs(session_id) VALUES(?) ON CONFLICT DO NOTHING",
            )
            .bind(room.id),
        ]);
      return apiReply({ saved: true, empty: !text.trim() });
    }
    if (!room.is_member)
      throw new RequestError("Workspace members generate recaps.", 403);
    if (generating.size >= 2 || generating.has(room.id))
      throw new RequestError("Recap already updating.", 429);
    await enforceRateLimit(env.DB!, user.userId, "meeting:recap", 2);
    generating.add(room.id);
    try {
      await saveRecap(room.id, user.userId, a.refresh);
      return apiReply({ saved: true });
    } finally {
      generating.delete(room.id);
    }
  } catch (e) {
    return e instanceof RequestError
      ? requestFailure(e)
      : apiReply({ error: "Meeting processing unavailable." }, 503);
  }
}
