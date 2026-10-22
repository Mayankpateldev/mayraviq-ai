import test from "node:test";
import assert from "node:assert/strict";
import {
  aiConfiguration,
  generateDraft,
} from "../../apps/api/src/modules/ai/provider.ts";
const config = {
  enabled: true,
  endpoint: "http://ollama:11434",
  model: "test-model",
};
const valid = {
  summary: "A proposed design needs review.",
  actions: [
    { title: "Review the design", rationale: "Discussion requested review." },
  ],
  designIdeas: ["Explore a clearer layout."],
  questions: ["Who will review?"],
};
test("AI configuration is explicit and endpoint comes from server settings", () => {
  assert.equal(aiConfiguration({}).enabled, false);
  assert.throws(() => aiConfiguration({ AI_ENABLED: "true" }));
  assert.throws(() =>
    aiConfiguration({
      AI_ENABLED: "true",
      AI_MODEL: "model",
      AI_ENDPOINT: "http://external.example",
    }),
  );
  assert.throws(() =>
    aiConfiguration({
      AI_ENABLED: "true",
      AI_MODEL: "model",
      AI_ENDPOINT: "https://user:secret@external.example",
    }),
  );
  assert.equal(
    aiConfiguration({
      AI_ENABLED: "true",
      AI_MODEL: "model",
      AI_ENDPOINT: "http://ollama:11434",
    }).enabled,
    true,
  );
});
test("AI sends bounded structured output instructions with no tools", async () => {
  const result = await generateDraft(
    config,
    "Saved room context",
    async (url, options) => {
      assert.equal(url, "http://ollama:11434/api/chat");
      assert.equal(options.redirect, "error");
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false);
      assert.equal(body.model, "test-model");
      assert.equal(body.options.num_predict, 2048);
      assert.equal(body.tools, undefined);
      assert.equal(body.messages[1].content, "Saved room context");
      assert.ok(body.messages[0].content.includes("untrusted"));
      return Response.json({ message: { content: JSON.stringify(valid) } });
    },
  );
  assert.deepEqual(result, valid);
});
test("AI rejects invalid, oversized and failed model responses", async () => {
  for (const response of [
    Response.json({ message: { content: '{"summary":"fake"}' } }),
    new Response("no", { status: 500 }),
    new Response("x".repeat(65537)),
  ])
    await assert.rejects(
      generateDraft(config, "context", async () => response),
      (e) => e.status === 503,
    );
  await assert.rejects(
    generateDraft({ ...config, enabled: false }, "context"),
    (e) => e.status === 503,
  );
});
