import { env } from "../../platform/runtime";
import { RequestError } from "../../lib/api-boundary";
import { roomAccess } from "../rooms/access";
import { aiConfiguration, generateDraft } from "../ai/provider";
import { meetingPrompt } from "./prompt";
export async function transcriptionAllowed(workspaceId: string) {
  const settings = await env
    .DB!.prepare("SELECT transcription FROM workspaces WHERE id=?")
    .bind(workspaceId)
    .first<{ transcription: number }>();
  return !!settings?.transcription;
}
export async function saveRecap(
  sessionId: string,
  userId: string,
  refresh = false,
) {
  const room = await roomAccess(sessionId, userId);
  if (
    !room?.is_member ||
    room.project_status !== "active" ||
    !(await transcriptionAllowed(room.workspace_id))
  )
    throw new RequestError("Meeting processing is no longer permitted.", 403);
  const workspaceId = room.workspace_id;
  const total = await env
    .DB!.prepare(
      "SELECT count(*) AS count FROM meeting_transcripts WHERE session_id=?",
    )
    .bind(sessionId)
    .first<{ count: number | string }>();
  const count = Number(total?.count || 0);
  if (!count) throw new RequestError("Waiting for speech.", 409);
  const old = await env
    .DB!.prepare(
      "SELECT draft,source_count FROM meeting_recaps WHERE session_id=?",
    )
    .bind(sessionId)
    .first<{ draft: string; source_count: number }>();
  if (old && old.source_count >= count && !refresh) return;
  // Incremental evidence is bounded; previous recap is a draft, not an approved decision.
  const clips = await env
    .DB!.prepare(
      "SELECT speaker,body FROM meeting_transcripts WHERE session_id=? ORDER BY created_at DESC,id DESC LIMIT 60",
    )
    .bind(sessionId)
    .all();
  const draft = await generateDraft(
    aiConfiguration(),
    JSON.stringify({
      previousDraft: old && count > 60 ? old.draft.slice(0, 6000) : null,
      transcript: clips.results
        .reverse()
        .map((c) => `${c.speaker}: ${c.body}`)
        .join("\n")
        .slice(-14000),
    }),
    fetch,
    meetingPrompt,
  );
  draft.actions = draft.actions.filter(
    (a) => !/^(none|n\/a|no actions?)\.?$/i.test(a.title.trim()),
  );
  const current = await roomAccess(sessionId, userId);
  if (
    !current?.is_member ||
    current.project_status !== "active" ||
    !(await transcriptionAllowed(workspaceId))
  )
    throw new RequestError("Room access changed. Recap discarded.", 403);
  await env
    .DB!.prepare(
      "INSERT INTO meeting_recaps VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET draft=excluded.draft,source_count=excluded.source_count,generated_at=excluded.generated_at WHERE meeting_recaps.source_count<=excluded.source_count",
    )
    .bind(sessionId, JSON.stringify(draft), count, new Date().toISOString())
    .run();
}
