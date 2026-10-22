import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import {
  verifyIdentity,
  claimsToUser,
} from "../../apps/api/src/platform/auth.ts";
import { configuration } from "../../apps/api/src/platform/config.ts";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const issue = (values = {}) =>
  new SignJWT({ name: "Peer", groups: ["team"], ...values })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("peer")
    .setIssuer("https://id.example")
    .setAudience("api")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
const verify = (token) =>
  verifyIdentity(
    token,
    async () => publicKey,
    "https://id.example",
    "api",
    "team",
  );
test("Identity requires valid signature, issuer, audience and group", async () => {
  const token = await issue();
  assert.equal((await verify(token)).userId, "peer");
  assert.equal(await verify(token.slice(0, -5) + "wrong"), null);
  assert.equal(
    await verifyIdentity(
      token,
      async () => publicKey,
      "https://wrong.example",
      "api",
    ),
    null,
  );
  assert.equal(
    await verifyIdentity(
      token,
      async () => publicKey,
      "https://id.example",
      "wrong",
    ),
    null,
  );
  assert.equal(await verify(await issue({ groups: ["outsider"] })), null);
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("peer")
    .setIssuer("https://id.example")
    .setAudience("api")
    .setIssuedAt()
    .setExpirationTime(1)
    .sign(privateKey);
  assert.equal(await verify(expired), null);
  assert.equal(claimsToUser({ sub: "" }), null);
});
test("Production rejects development identity, HTTP and incomplete identity settings", () => {
  assert.throws(() =>
    configuration({
      NODE_ENV: "production",
      DEV_AUTH: "true",
      APP_ORIGIN: "https://app.example",
      DATABASE_URL: "postgres://example",
    }),
  );
  assert.throws(() =>
    configuration({
      DEV_AUTH: "true",
      API_HOST: "0.0.0.0",
      DATABASE_URL: "postgres://example",
    }),
  );
  assert.throws(() =>
    configuration({
      NODE_ENV: "production",
      APP_ORIGIN: "http://app.example",
      DATABASE_URL: "postgres://example",
    }),
  );
  assert.throws(() =>
    configuration({
      NODE_ENV: "production",
      APP_ORIGIN: "https://app.example",
      DATABASE_URL: "postgres://example",
    }),
  );
});
