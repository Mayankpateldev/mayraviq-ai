import { env } from "../platform/runtime";
import type { AuthenticatedUser } from "../platform/auth";
export async function workspaceFor(request: Request, user: AuthenticatedUser) {
  const requested = request.headers.get("x-workspace-id");
  return env
    .DB!.prepare(
      `SELECT w.*, CASE WHEN w.owner_id=? THEN 'owner' ELSE 'member' END AS role FROM workspaces w WHERE (w.owner_id=? OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=?)) ${requested ? "AND w.id=?" : ""} ORDER BY CASE WHEN w.owner_id=? THEN 0 ELSE 1 END,w.created_at LIMIT 1`,
    )
    .bind(
      ...(requested
        ? [user.userId, user.userId, user.userId, requested, user.userId]
        : [user.userId, user.userId, user.userId, user.userId]),
    )
    .first<{ id: string; owner_id: string; name: string; role: string }>();
}
