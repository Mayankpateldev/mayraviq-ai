import {
  GET as invitationsGet,
  POST as invitationsPost,
} from "./modules/invitations/routes";
import {
  GET as meetingGet,
  POST as meetingPost,
} from "./modules/meeting/routes";
import { GET as aiGet, POST as aiPost } from "./modules/ai/routes";
import {
  GET as workspaceGet,
  POST as workspacePost,
} from "./modules/workspace/routes";
import {
  GET as discussionsGet,
  POST as discussionsPost,
} from "./modules/discussions/routes";
import { GET as roomsGet, POST as roomsPost } from "./modules/rooms/routes";
import { apiReply } from "./lib/api-boundary";
import { env } from "./platform/runtime";
import { getAuthenticatedUser } from "./platform/auth";
const routes = new Map([
  ["/api/invitations", { GET: invitationsGet, POST: invitationsPost }],
  ["/api/meeting", { GET: meetingGet, POST: meetingPost }],
  ["/api/ai", { GET: aiGet, POST: aiPost }],
  ["/api/workspace", { GET: workspaceGet, POST: workspacePost }],
  ["/api/discussions", { GET: discussionsGet, POST: discussionsPost }],
  ["/api/rooms", { GET: roomsGet, POST: roomsPost }],
]);
export async function application(request: Request) {
  const path = new URL(request.url).pathname;
  if (path === "/health/live" && request.method === "GET")
    return apiReply({ status: "ok" });
  if (path === "/health/ready" && request.method === "GET") {
    try {
      const applied = await env
        .DB!.prepare(
          "SELECT name FROM schema_migrations WHERE name IN ('001_initial.sql','002_indexes.sql','003_integrity.sql','004_guest_invite_scope.sql','005_meeting_notes.sql','006_targeted_invitations.sql','007_meeting_recap_jobs.sql')",
        )
        .all();
      if (applied.results.length !== 7) throw Error("Schema not ready");
      return apiReply({ status: "ready" });
    } catch {
      return apiReply({ status: "unavailable" }, 503);
    }
  }
  if (path === "/api/me" && request.method === "GET") {
    const user = await getAuthenticatedUser(request);
    return user
      ? apiReply(user)
      : apiReply({ error: "Authentication required." }, 401);
  }
  const route = routes.get(path);
  if (!route) return apiReply({ error: "Not found." }, 404);
  if (request.method !== "GET" && request.method !== "POST")
    return apiReply({ error: "Method not allowed." }, 405);
  return route[request.method](request);
}
