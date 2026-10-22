import { processMeetingRecap } from "../../apps/api/src/modules/meeting/worker.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { generateKeyPair, SignJWT } from "jose";
import { Database, postgresSql } from "../../apps/api/src/platform/database.ts";
import { migrate } from "../../apps/api/src/platform/migrations.ts";
import { configureRuntime, env } from "../../apps/api/src/platform/runtime.ts";
import { configureAuth } from "../../apps/api/src/platform/auth.ts";
import { configuration } from "../../apps/api/src/platform/config.ts";
import { application } from "../../apps/api/src/application.ts";
import { enforceRateLimit } from "../../apps/api/src/lib/rate-limit.ts";
const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null;
const pg = pool ? await pool.connect() : new PGlite();
if (!pool) await pg.waitReady;
await migrate(pg, resolve("apps/api/migrations"));
const db = new Database(pool || pg, pool ? () => pool.connect() : undefined);
configureRuntime(db);
const { privateKey, publicKey } = await generateKeyPair("RS256");
configureAuth(
  configuration({
    DATABASE_URL: "testing",
    APP_ORIGIN: "https://app.example",
    OIDC_ISSUER: "https://id.example",
    OIDC_JWKS_URL: "https://id.example/keys",
    OIDC_AUDIENCE: "api",
    OIDC_REQUIRED_GROUP: "team",
  }),
  async () => publicKey,
);
const tokens = {};
for (const sub of ["owner", "peer", "outsider", "unverified"])
  tokens[sub] = await new SignJWT({
    name: sub,
    email: sub + "@example.test",
    email_verified: sub !== "unverified",
    groups: ["team"],
  })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(sub)
    .setIssuer("https://id.example")
    .setAudience("api")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
