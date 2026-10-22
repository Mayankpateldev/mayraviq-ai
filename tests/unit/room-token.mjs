import assert from "node:assert/strict";
import {
  roomToken,
  hashInvite,
  mediaConfigured,
} from "../../apps/api/src/lib/room-token.ts";
const secret = "qa-secret-not-a-real-credential-123";
const token = await roomToken(
  "qa-key",
  secret,
  "mayraviq-room",
  "qa-person",
  "QA",
  1000,
);
const [head, body, signature] = token.split(".");
const payload = JSON.parse(Buffer.from(body, "base64url").toString());
assert.equal(JSON.parse(Buffer.from(head, "base64url")).alg, "HS256");
assert.equal(payload.exp - payload.nbf, 305);
assert.equal(payload.sub, "qa-person");
assert.deepEqual(payload.video, {
  roomJoin: true,
  room: "mayraviq-room",
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
});
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["verify"],
);
assert(
  await crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(head + "." + body),
  ),
);
assert(
  !(await crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(head + "." + body + "x"),
  )),
);
assert.equal((await hashInvite("qa-invite")).length, 64);
assert.equal(await hashInvite("qa-invite"), await hashInvite("qa-invite"));
for (const url of [
  "http://media.test",
  "ws://media.test",
  "wss://user:pass@media.test",
  "wss://media.test?secret=x",
])
  assert(
    !mediaConfigured({
      LIVEKIT_URL: url,
      LIVEKIT_API_KEY: "qa",
      LIVEKIT_API_SECRET: secret,
    }),
  );
assert(
  mediaConfigured({
    LIVEKIT_URL: "wss://media.test",
    LIVEKIT_API_KEY: "qa",
    LIVEKIT_API_SECRET: secret,
  }),
);
console.log(
  "13 media security checks passed: room-scoped grants, expiry, signature integrity, hashed invitations and secure service configuration.",
);

// Plain WebSocket is allowed only for explicit loopback development runtime.
for (const url of [
  "ws://127.0.0.1:7880",
  "ws://localhost:7880",
  "ws://[::1]:7880",
]) {
  const env = {
    LIVEKIT_URL: url,
    LIVEKIT_API_KEY: "qa",
    LIVEKIT_API_SECRET: secret,
  };
  assert.equal(mediaConfigured(env), false);
  assert.equal(mediaConfigured({ ...env, ALLOW_LOCAL_MEDIA: true }), true);
}
for (const url of [
  "ws://media.test",
  "ws://127.0.0.1.evil.test",
  "ws://user@localhost",
  "ws://localhost?secret=x",
])
  assert.equal(
    mediaConfigured({
      LIVEKIT_URL: url,
      LIVEKIT_API_KEY: "qa",
      LIVEKIT_API_SECRET: secret,
      ALLOW_LOCAL_MEDIA: true,
    }),
    false,
  );

const shortGrant = await roomToken(
  "qa-key",
  secret,
  "room",
  "guest",
  "Guest",
  1000,
  1030,
);
assert.equal(
  JSON.parse(Buffer.from(shortGrant.split(".")[1], "base64url")).exp,
  1030,
);
await assert.rejects(
  roomToken("qa-key", secret, "room", "guest", "Guest", 1000, 999),
);
