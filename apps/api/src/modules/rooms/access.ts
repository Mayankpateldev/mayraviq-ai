import { env } from "../../platform/runtime";
type RoomAccess = {
  id: string;
  title: string;
  scheduled_at: string;
  notes: string;
  summary: string;
  status: string;
  version: number;
  project_id: string;
  workspace_id: string;
  project_status: string;
  is_member: boolean;
  is_owner: boolean;
};
export async function roomAccess(sessionId: string, userId: string) {
  return env
    .DB!.prepare(
      `SELECT s.*,p.workspace_id,p.status AS project_status,
  (w.owner_id=? OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=?)) AS is_member,
  (w.owner_id=?) AS is_owner
  FROM sessions s JOIN projects p ON p.id=s.project_id JOIN workspaces w ON w.id=p.workspace_id
  WHERE s.id=? AND (w.owner_id=? OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=?) OR EXISTS(SELECT 1 FROM room_guests g WHERE g.session_id=s.id AND g.user_id=? AND g.expires_at>? AND (g.invite_id IS NULL OR EXISTS(SELECT 1 FROM room_invites i WHERE i.id=g.invite_id AND i.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM room_invite_recipients r WHERE r.invite_id=i.id AND r.state!='accepted')))))`,
    )
    .bind(
      userId,
      userId,
      userId,
      sessionId,
      userId,
      userId,
      userId,
      new Date().toISOString(),
    )
    .first<RoomAccess>();
}
