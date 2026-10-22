import { isHidden } from "@mayraviq/contracts/canvas-design";
import type { CanvasNode } from "@mayraviq/contracts/types";
import { z } from "zod";
import { getAuthenticatedUser } from "../../platform/auth";
import { env } from "../../platform/runtime";
import {
  apiReply,
  readMutation,
  requestFailure,
  RequestError,
} from "../../lib/api-boundary";
import { enforceRateLimit } from "../../lib/rate-limit";
import { roomAccess } from "../rooms/access";
import { aiConfiguration, generateDraft } from "./provider";
const input = z
  .object({ sessionId: z.string().uuid(), acknowledged: z.literal(true) })
  .strict();
let active = 0;
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiReply({ error: "Authentication required." }, 401);
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!z.string().uuid().safeParse(sessionId).success)
    return apiReply({ error: "Invalid room." }, 400);
  try {
    await enforceRateLimit(env.DB!, user.userId, "ai:read", 30);
    const room = await roomAccess(sessionId!, user.userId);
    if (!room) return apiReply({ error: "Room access denied." }, 403);
    const config = aiConfiguration();
    return apiReply({
      enabled: config.enabled,
      permitted:
        !!room.is_member &&
        room.project_status === "active" &&
        room.status !== "ended",
      provider: "Self-hosted Ollama",
      model: config.enabled ? config.model : "",
    });
  } catch (error) {
    return error instanceof RequestError
      ? requestFailure(error)
      : apiReply(
          { error: "AI settings or room context are unavailable." },
          503,
        );
  }
}
export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiReply({ error: "Authentication required." }, 401);
  try {
    const parsed = input.safeParse(await readMutation(request));
    if (!parsed.success)
      return apiReply(
        { error: "Choose a room and confirm its content can be processed." },
        400,
      );
    const room = await roomAccess(parsed.data.sessionId, user.userId);
    if (
      !room ||
      !room.is_member ||
      room.status === "ended" ||
      room.project_status !== "active"
    )
      return apiReply(
        {
          error:
            "Only workspace members in an active room can request AI assistance.",
        },
        403,
      );
    const config = aiConfiguration();
    if (!config.enabled)
      throw new RequestError("AI is not configured for this team.", 503);
    await enforceRateLimit(env.DB!, user.userId, "ai:generate", 4);
    if (active >= 2)
      throw new RequestError("AI is busy. Please try again shortly.", 429);
    active++;
    try {
      const messages = await env
        .DB!.prepare(
          "SELECT body FROM messages WHERE conversation_id IN(SELECT id FROM conversations WHERE session_id=?) AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30",
        )
        .bind(room.id)
        .all();
      const canvas = await env
        .DB!.prepare(
          "SELECT nodes,version FROM room_canvases WHERE session_id=?",
        )
        .bind(room.id)
        .first<{ nodes: string; version: number }>();
      const nodes: CanvasNode[] = canvas ? JSON.parse(canvas.nodes) : [];
      const labels = canvas
        ? nodes
            .filter((node) => !isHidden(nodes, node))
            .map((node: { text: string }) => node.text)
            .join("\n")
            .slice(0, 3500)
        : "";
      const context = JSON.stringify({
        roomTitle: room.title,
        notes: room.notes.slice(0, 12000),
        recentDiscussion: messages.results
          .reverse()
          .map((m) => m.body)
          .join("\n")
          .slice(-6000),
        designLabels: labels,
      });
      if (!room.notes.trim() && !messages.results.length && !labels.trim())
        return apiReply(
          {
            error:
              "Add notes, discussion or design content before requesting a draft.",
          },
          409,
        );
      const draft = await generateDraft(config, context);
      // Access may expire or the room may end while the model is running.
      const current = await roomAccess(room.id, user.userId);
      if (
        !current?.is_member ||
        current.status === "ended" ||
        current.project_status !== "active"
      )
        return apiReply(
          { error: "Room access changed. Draft was discarded." },
          403,
        );
      await env
        .DB!.prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          room.workspace_id,
          user.displayName,
          "Requested AI draft",
          room.id,
          new Date().toISOString(),
        )
        .run();
      return apiReply({
        draft,
        model: config.model,
        provider: "Self-hosted Ollama",
        generatedAt: new Date().toISOString(),
        sourceVersion: room.version,
        notesChangedDuringGeneration: current.version !== room.version,
        sources: {
          notesVersion: room.version,
          canvasVersion: canvas?.version ?? 0,
          discussionMessages: messages.results.length,
        },
      });
    } finally {
      active--;
    }
  } catch (error) {
    return error instanceof RequestError
      ? requestFailure(error)
      : apiReply(
          { error: "AI settings or room context are unavailable." },
          503,
        );
  }
}
