import { randomUUID } from "node:crypto";
import { env } from "../../platform/runtime";
import { aiConfiguration } from "../ai/provider";
import { saveRecap } from "./recap";

/** One bounded job per tick; database leases also coordinate separate API processes. */
export async function processMeetingRecap() {
  if (!aiConfiguration().enabled) return false;
  const db = env.DB!,
    now = Date.now(),
    leaseId = randomUUID();
  // Recover older saved speech too, including ended rooms. Disabled workspaces are excluded.
  await db
    .prepare(
      `INSERT INTO meeting_recap_jobs(session_id)
    SELECT s.id FROM sessions s JOIN projects p ON p.id=s.project_id
    JOIN workspaces w ON w.id=p.workspace_id
    LEFT JOIN meeting_recaps r ON r.session_id=s.id
    WHERE p.status='active' AND w.transcription=1
    AND (SELECT count(*) FROM meeting_transcripts t WHERE t.session_id=s.id)>COALESCE(r.source_count,0)
    ON CONFLICT DO NOTHING`,
    )
    .run();
  const job = await db
    .prepare(
      `UPDATE meeting_recap_jobs SET lease_id=?,lease_until=?
    WHERE session_id=(SELECT session_id FROM meeting_recap_jobs WHERE due_at<=? AND lease_until<=? ORDER BY due_at,session_id LIMIT 1)
    AND lease_until<=? RETURNING session_id,attempts`,
    )
    .bind(leaseId, now + 120000, now, now, now)
    .first<{ session_id: string; attempts: number }>();
  if (!job) return false;
  try {
    const owner = await db
      .prepare(
        `SELECT w.owner_id FROM sessions s JOIN projects p ON p.id=s.project_id
      JOIN workspaces w ON w.id=p.workspace_id WHERE s.id=?`,
      )
      .bind(job.session_id)
      .first<{ owner_id: string }>();
    if (!owner) throw Error("Room no longer available");
    await saveRecap(job.session_id, owner.owner_id);
    await db
      .prepare(
        `DELETE FROM meeting_recap_jobs WHERE session_id=? AND lease_id=?
      AND (SELECT source_count FROM meeting_recaps WHERE session_id=?) >= (SELECT count(*) FROM meeting_transcripts WHERE session_id=?)`,
      )
      .bind(job.session_id, leaseId, job.session_id, job.session_id)
      .run();
    // If speech arrived during inference, leave the job for the next pass.
    await db
      .prepare(
        "UPDATE meeting_recap_jobs SET lease_until=0,lease_id=NULL,due_at=?,attempts=0 WHERE session_id=? AND lease_id=?",
      )
      .bind(Date.now() + 60000, job.session_id, leaseId)
      .run();
  } catch {
    // Never log private speech or model output. Retry state is durable and bounded in frequency.
    await db
      .prepare(
        "UPDATE meeting_recap_jobs SET lease_until=0,lease_id=NULL,due_at=?,attempts=LEAST(attempts+1,10) WHERE session_id=? AND lease_id=?",
      )
      .bind(
        Date.now() + Math.min(300000, 15000 * 2 ** Math.min(job.attempts, 5)),
        job.session_id,
        leaseId,
      )
      .run();
  }
  return true;
}
export function startMeetingRecapWorker() {
  let stopped = false,
    current: Promise<unknown> | null = null;
  const tick = () => {
    if (stopped || current) return;
    current = processMeetingRecap()
      .catch(() => {
        console.error("Meeting recap worker unavailable; retrying.");
      })
      .finally(() => {
        current = null;
      });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await current;
  };
}
