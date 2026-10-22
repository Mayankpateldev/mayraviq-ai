import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  callPage,
  callFocus,
  videoSelection,
  VIDEO_PAGE_SIZE,
  PEOPLE_PAGE_SIZE,
} from "../../apps/web/src/lib/call-layout.ts";
import CallView from "../../apps/web/src/app/components/call-view.tsx";
const people = Array.from({ length: 1000 }, (_, i) => ({
  identity: "person-" + i,
  name: `Participant ${String(i + 1).padStart(4, "0")}`,
  isLocal: i === 0,
  isScreenShareEnabled: i === 42,
  isMicrophoneEnabled: false,
  getTrackPublication: () => undefined,
}));
test("A thousand participants produce bounded video and roster pages with clamped navigation", () => {
  const first = callPage(people, "", 0, VIDEO_PAGE_SIZE),
    last = callPage(people, "", 999, VIDEO_PAGE_SIZE);
  assert.equal(first.pages, 167);
  assert.equal(first.items.length, 6);
  assert.equal(last.page, 166);
  assert.equal(last.items.length, 4);
  const roster = callPage(people, "", 49, PEOPLE_PAGE_SIZE);
  assert.equal(roster.items.length, 20);
  assert.equal(roster.items[19].identity, "person-999");
  const search = callPage(people, "participant 1000", 49, PEOPLE_PAGE_SIZE);
  assert.equal(search.total, 1);
  assert.equal(search.page, 0);
  assert.equal(callPage(people, "no match", 99, 20).items.length, 0);
  const reduced = callPage(people.slice(0, 2), "", 166, 6);
  assert.equal(reduced.page, 0);
});
test("Stage follows sharing and speaking while explicit pins survive and stale pins fall back", () => {
  assert.equal(callFocus(people, "", ["person-20"], "").identity, "person-42");
  assert.equal(
    callFocus(people, "person-999", ["person-20"], "").identity,
    "person-999",
  );
  const noShare = people.filter((p) => !p.isScreenShareEnabled);
  assert.equal(
    callFocus(noShare, "missing", ["person-20"], "").identity,
    "person-20",
  );
  assert.equal(callFocus(noShare, "", [], "person-20").identity, "person-20");
  assert.equal(
    videoSelection(people, "stage", 0, "", [], "").identities.size,
    1,
  );
  assert.equal(
    videoSelection(people, "gallery", 99, "person-999", [], "").identities.size,
    6,
  );
});
test("Rendered large-call view has six tiles and twenty roster rows, with no hidden video tiles", () => {
  const noop = () => {};
  const props = {
    participants: people,
    speakers: [],
    lastSpeaker: "",
    mode: "gallery",
    onMode: noop,
    page: 0,
    onPage: noop,
    pinned: "",
    onPin: noop,
    peopleOpen: true,
    onPeople: noop,
    query: "",
    onQuery: noop,
    peoplePage: 0,
    onPeoplePage: noop,
    expanded: false,
    onExpand: noop,
  };
  const markup = renderToStaticMarkup(createElement(CallView, props));
  assert.equal((markup.match(/class="call-tile /g) || []).length, 6);
  assert.equal((markup.match(/<li>/g) || []).length, 20);
  assert.ok(markup.includes("1000"));
  assert.ok(!markup.includes("Participant 1000"));
  const last = renderToStaticMarkup(
    createElement(CallView, { ...props, page: 166, peoplePage: 49 }),
  );
  assert.ok(last.includes("Participant 1000"));
});
