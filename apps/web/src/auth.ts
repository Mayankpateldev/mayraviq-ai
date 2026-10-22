import {
  UserManager,
  WebStorageStateStore,
  InMemoryWebStorage,
} from "oidc-client-ts";
type RuntimeConfig = {
  API_URL?: string;
  AUTH_MODE?: string;
  OIDC_AUTHORITY?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_SCOPE?: string;
};
declare global {
  interface Window {
    MAYRAVIQ_CONFIG?: RuntimeConfig;
  }
}
const runtime = window.MAYRAVIQ_CONFIG || {};
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
export const developmentIdentity =
  import.meta.env.DEV && local && import.meta.env.VITE_DEV_AUTH === "true";
const authority = runtime.OIDC_AUTHORITY || import.meta.env.VITE_OIDC_AUTHORITY;
const clientId = runtime.OIDC_CLIENT_ID || import.meta.env.VITE_OIDC_CLIENT_ID;
if (authority && new URL(authority).protocol !== "https:")
  throw Error("Identity provider must use HTTPS");
const manager =
  authority && clientId
    ? new UserManager({
        authority,
        client_id: clientId,
        redirect_uri: location.origin + "/auth/callback",
        post_logout_redirect_uri: location.origin + "/",
        response_type: "code",
        scope:
          runtime.OIDC_SCOPE ||
          import.meta.env.VITE_OIDC_SCOPE ||
          "openid profile email",
        userStore: new WebStorageStateStore({
          store: new InMemoryWebStorage(),
        }),
        stateStore: new WebStorageStateStore({ store: sessionStorage }),
        automaticSilentRenew: false,
      })
    : null;
export async function initializeIdentity() {
  if (developmentIdentity) return true;
  if (location.pathname === "/auth/callback" && manager) {
    const user = await manager.signinRedirectCallback();
    const state = user.state as { returnTo?: string } | undefined;
    const hash = state?.returnTo?.startsWith("#") ? state.returnTo : "#home";
    history.replaceState(null, "", "/" + hash);
    return !user.expired;
  }
  const user = await manager?.getUser();
  return !!user && !user.expired;
}
export async function signIn() {
  if (!manager)
    throw Error("Team sign-in needs an identity provider configuration.");
  await manager.signinRedirect({ state: { returnTo: location.hash } });
}
export async function signOut() {
  if (developmentIdentity) {
    location.hash = "home";
    return;
  }
  await manager?.signoutRedirect();
}
export async function apiFetch(path: string, options: RequestInit = {}) {
  const user = await manager?.getUser();
  const token = developmentIdentity
    ? "local-development"
    : user && !user.expired
      ? user.access_token
      : null;
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", "Bearer " + token);
  const apiUrl = runtime.API_URL || import.meta.env.VITE_API_URL || "";
  if (apiUrl && new URL(apiUrl).protocol !== "https:" && !import.meta.env.DEV)
    throw Error("API requires HTTPS");
  return fetch(apiUrl + path, { ...options, headers, credentials: "omit" });
}