async function req(path, body, user = "owner", status = 200, extra = {}) {
  const response = await application(
    new Request("https://app.example" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://app.example",
        ...(user ? { Authorization: "Bearer " + tokens[user] } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
  const value = await response.json();
  assert.equal(response.status, status, JSON.stringify(value));
  return value;
}
let workspace, project, session, conversation;
test("PostgreSQL migrations are repeatable and enforce foreign keys", async () => {
  await migrate(pg, resolve("apps/api/migrations"));
  assert.equal(
    (await pg.query("SELECT * FROM schema_migrations")).rows.length,
    7,
  );
  await req("/health/live", null, null);
  await req("/health/ready", null, null);
  await assert.rejects(
    db
      .prepare("INSERT INTO canvases(project_id) VALUES(?)")
      .bind(randomUUID())
      .run(),
  );
  assert.equal(
    postgresSql("SELECT '?' AS literal,? AS parameter"),
    "SELECT '?' AS literal,$1 AS parameter",
  );
});
test("Verified identity, workspace setup and project isolation", async () => {
  await req("/api/workspace", null, null, 401, {
    "oai-authenticated-user-id": "owner",
    "oai-authenticated-user-email": "owner@example.test",
  });
  await req(
    "/api/workspace",
    {
      action: "setup",
      name: "Internal team",
      transcription: false,
      sample: false,
    },
    "owner",
    201,
  );
  workspace = (await req("/api/workspace")).workspace.id;
  await req("/api/workspace", {
    action: "project",
    title: "Design",
    description: "",
    color: "blue",
  });
  const data = await req("/api/workspace");
  project = data.projects[0].id;
  const outside = await req("/api/workspace", null, "outsider", 200, {
    "x-workspace-id": workspace,
  });
  assert.equal(outside.workspace, null);
  assert.equal(outside.projects.length, 0);
  await req(
    "/api/workspace",
    { action: "project", title: "Denied", description: "", color: "blue" },
    "outsider",
    409,
    { "x-workspace-id": workspace },
  );
});
test("Sessions, room-only guest invites, notes, designs and stale updates", async () => {
  await req("/api/workspace", {
    action: "session",
    projectId: project,
    title: "Live design",
    scheduledAt: new Date().toISOString(),
  });
  session = (await req("/api/workspace")).sessions[0].id;
  await req("/api/rooms?sessionId=" + session, null, "peer", 403);
  const invitation = await req("/api/rooms", {
    action: "invite",
    sessionId: session,
  });
  await req(
    "/api/rooms",
    { action: "redeem", sessionId: session, code: invitation.code },
    "peer",
  );
  const room = await req("/api/rooms?sessionId=" + session, null, "peer");
  assert.equal(room.role, "guest");
  assert.equal(room.canInvite, false);
  await req(
    "/api/rooms",
    { action: "invite", sessionId: session },
    "peer",
    403,
  );
  await req("/api/rooms", { action: "token", sessionId: session }, "peer", 503);
  await req(
    "/api/rooms",
    { action: "notes", sessionId: session, version: 0, notes: "Design notes" },
    "peer",
  );
  await req(
    "/api/rooms",
    { action: "notes", sessionId: session, version: 0, notes: "Stale" },
    "owner",
    409,
  );
  const node = {
    id: randomUUID(),
    kind: "rectangle",
    text: "Interface",
    x: 50,
    y: 40,
    width: 200,
    height: 120,
    color: "blue",
    fill: "#ffffff",
  };
  await req(
    "/api/rooms",
    {
      action: "canvas",
      sessionId: session,
      version: 0,
      nodes: [node],
      edges: [],
    },
    "peer",
  );
  await req(
    "/api/rooms",
    { action: "canvas", sessionId: session, version: 0, nodes: [], edges: [] },
    "owner",
    409,
  );
  const saved = await req("/api/rooms?sessionId=" + session);
  assert.equal(JSON.parse(saved.canvas.nodes)[0].text, "Interface");
  assert.equal(
    (await req("/api/workspace")).canvases.find((c) => c.project_id === project)
      .nodes,
    "[]",
  );
  await req(
    "/api/rooms",
    {
      action: "propose",
      sessionId: session,
      title: "Review design",
      owner: "owner",
    },
    "peer",
  );
  const actions = (await req("/api/rooms?sessionId=" + session)).actions;
  assert.equal(actions[0].status, "draft");
  await req("/api/rooms", {
    action: "revoke",
    sessionId: session,
    inviteId: invitation.inviteId,
  });
  await req(
    "/api/rooms",
    { action: "redeem", sessionId: session, code: invitation.code },
    "outsider",
    403,
  );
  await req("/api/rooms?sessionId=" + session, null, "peer", 403);
  await req("/api/rooms", { action: "token", sessionId: session }, "peer", 403);
  await req(
    "/api/rooms",
    {
      action: "notes",
      sessionId: session,
      version: 1,
      notes: "Denied after revoke",
    },
    "peer",
    403,
  );
  await req("/api/workspace", null, "peer", 200, {
    "x-workspace-id": workspace,
  }).then((data) => assert.equal(data.workspace, null));
});
test("Discussion privacy, deleted content, message deduplication and request boundaries", async () => {
  // Workspace membership is explicitly provisioned; a room guest remains separate.
  await db
    .prepare("INSERT INTO workspace_members VALUES(?,?,?,?,?)")
    .bind(
      workspace,
      "peer",
      "Peer",
      "peer@example.test",
      new Date().toISOString(),
    )
    .run();
  const result = await req(
    "/api/discussions",
    {
      action: "create",
      kind: "private",
      name: "Leadership",
      description: "",
      members: [],
    },
    "owner",
    201,
  );
  conversation = result.id;
  assert.ok(
    !(await req("/api/discussions", null, "peer")).conversations.some(
      (c) => c.id === conversation,
    ),
  );
  const publicChannel = await req(
    "/api/discussions",
    {
      action: "create",
      kind: "public",
      name: "General",
      description: "",
      members: [],
    },
    "owner",
    201,
  );
  const nonce = randomUUID();
  await req(
    "/api/discussions",
    {
      action: "message",
      conversationId: publicChannel.id,
      body: "Discuss this",
      nonce,
    },
    "owner",
    201,
  );
  await req(
    "/api/discussions",
    {
      action: "message",
      conversationId: publicChannel.id,
      body: "Discuss this",
      nonce,
    },
    "owner",
    201,
  );
  const messages = (await req("/api/discussions")).messages.filter(
    (m) => m.id === nonce,
  );
  assert.equal(messages.length, 1);
  await req("/api/discussions", { action: "deleteMessage", id: nonce });
  assert.equal(
    (await req("/api/discussions", null, "peer")).messages.find(
      (m) => m.id === nonce,
    ).body,
    "",
  );
  await req(
    "/api/rooms",
    { action: "notes", sessionId: session, version: 1, notes: "blocked" },
    "owner",
    403,
    { Origin: "https://evil.example" },
  );
  await req(
    "/api/rooms",
    { action: "notes", sessionId: session, version: 1, notes: "blocked" },
    "owner",
    415,
    { "Content-Type": "text/plain" },
  );
});
test("PostgreSQL rate limits, transaction rollback and optimistic audit consistency", async () => {
  await enforceRateLimit(db, "rate-test", "write", 2, 120000);
  await enforceRateLimit(db, "rate-test", "write", 2, 120000);
  await assert.rejects(
    enforceRateLimit(db, "rate-test", "write", 2, 120000),
    (e) => e.status === 429,
  );
  await enforceRateLimit(db, "rate-test", "write", 2, 180000);
  const id = randomUUID();
  await assert.rejects(
    db.batch([
      db
        .prepare(
          "INSERT INTO workspaces(id,owner_id,name,created_at) VALUES(?,?,?,?)",
        )
        .bind(id, id, "Rollback", new Date().toISOString()),
      db.prepare("INSERT INTO canvases(project_id) VALUES(?)").bind("missing"),
    ]),
  );
  assert.equal(
    await db.prepare("SELECT id FROM workspaces WHERE id=?").bind(id).first(),
    null,
  );
  const before = (await req("/api/workspace")).audit.length;
  await req(
    "/api/workspace",
    {
      action: "sessionUpdate",
      id: session,
      version: 0,
      status: "scheduled",
      notes: "stale",
      summary: "",
    },
    "owner",
    409,
  );
  assert.equal((await req("/api/workspace")).audit.length, before);
});
test("AI checks room access, explicit processing and draft-only output", async () => {
  const previous = {
    enabled: process.env.AI_ENABLED,
    model: process.env.AI_MODEL,
    endpoint: process.env.AI_ENDPOINT,
  };
  const originalFetch = globalThis.fetch;
  try {
    process.env.AI_ENABLED = "false";
    await req("/api/ai", { sessionId: session, acknowledged: true }, null, 401);
    await req(
      "/api/ai",
      { sessionId: session, acknowledged: true },
      "owner",
      503,
    );
    await req(
      "/api/ai",
      { sessionId: session, acknowledged: false },
      "owner",
      400,
    );
    const invite = await req("/api/rooms", {
      action: "invite",
      sessionId: session,
    });
    await req(
      "/api/rooms",
      { action: "redeem", sessionId: session, code: invite.code },
      "outsider",
    );
    await req(
      "/api/ai",
      { sessionId: session, acknowledged: true },
      "outsider",
      403,
    );
    assert.equal(
      (await req("/api/ai?sessionId=" + session, null, "outsider")).permitted,
      false,
    );
    const before = (await req("/api/workspace")).decisions.length;
    process.env.AI_ENABLED = "true";
    process.env.AI_MODEL = "test-model";
    process.env.AI_ENDPOINT = "http://ollama:11434";
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, "http://ollama:11434/api/chat");
      const body = JSON.parse(options.body),
        content = JSON.parse(body.messages[1].content);
      assert.equal(content.roomTitle, "Live design");
      assert.equal(content.notes, "Design notes");
      assert.ok(content.designLabels.includes("Interface"));
      assert.equal(content.accessToken, undefined);
      return Response.json({
        message: {
          content: JSON.stringify({
            summary: "Review the shared interface.",
            actions: [
              { title: "Review layout", rationale: "Design discussion" },
            ],
            designIdeas: [],
            questions: [],
          }),
        },
      });
    };
    const result = await req("/api/ai", {
      sessionId: session,
      acknowledged: true,
    });
    assert.equal(result.draft.actions[0].title, "Review layout");
    assert.equal(calls, 1);
    assert.equal(result.sources.notesVersion, result.sourceVersion);
    assert.equal(result.sources.canvasVersion, 1);
    assert.equal(result.notesChangedDuringGeneration, false);
    assert.equal((await req("/api/workspace")).decisions.length, before);
    const firstTransport = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const response = await firstTransport(url, options);
      await db
        .prepare("UPDATE sessions SET notes=?,version=version+1 WHERE id=?")
        .bind("Changed during generation", session)
        .run();
      return response;
    };
    const stale = await req("/api/ai", {
      sessionId: session,
      acknowledged: true,
    });
    assert.equal(stale.notesChangedDuringGeneration, true);
    assert.equal((await req("/api/workspace")).decisions.length, before);
    await req(
      "/api/ai",
      {
        sessionId: session,
        acknowledged: true,
        endpoint: "https://evil.example",
      },
      "owner",
      400,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ["AI_ENABLED", previous.enabled],
      ["AI_MODEL", previous.model],
      ["AI_ENDPOINT", previous.endpoint],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test(
  "Concurrent updates commit one version and one audit entry",
  { skip: !pool },
  async () => {
    const data = await req("/api/workspace"),
      version = data.sessions.find((s) => s.id === session).version;
    const before = data.audit.length;
    const responses = await Promise.all(
      ["First", "Second"].map((notes) =>
        application(
          new Request("https://app.example/api/workspace", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + tokens.owner,
              Origin: "https://app.example",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "sessionUpdate",
              id: session,
              version,
              status: "scheduled",
              notes,
              summary: "",
            }),
          }),
        ),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const after = await req("/api/workspace");
    assert.equal(after.audit.length, before + 1);
    assert.equal(
      after.sessions.find((s) => s.id === session).version,
      version + 1,
    );
  },
);
test("Canvas saves reconcile independent edits and reject conflicting fields without audit writes", async () => {
  await req("/api/workspace", {
    action: "project",
    title: "Coediting test",
    description: "",
    color: "blue",
  });
  const state = await req("/api/workspace");
  const p = state.projects.find((p) => p.title === "Coediting test");
  const c = state.canvases.find((c) => c.project_id === p.id);
  const nodes = [
    { id: "merge-a", text: "A", x: 10, y: 10, color: "blue" },
    { id: "merge-b", text: "B", x: 300, y: 10, color: "teal" },
  ];
  await req("/api/workspace", {
    action: "canvas",
    projectId: p.id,
    version: c.version,
    nodes,
    edges: [],
  });
  const version = c.version + 1,
    base = { nodes, edges: [] };
  await req("/api/workspace", {
    action: "canvas",
    projectId: p.id,
    version,
    base,
    nodes: [{ ...nodes[0], text: "First editor" }, nodes[1]],
    edges: [],
  });
  await req("/api/workspace", {
    action: "canvas",
    projectId: p.id,
    version,
    base,
    nodes: [nodes[0], { ...nodes[1], x: 350 }],
    edges: [],
  });
  let after = await req("/api/workspace");
  const saved = JSON.parse(
    after.canvases.find((c) => c.project_id === p.id).nodes,
  );
  assert.equal(saved[0].text, "First editor");
  assert.equal(saved[1].x, 350);
  const audits = after.audit.length;
  await req(
    "/api/workspace",
    {
      action: "canvas",
      projectId: p.id,
      version,
      base,
      nodes: [{ ...nodes[0], text: "Conflicting editor" }, nodes[1]],
      edges: [],
    },
    "owner",
    409,
  );
  after = await req("/api/workspace");
  assert.equal(after.audit.length, audits);
  await req(
    "/api/workspace",
    { action: "canvas", projectId: p.id, version, base, nodes, edges: [] },
    "outsider",
    409,
  );
  const room = await req("/api/rooms?sessionId=" + session);
  const roomBase = {
    nodes: JSON.parse(room.canvas.nodes),
    edges: JSON.parse(room.canvas.edges),
  };
  const one = { id: "peer-one", text: "One", x: 10, y: 500, color: "blue" },
    two = { id: "peer-two", text: "Two", x: 300, y: 500, color: "teal" };
  await req("/api/rooms", {
    action: "canvas",
    sessionId: session,
    version: room.canvas.version,
    base: roomBase,
    nodes: [...roomBase.nodes, one],
    edges: roomBase.edges,
  });
  await req(
    "/api/rooms",
    {
      action: "canvas",
      sessionId: session,
      version: room.canvas.version,
      base: roomBase,
      nodes: [...roomBase.nodes, two],
      edges: roomBase.edges,
    },
    "peer",
  );
  const merged = JSON.parse(
    (await req("/api/rooms?sessionId=" + session)).canvas.nodes,
  );
  assert(merged.some((n) => n.id === one.id));
  assert(merged.some((n) => n.id === two.id));
});
test("Call grants bind each client to its verified caller and selected room", async () => {
  const previous = {
    url: env.LIVEKIT_URL,
    key: env.LIVEKIT_API_KEY,
    secret: env.LIVEKIT_API_SECRET,
  };
  try {
    env.LIVEKIT_URL = "wss://media.example";
    env.LIVEKIT_API_KEY = "qa";
    env.LIVEKIT_API_SECRET = "synthetic-not-a-real-secret-0123456789";
    const clientId = randomUUID();
    const first = await req("/api/rooms", {
      action: "token",
      sessionId: session,
      clientId,
    });
    const second = await req(
      "/api/rooms",
      { action: "token", sessionId: session, clientId },
      "peer",
    );
    const decode = (token) =>
      JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
    assert.equal(decode(first.token).sub, "owner:" + clientId);
    assert.equal(decode(second.token).sub, "peer:" + clientId);
    assert.equal(decode(first.token).video.room, "mayraviq-" + session);
    await req(
      "/api/rooms",
      { action: "token", sessionId: session, clientId: "owner" },
      "owner",
      400,
    );
    await req(
      "/api/rooms",
      { action: "token", sessionId: randomUUID(), clientId },
      "owner",
      403,
    );
    await req(
      "/api/rooms",
      { action: "token", sessionId: session, clientId },
      null,
      401,
    );
  } finally {
    env.LIVEKIT_URL = previous.url;
    env.LIVEKIT_API_KEY = previous.key;
    env.LIVEKIT_API_SECRET = previous.secret;
  }
});

test("Automatic meeting notes require consent and scope, deduplicate clips and preserve manual notes", async () => {
  const previous = {
    SPEECH_ENABLED: process.env.SPEECH_ENABLED,
    SPEECH_TOKEN: process.env.SPEECH_TOKEN,
    AI_ENABLED: process.env.AI_ENABLED,
    AI_MODEL: process.env.AI_MODEL,
    AI_ENDPOINT: process.env.AI_ENDPOINT,
  };
  const originalFetch = globalThis.fetch;
  const clip = {
    action: "clip",
    sessionId: session,
    id: randomUUID(),
    capturedAt: new Date().toISOString(),
    acknowledged: true,
    audio: Buffer.from("synthetic audio").toString("base64"),
  };
  try {
    process.env.SPEECH_ENABLED = "true";
    process.env.SPEECH_TOKEN = "synthetic-token";
    process.env.AI_ENABLED = "true";
    process.env.AI_MODEL = "test-model";
    process.env.AI_ENDPOINT = "http://ollama:11434";
    await req("/api/meeting", clip, null, 401);
    await req("/api/meeting", { ...clip, acknowledged: false }, "owner", 400);
    await req("/api/meeting", clip, "owner", 403);
    await db
      .prepare("UPDATE workspaces SET transcription=1 WHERE id=?")
      .bind(workspace)
      .run();
    await req(
      "/api/meeting",
      { ...clip, sessionId: randomUUID() },
      "owner",
      403,
    );
    let speech = 0,
      models = 0;
    globalThis.fetch = async (url, opts) => {
      if (url === "http://127.0.0.1:8091/transcribe") {
        speech++;
        assert.equal(opts.headers.Authorization, "Bearer synthetic-token");
        return Response.json({
          text: "We proposed reviewing two layouts. No design is approved.",
        });
      }
      models++;
      const body = JSON.parse(opts.body);
      assert.ok(body.messages[1].content.includes("owner:"));
      return Response.json({
        message: {
          content: JSON.stringify({
            summary: "Two layouts were proposed for review; no approval.",
            actions: [
              { title: "Review two layouts", rationale: "Proposed in speech" },
            ],
            designIdeas: [],
            questions: [],
          }),
        },
      });
    };
    const before = await req("/api/rooms?sessionId=" + session);
    await req("/api/meeting", clip);
    await req("/api/meeting", clip);
    assert.equal(speech, 1);
    await req("/api/meeting", { ...clip, speaker: "forged" }, "owner", 400);
    await req(
      "/api/meeting",
      { ...clip, audio: "bad", id: randomUUID() },
      "owner",
      400,
    );
    const saved = await req("/api/meeting?sessionId=" + session);
    assert.equal(saved.count, 1);
    assert.equal(saved.clips[0].speaker, "owner");
    await req(
      "/api/meeting",
      { action: "recap", sessionId: session },
      "outsider",
      403,
    );
    await req("/api/meeting", { action: "recap", sessionId: session });
    assert.equal(models, 1);
    await req("/api/meeting", { action: "recap", sessionId: session });
    assert.equal(models, 1);
    const recap = await req("/api/meeting?sessionId=" + session);
    assert.equal(recap.recap.source_count, 1);
    assert.equal(recap.recap.draft.actions[0].title, "Review two layouts");
    const after = await req("/api/rooms?sessionId=" + session);
    assert.equal(after.session.notes, before.session.notes);
    assert.equal(after.session.version, before.session.version);
    // Durable work completes without an open browser, retries failures, and finalizes ended rooms.
    await processMeetingRecap();
    assert.equal(models, 1);
    assert.equal(
      await db
        .prepare("SELECT session_id FROM meeting_recap_jobs WHERE session_id=?")
        .bind(session)
        .first(),
      null,
    );
    await db
      .prepare("INSERT INTO meeting_transcripts VALUES(?,?,?,?,?,?,?)")
      .bind(
        randomUUID(),
        session,
        "owner",
        "owner",
        "Review another layout.",
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
    const modelTransport = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json({ error: "offline" }, { status: 503 });
    await processMeetingRecap();
    const failed = await db
      .prepare(
        "SELECT attempts,lease_until,due_at FROM meeting_recap_jobs WHERE session_id=?",
      )
      .bind(session)
      .first();
    assert.equal(failed.attempts, 1);
    assert.equal(Number(failed.lease_until), 0);
    assert.ok(Number(failed.due_at) > Date.now());
    globalThis.fetch = modelTransport;
    await db
      .prepare("UPDATE meeting_recap_jobs SET due_at=0 WHERE session_id=?")
      .bind(session)
      .run();
    await db
      .prepare("UPDATE sessions SET status='ended' WHERE id=?")
      .bind(session)
      .run();
    await Promise.all([processMeetingRecap(), processMeetingRecap()]);
    assert.equal(
      models,
      2,
      "One worker claims the room even with overlapping ticks",
    );
    assert.equal(
      (await req("/api/meeting?sessionId=" + session)).recap.source_count,
      2,
    );
    assert.equal(
      await db
        .prepare("SELECT session_id FROM meeting_recap_jobs WHERE session_id=?")
        .bind(session)
        .first(),
      null,
    );
    assert.equal(
      (await req("/api/rooms?sessionId=" + session)).session.notes,
      before.session.notes,
    );
    await db
      .prepare("UPDATE sessions SET status='scheduled' WHERE id=?")
      .bind(session)
      .run();
    // Access disappearing during transcription cannot persist its result.
    globalThis.fetch = async () => {
      await db
        .prepare("UPDATE projects SET status='archived' WHERE id=?")
        .bind(project)
        .run();
      return Response.json({ text: "Discard this" });
    };
    await req("/api/meeting", { ...clip, id: randomUUID() }, "owner", 403);
    assert.equal(
      Number(
        (
          await db
            .prepare(
              "SELECT count(*) AS count FROM meeting_transcripts WHERE session_id=?",
            )
            .bind(session)
            .first()
        ).count,
      ),
      2,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await db
      .prepare("UPDATE projects SET status='active' WHERE id=?")
      .bind(project)
      .run();
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("Drawing points persist through the API and oversized sketches are rejected", async () => {
  const state = await req("/api/workspace");
  const canvas = state.canvases.find((c) => c.project_id === project);
  const nodes = [
    {
      id: randomUUID(),
      kind: "freehand",
      text: "",
      color: "blue",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      points: [
        [0, 0],
        [0.5, 1],
        [1, 0],
      ],
      stroke: "#334155",
      strokeWidth: 4,
    },
    {
      id: randomUUID(),
      kind: "arrow",
      text: "",
      color: "blue",
      x: 300,
      y: 200,
      width: 200,
      height: 100,
      points: [
        [1, 1],
        [0, 0],
      ],
    },
  ];
  await req("/api/workspace", {
    action: "canvas",
    projectId: project,
    version: canvas.version,
    nodes,
    edges: [],
  });
  const saved = (await req("/api/workspace")).canvases.find(
    (c) => c.project_id === project,
  );
  assert.deepEqual(JSON.parse(saved.nodes), nodes);
  await req(
    "/api/workspace",
    {
      action: "canvas",
      projectId: project,
      version: saved.version,
      nodes: [
        { ...nodes[0], points: Array.from({ length: 257 }, () => [0, 0]) },
      ],
      edges: [],
    },
    "owner",
    400,
  );
  assert.equal(
    (await req("/api/workspace")).canvases.find((c) => c.project_id === project)
      .version,
    saved.version,
  );
});

test("Person-specific meeting invitations restrict recipients and track email previews and responses", async () => {
  const previous = {
    MAIL_MODE: process.env.MAIL_MODE,
    MAIL_OUTBOX_KEY: process.env.MAIL_OUTBOX_KEY,
  };
  try {
    process.env.MAIL_MODE = "preview";
    process.env.MAIL_OUTBOX_KEY = Buffer.alloc(32, 7).toString("base64");
    const before = (await req("/api/workspace")).decisions.length;
    const member = await req(
      "/api/invitations",
      {
        action: "invite",
        sessionId: session,
        nonce: randomUUID(),
        recipient: { kind: "member", userId: "peer" },
        emailCopy: false,
      },
      "owner",
      201,
    );
    assert.equal(member.delivery, "in_app");
    const inbox = await req("/api/invitations", null, "peer");
    assert.ok(inbox.invitations.some((i) => i.id === member.inviteId));
    await req(
      "/api/invitations",
      { action: "respond", inviteId: member.inviteId, response: "accepted" },
      "owner",
      403,
    );
    await req(
      "/api/invitations",
      { action: "respond", inviteId: member.inviteId, response: "accepted" },
      "peer",
    );
    await req(
      "/api/invitations",
      {
        action: "invite",
        sessionId: session,
        nonce: randomUUID(),
        recipient: { kind: "member", userId: "not-in-team" },
        emailCopy: false,
      },
      "owner",
      403,
    );
    const nonce = randomUUID(),
      payload = {
        action: "invite",
        sessionId: session,
        nonce,
        recipient: { kind: "email", email: "outsider@example.test" },
        emailCopy: true,
      };
    const email = await req("/api/invitations", payload, "owner", 201);
    assert.equal(email.delivery, "preview");
    await req("/api/invitations", payload);
    assert.equal(
      Number(
        (
          await db
            .prepare("SELECT count(*) AS count FROM room_invites WHERE id=?")
            .bind(nonce)
            .first()
        ).count,
      ),
      1,
    );
    const mail = await req("/api/invitations?previewId=" + nonce);
    assert.ok(mail.raw.includes("text/calendar"));
    assert.ok(mail.text.includes("outsider@example.test"));
    await req("/api/invitations?previewId=" + nonce, null, "outsider", 403);
    const code = mail.text.match(/invite=([a-f0-9-]+)/)[1];
    await req(
      "/api/rooms",
      { action: "redeem", sessionId: session, code },
      "peer",
      403,
    );
    await req(
      "/api/rooms",
      { action: "redeem", sessionId: session, code },
      "outsider",
    );
    await req(
      "/api/invitations",
      { action: "respond", inviteId: nonce, response: "declined" },
      "outsider",
    );
    await req(
      "/api/rooms",
      { action: "redeem", sessionId: session, code },
      "outsider",
      403,
    );
    await req("/api/rooms?sessionId=" + session, null, "outsider", 403);
    const unverified = await req(
      "/api/invitations",
      {
        ...payload,
        nonce: randomUUID(),
        recipient: { kind: "email", email: "unverified@example.test" },
      },
      "owner",
      201,
    );
    assert.equal(
      (await req("/api/invitations", null, "unverified")).invitations.length,
      0,
    );
    await req(
      "/api/invitations",
      {
        action: "respond",
        inviteId: unverified.inviteId,
        response: "accepted",
      },
      "unverified",
      403,
    );
    await req("/api/rooms", {
      action: "revoke",
      sessionId: session,
      inviteId: nonce,
    });
    await req(
      "/api/invitations",
      { action: "respond", inviteId: nonce, response: "accepted" },
      "outsider",
      403,
    );
    const directory = await req("/api/invitations?sessionId=" + session);
    assert.ok(directory.members.some((m) => m.user_id === "peer"));
    assert.ok(
      directory.invitations.some((i) => i.id === nonce && i.revoked_at),
    );
    await req("/api/invitations?sessionId=" + session, null, "outsider", 403);
    assert.equal((await req("/api/workspace")).decisions.length, before);
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test.after(async () => {
  if (pool) {
    pg.release();
    await pool.end();
  } else await pg.close();
});
