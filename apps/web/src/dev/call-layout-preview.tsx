// Development-only UI fixture. No media connection or microphone access.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Participant } from "livekit-client";
import CallView from "../app/components/call-view";
import "../app/components/live-room.css";
if (!import.meta.env.DEV) throw Error("Development fixture only");
const people = Array.from({ length: 1000 }, (_, i) => ({
  identity: "person-" + i,
  name: `Participant ${String(i + 1).padStart(4, "0")}`,
  isLocal: i === 0,
  isScreenShareEnabled: i === 42,
  isMicrophoneEnabled: false,
  getTrackPublication: () => undefined,
})) as unknown as Participant[];
function Preview() {
  const [mode, setMode] = useState<"stage" | "gallery">("gallery"),
    [page, setPage] = useState(0),
    [pinned, setPinned] = useState(""),
    [peopleOpen, setPeopleOpen] = useState(true),
    [query, setQuery] = useState(""),
    [peoplePage, setPeoplePage] = useState(0),
    [expanded, setExpanded] = useState(false);
  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "24px auto",
        fontFamily: "system-ui",
        padding: 16,
      }}
    >
      <h1>Large call layout verification</h1>
      <p>1,000 simulated participant entries · no live media connections</p>
      <section className={`room-call ${expanded ? "call-expanded" : ""}`}>
        <div className="call-status">
          <strong>1,000 participants</strong>
          <small>UI fixture</small>
        </div>
        <CallView
          participants={people}
          speakers={["person-20"]}
          lastSpeaker="person-20"
          mode={mode}
          onMode={setMode}
          page={page}
          onPage={setPage}
          pinned={pinned}
          onPin={setPinned}
          peopleOpen={peopleOpen}
          onPeople={() => setPeopleOpen((v) => !v)}
          query={query}
          onQuery={setQuery}
          peoplePage={peoplePage}
          onPeoplePage={setPeoplePage}
          expanded={expanded}
          onExpand={() => setExpanded((v) => !v)}
        />
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
