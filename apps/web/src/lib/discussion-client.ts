import { apiFetch } from "../auth";
import type { DiscussionData } from "@mayraviq/contracts/types";
export function workspaceHeaders(): Record<string, string> {
  const id = localStorage.getItem("mayraviq-workspace");
  return id ? { "x-workspace-id": id } : {};
}
type Result = {
  ok: boolean;
  id: string;
  workspaceId: string;
  code: string;
  expiresAt: string;
};
export function discussionRequest(): Promise<DiscussionData>;
export function discussionRequest(
  payload: Record<string, unknown>,
): Promise<Result>;
export async function discussionRequest(
  payload?: Record<string, unknown>,
): Promise<DiscussionData | Result> {
  const r = await apiFetch("/api/discussions", {
    method: payload ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...workspaceHeaders() },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = (await r.json()) as (DiscussionData | Result) & {
    error?: string;
  };
  if (!r.ok) throw Error(data.error || "Could not load discussions.");
  return data;
}
