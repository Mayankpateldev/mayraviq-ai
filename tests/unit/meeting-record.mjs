import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedMeetingRecord } from "../../apps/web/src/app/components/saved-meeting-record.tsx";
const meeting = {
  enabled: true,
  aiEnabled: true,
  member: true,
  count: 2,
  clips: [
    {
      id: "one",
      speaker: "Peer",
      body: "Review <script>layout</script>",
      captured_at: "2026-10-20T10:00:00Z",
    },
  ],
  recap: {
    source_count: 1,
    generated_at: "2026-10-20T10:01:00Z",
    draft: {
      summary: "Review the layout; no approval yet.",
      actions: [{ title: "Review layout", rationale: "Suggested by the team" }],
      questions: ["Which layout?"],
      designIdeas: ["A larger header"],
    },
  },
};
test("Saved notes surface recap, draft actions, evidence and freshness without executing suggestions", () => {
  const markup = renderToStaticMarkup(
    createElement(SavedMeetingRecord, {
      meeting,
      readOnly: false,
      onAction: async () => {
        throw Error("Must require a click");
      },
    }),
  );
  for (const text of [
    "Review the layout; no approval yet.",
    "Review layout",
    "Which layout?",
    "A larger header",
    "Add to Actions",
    "background service",
    "latest 1 clips",
    "AI draft",
  ])
    assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes("<script>"));
  assert.ok(markup.includes("&lt;script&gt;"));
  const archived = renderToStaticMarkup(
    createElement(SavedMeetingRecord, {
      meeting,
      readOnly: true,
      onAction: async () => false,
    }),
  );
  assert.match(archived, /disabled=""[^>]*>.*?Add to Actions/s);
});
