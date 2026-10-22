import { reconcileCanvas } from "../../lib/canvas-reconcile";
import { env } from "../../platform/runtime";
import { getAuthenticatedUser } from "../../platform/auth";
import { z } from "zod";
import { canvasInput } from "@mayraviq/contracts/canvas-schema";
import {
  size,
  BOARD_WIDTH,
  BOARD_HEIGHT,
} from "@mayraviq/contracts/canvas-design";
import { workspaceFor } from "../../lib/workspace-access";
import {
  apiReply as reply,
  readMutation,
  requestFailure,
  RequestError,
} from "../../lib/api-boundary";
import { enforceRateLimit } from "../../lib/rate-limit";
const title = z.string().trim().min(1).max(120),
  id = z.string().min(1).max(100),
  version = z.number().int().nonnegative();
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setup"),
    name: title,
    transcription: z.boolean(),
    sample: z.boolean(),
  }),
  z.object({
    action: z.literal("project"),
    title,
    description: z.string().trim().max(1000),
    color: z.enum(["blue", "teal", "violet", "amber"]),
  }),
  z.object({ action: z.literal("archive"), id, archived: z.boolean() }),
  z.object({
    action: z.literal("session"),
    projectId: id,
    title,
    scheduledAt: z.string().datetime(),
  }),
  z.object({
    action: z.literal("sessionUpdate"),
    id,
    version,
    status: z.enum(["scheduled", "active", "ended"]),
    notes: z.string().max(30000),
    summary: z.string().max(10000),
  }),
  z.object({
    action: z.literal("decision"),
    sessionId: id,
    title: z.string().trim().min(1).max(1000),
    owner: title,
    dueAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  }),
  z.object({
    action: z.literal("review"),
    id,
    version,
    status: z.enum(["accepted", "rejected"]),
  }),
  z.object({
    action: z.literal("settings"),
    name: title,
    transcription: z.boolean(),
  }),
  canvasInput,
]);
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return reply({ error: "Sign in to access your workspace." }, 401);
  try {
    await enforceRateLimit(env.DB!, user.userId, "workspace:read", 180);
    const db = env.DB!;
    const workspace = await workspaceFor(request, user);
    if (!workspace)
      return reply({
        user,
        workspace: null,
        projects: [],
        sessions: [],
        decisions: [],
        audit: [],
        canvases: [],
      });
    const w = workspace.id;
    const results = await db.batch([
      db
        .prepare(
          "SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC",
        )
        .bind(w),
      db
        .prepare(
          "SELECT s.* FROM sessions s JOIN projects p ON p.id=s.project_id WHERE p.workspace_id = ? ORDER BY scheduled_at",
        )
        .bind(w),
      db
        .prepare(
          "SELECT d.* FROM decisions d JOIN sessions s ON s.id=d.session_id JOIN projects p ON p.id=s.project_id WHERE p.workspace_id = ? ORDER BY d.created_at DESC",
        )
        .bind(w),
      db
        .prepare(
          "SELECT * FROM audit WHERE workspace_id = ? ORDER BY at DESC LIMIT 100",
        )
        .bind(w),
      db
        .prepare(
          "SELECT c.* FROM canvases c JOIN projects p ON p.id=c.project_id WHERE p.workspace_id = ?",
        )
        .bind(w),
    ]);
    return reply({
      user,
      workspace,
      projects: results[0].results,
      sessions: results[1].results,
      decisions: results[2].results,
      audit: results[3].results,
      canvases: results[4].results,
    });
  } catch (error) {
    if (error instanceof RequestError) return requestFailure(error);
    console.error("Workspace read failed");
    return reply(
      { error: "Workspace could not be loaded. Please try again." },
      503,
    );
  }
}
export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    return reply({ error: "Sign in before changing your workspace." }, 401);
  let parsed;
  try {
    await enforceRateLimit(env.DB!, user.userId, "workspace:write");
    parsed = input.safeParse(await readMutation(request));
  } catch (error) {
    return requestFailure(error);
  }
  if (!parsed.success)
    return reply(
      {
        error:
          parsed.error.issues[0]?.message ?? "Check the fields and try again.",
      },
      400,
    );
  const a = parsed.data,
    db = env.DB!,
    now = new Date().toISOString(),
    uid = () => crypto.randomUUID();
  try {
    const workspace = await workspaceFor(request, user);
    if (a.action === "setup") {
      if (workspace)
        return reply(
          { error: "Your workspace already exists. Reload to continue." },
          409,
        );
      const w = uid(),
        p = uid(),
        s = uid();
      const statements = [
        db
          .prepare(
            "INSERT INTO workspaces(id,owner_id,name,created_at,transcription) VALUES(?,?,?,?,?)",
          )
          .bind(w, user.userId, a.name, now, +a.transcription),
      ];
      if (a.sample)
        statements.push(
          db
            .prepare(
              "INSERT INTO projects(id,workspace_id,title,description,color,created_at) VALUES(?,?,?,?,?,?)",
            )
            .bind(
              p,
              w,
              "Product launch · Example",
              "Illustrative project. Create your own project when you are ready.",
              "blue",
              now,
            ),
          db
            .prepare(
              "INSERT INTO sessions(id,project_id,title,scheduled_at,status,notes,summary) VALUES(?,?,?,?,?,?,?)",
            )
            .bind(
              s,
              p,
              "Launch planning · Example",
              now,
              "ended",
              "Example session notes: We discussed a phased launch. The team proposed starting with a private beta, gathering feedback, then expanding access. No decision was approved during this illustrative session.",
              "Example recap: A private beta was proposed as the first launch phase. The decision below needs your review.",
            ),
          db
            .prepare(
              "INSERT INTO decisions(id,session_id,title,owner,status,created_at) VALUES(?,?,?,?,?,?)",
            )
            .bind(
              uid(),
              s,
              "Start with a private beta before a wider launch · Example",
              user.displayName,
              "draft",
              now,
            ),
          db.prepare("INSERT INTO canvases(project_id,nodes) VALUES(?,?)").bind(
            p,
            JSON.stringify([
              {
                id: uid(),
                text: "Private beta",
                x: 120,
                y: 180,
                color: "blue",
              },
              {
                id: uid(),
                text: "Gather feedback",
                x: 390,
                y: 180,
                color: "teal",
              },
              {
                id: uid(),
                text: "Wider launch",
                x: 660,
                y: 180,
                color: "violet",
              },
            ]),
          ),
        );
      statements.push(
        db
          .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)")
          .bind(uid(), w, user.displayName, "Created workspace", w, now),
      );
      await db.batch(statements);
      return reply({ ok: true }, 201);
    }
    if (!workspace) return reply({ error: "Create a workspace first." }, 409);
    const w = workspace.id;
    const log = (action: string, artifact: string) =>
      db
        .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)")
        .bind(uid(), w, user.displayName, action, artifact, now);
    const project = (p: string) =>
      db
        .prepare("SELECT * FROM projects WHERE id=? AND workspace_id=?")
        .bind(p, w)
        .first<{ id: string; status: string }>();
    const session = (s: string) =>
      db
        .prepare(
          "SELECT s.*,p.status AS project_status FROM sessions s JOIN projects p ON p.id=s.project_id WHERE s.id=? AND p.workspace_id=?",
        )
        .bind(s, w)
        .first<{
          id: string;
          status: string;
          version: number;
          project_status: string;
        }>();
    if (a.action === "project") {
      const p = uid();
      await db.batch([
        db
          .prepare(
            "INSERT INTO projects(id,workspace_id,title,description,color,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(p, w, a.title, a.description, a.color, now),
        db
          .prepare("INSERT INTO canvases(project_id,nodes) VALUES(?,?)")
          .bind(p, "[]"),
        log("Created project", p),
      ]);
    } else if (a.action === "archive") {
      if (!(await project(a.id)))
        return reply({ error: "Project not found." }, 404);
      await db.batch([
        db
          .prepare("UPDATE projects SET status=? WHERE id=? AND workspace_id=?")
          .bind(a.archived ? "archived" : "active", a.id, w),
        log(a.archived ? "Archived project" : "Restored project", a.id),
      ]);
    } else if (a.action === "session") {
      const p = await project(a.projectId);
      if (!p || p.status !== "active")
        return reply({ error: "Choose an active project." }, 403);
      const s = uid();
      await db.batch([
        db
          .prepare(
            "INSERT INTO sessions(id,project_id,title,scheduled_at) VALUES(?,?,?,?)",
          )
          .bind(s, a.projectId, a.title, a.scheduledAt),
        log("Scheduled session", s),
      ]);
    } else if (a.action === "sessionUpdate") {
      const s = await session(a.id);
      if (!s || s.project_status !== "active")
        return reply(
          { error: "Session is unavailable or its project is archived." },
          403,
        );
      if (s.status === "ended" && a.status !== "ended")
        return reply({ error: "An ended session cannot be restarted." }, 409);
      const result = await db.batch([
        db
          .prepare(
            "INSERT INTO audit SELECT ?,?,?,?,id,? FROM sessions WHERE id=? AND version=?",
          )
          .bind(
            uid(),
            w,
            user.displayName,
            a.status !== s.status
              ? `Session ${a.status}`
              : "Updated session notes",
            now,
            a.id,
            a.version,
          ),
        db
          .prepare(
            "UPDATE sessions SET status=?,notes=?,summary=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(a.status, a.notes, a.summary, a.id, a.version),
      ]);
      if (!result[1].meta.changes)
        return reply(
          { error: "This session changed elsewhere. Reload before saving." },
          409,
        );
    } else if (a.action === "decision") {
      const s = await session(a.sessionId);
      if (!s || s.project_status !== "active")
        return reply(
          { error: "Session is unavailable or its project is archived." },
          403,
        );
      const d = uid();
      await db.batch([
        db
          .prepare(
            "INSERT INTO decisions(id,session_id,title,owner,due_at,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(d, a.sessionId, a.title, a.owner, a.dueAt, now),
        log("Proposed decision", d),
      ]);
    } else if (a.action === "review") {
      const d = await db
        .prepare(
          "SELECT d.id,p.status FROM decisions d JOIN sessions s ON s.id=d.session_id JOIN projects p ON p.id=s.project_id WHERE d.id=? AND p.workspace_id=?",
        )
        .bind(a.id, w)
        .first<{ id: string; status: string }>();
      if (!d || d.status !== "active")
        return reply(
          { error: "Decision is unavailable or its project is archived." },
          403,
        );
      const result = await db.batch([
        db
          .prepare(
            "INSERT INTO audit SELECT ?,?,?,?,id,? FROM decisions WHERE id=? AND version=? AND status='draft'",
          )
          .bind(
            uid(),
            w,
            user.displayName,
            `Decision ${a.status}`,
            now,
            a.id,
            a.version,
          ),
        db
          .prepare(
            "UPDATE decisions SET status=?,version=version+1 WHERE id=? AND version=? AND status='draft'",
          )
          .bind(a.status, a.id, a.version),
      ]);
      if (!result[1].meta.changes)
        return reply(
          {
            error:
              "This decision has already been reviewed. Reload to see its latest status.",
          },
          409,
        );
    } else if (a.action === "settings") {
      if (workspace.role !== "owner")
        return reply(
          { error: "Only the workspace owner can change preferences." },
          403,
        );
      await db.batch([
        db
          .prepare(
            "UPDATE workspaces SET name=?,transcription=? WHERE id=? AND owner_id=?",
          )
          .bind(a.name, +a.transcription, w, user.userId),
        log("Updated workspace preferences", w),
      ]);
    } else if (a.action === "canvas") {
      const p = await project(a.projectId);
      if (!p || p.status !== "active")
        return reply({ error: "Canvas is read-only or unavailable." }, 403);
      const current = await db
        .prepare("SELECT nodes,edges,version FROM canvases WHERE project_id=?")
        .bind(a.projectId)
        .first<{ nodes: string; edges: string; version: number }>();
      if (!current) throw new RequestError("Canvas unavailable.", 404);
      const merged = reconcileCanvas(a, current, a.projectId);
      a.nodes = merged.nodes;
      a.edges = merged.edges;
      a.version = merged.version;

      if (
        a.nodes.some(
          (n) =>
            n.x + size(n).width > BOARD_WIDTH ||
            n.y + size(n).height > BOARD_HEIGHT ||
            (n.frameId &&
              (n.kind === "frame" ||
                !a.nodes.some(
                  (f) => f.id === n.frameId && f.kind === "frame",
                ))),
        )
      )
        return reply(
          {
            error:
              "Elements must fit inside the board and refer to an existing frame.",
          },
          400,
        );
      if (
        new Set(a.nodes.map((n) => n.id)).size !== a.nodes.length ||
        a.edges?.some(
          (e) =>
            e.from === e.to ||
            !a.nodes.some((n) => n.id === e.from) ||
            !a.nodes.some((n) => n.id === e.to),
        )
      )
        return reply(
          {
            error: "Canvas connections must refer to distinct existing notes.",
          },
          400,
        );
      const result = await db.batch([
        db
          .prepare(
            "INSERT INTO audit SELECT ?,?,?,?,project_id,? FROM canvases WHERE project_id=? AND version=?",
          )
          .bind(
            uid(),
            w,
            user.displayName,
            "Saved canvas",
            now,
            a.projectId,
            a.version,
          ),
        db
          .prepare(
            "UPDATE canvases SET nodes=?,edges=coalesce(?,edges),version=version+1 WHERE project_id=? AND version=?",
          )
          .bind(
            JSON.stringify(a.nodes),
            a.edges ? JSON.stringify(a.edges) : null,
            a.projectId,
            a.version,
          ),
      ]);
      if (!result[1].meta.changes)
        return reply(
          { error: "Canvas changed elsewhere. Reload before saving." },
          409,
        );
    }
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof RequestError) return requestFailure(error);
    console.error("Workspace mutation failed");
    return reply(
      { error: "Could not save your changes. Please try again." },
      503,
    );
  }
}
