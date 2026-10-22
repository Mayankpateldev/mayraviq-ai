import assert from "node:assert/strict";
import {
  readMutation,
  apiReply,
  MAX_JSON_BYTES,
} from "../../apps/api/src/lib/api-boundary.ts";
const url = "https://mayraviq.test/api/workspace";
const request = (body, headers = {}) =>
  new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://mayraviq.test",
      ...headers,
    },
    body,
  });
assert.deepEqual(await readMutation(request('{"name":"hello"}')), {
  name: "hello",
});
for (const [body, headers, status] of [
  ["{}", { Origin: "https://evil.test" }, 403],
  ["{}", { Origin: "null" }, 403],

  ["{}", { "Content-Type": "text/plain" }, 415],
  ["{}", { "Content-Length": String(MAX_JSON_BYTES + 1) }, 413],
  [" ", {}, 400],
  ['{"x":', {}, 400],
  ['"' + "é".repeat(MAX_JSON_BYTES / 2) + '"', {}, 413],
])
  await assert.rejects(
    readMutation(request(body, headers)),
    (e) => e.status === status,
  );
const stream = new ReadableStream({
  start(c) {
    c.enqueue(new Uint8Array(MAX_JSON_BYTES));
    c.enqueue(new Uint8Array(1));
    c.close();
  },
});
await assert.rejects(
  readMutation(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    }),
  ),
  (e) => e.status === 413,
);
const response = apiReply({ ok: true });
assert.equal(response.headers.get("cache-control"), "no-store");
assert.equal(response.headers.get("x-content-type-options"), "nosniff");
console.log(
  "11 API boundary checks passed: origin, content type, byte limits, chunked payloads and cache protection.",
);
