// Real-model smoke evaluation using synthetic material only; never workspace content.
import { strict as assert } from "node:assert";
import {
  aiConfiguration,
  generateDraft,
} from "../apps/api/src/modules/ai/provider";
const config = aiConfiguration({
  AI_ENABLED: "true",
  AI_ENDPOINT: process.env.AI_ENDPOINT || "http://127.0.0.1:11434",
  AI_MODEL: process.env.AI_MODEL || "llama3:latest",
});
const started = Date.now();
const draft = await generateDraft(
  config,
  JSON.stringify({
    roomTitle: "Synthetic planning review",
    notes:
      "The team discussed a blue navigation bar and a simple search field. No design was approved. The proposed next step is to create two layout alternatives for review. No owner or deadline was assigned.",
    recentDiscussion:
      "Compare the two layout alternatives before choosing. We still need to decide whether search belongs in the header or the sidebar.",
    designLabels: "Navigation, search, layout alternatives",
  }),
);
console.log(JSON.stringify({ syntheticDraft: draft }, null, 2));
assert(draft.summary.length > 0, "A recap should be returned");
assert(draft.actions.length > 0, "The proposed next step should be identified");
assert(
  draft.questions.length > 0,
  "The unresolved placement question should be identified",
);
assert(
  /no[^.]*approv|not[^.]*approv|unapproved|pending[^.]*review/i.test(
    draft.summary,
  ),
  "The recap should preserve the unapproved status",
);
console.log(
  JSON.stringify(
    {
      model: config.model,
      elapsedMs: Date.now() - started,
      actions: draft.actions.length,
      questions: draft.questions.length,
      structuredResponse: true,
      syntheticOnly: true,
    },
    null,
    2,
  ),
);
