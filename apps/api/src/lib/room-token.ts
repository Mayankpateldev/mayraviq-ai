// LiveKit JWT grants use standard HS256, signed through the platform Web Crypto API.
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const encode = (value: unknown) =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));
export async function roomToken(
  keyId: string,
  secret: string,
  room: string,
  identity: string,
  name: string,
  now = Math.floor(Date.now() / 1000),
  expiresAt = now + 300,
) {
  if (!Number.isFinite(expiresAt) || expiresAt <= now)
    throw Error("Room grant has expired");
  const payload = {
    iss: keyId,
    sub: identity,
    name,
    nbf: now - 5,
    exp: Math.min(now + 300, expiresAt),
    video: {
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const value = encode({ alg: "HS256", typ: "JWT" }) + "." + encode(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return (
    value +
    "." +
    base64url(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
      ),
    )
  );
}
export async function hashInvite(code: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function mediaConfigured(env: {
  ALLOW_LOCAL_MEDIA?: boolean;
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}) {
  if (
    !env.LIVEKIT_API_KEY ||
    !env.LIVEKIT_API_SECRET ||
    env.LIVEKIT_API_SECRET.length < 16
  )
    return false;
  try {
    const url = new URL(env.LIVEKIT_URL || "");
    return (
      (url.protocol === "wss:" ||
        (env.ALLOW_LOCAL_MEDIA === true &&
          url.protocol === "ws:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search
    );
  } catch {
    return false;
  }
}
