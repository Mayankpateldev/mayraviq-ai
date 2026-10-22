import React, { useEffect } from "react";
import { Track, type Participant, type VideoTrack } from "livekit-client";
import {
  Maximize2,
  Minimize2,
  Pin,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  callPage,
  videoSelection,
  VIDEO_PAGE_SIZE,
  PEOPLE_PAGE_SIZE,
} from "../../lib/call-layout";
export function CallTile({
  participant,
  screen,
  active,
  onPin,
  pinned,
}: {
  participant: Participant;
  screen: boolean;
  active: boolean;
  onPin: () => void;
  pinned: boolean;
}) {
  const video = React.useRef<HTMLVideoElement>(null);
  const publication = participant.getTrackPublication(
    screen ? Track.Source.ScreenShare : Track.Source.Camera,
  );
  const track = !publication?.isMuted
    ? (publication?.track as VideoTrack | undefined)
    : undefined;
  useEffect(() => {
    const el = video.current;
    if (track && el) {
      track.attach(el);
      return () => {
        track.detach(el);
      };
    }
  }, [track]);
  return (
    <div
      className={`call-tile ${screen ? "call-screen" : ""} ${active ? "call-speaking" : ""}`}
    >
      {track ? (
        <video ref={video} autoPlay playsInline muted />
      ) : (
        <div className="call-avatar">
          {(participant.name || "Guest").slice(0, 1).toUpperCase()}
        </div>
      )}
      <span>
        {participant.name || "Guest"}
        {participant.isLocal ? " · You" : ""}
        {screen
          ? " · Sharing screen"
          : !participant.isMicrophoneEnabled
            ? " · Muted"
            : ""}
      </span>
      <button
        className="call-pin"
        aria-label={`${pinned ? "Unpin" : "Pin"} ${participant.name || "Guest"}`}
        aria-pressed={pinned}
        onClick={onPin}
      >
        <Pin size={13} />
      </button>
    </div>
  );
}
export type CallViewProps = {
  participants: Participant[];
  speakers: string[];
  lastSpeaker: string;
  mode: "stage" | "gallery";
  onMode: (v: "stage" | "gallery") => void;
  page: number;
  onPage: (v: number) => void;
  pinned: string;
  onPin: (v: string) => void;
  peopleOpen: boolean;
  onPeople: () => void;
  query: string;
  onQuery: (v: string) => void;
  peoplePage: number;
  onPeoplePage: (v: number) => void;
  expanded: boolean;
  onExpand: () => void;
};
export default function CallView(p: CallViewProps) {
  const selected = videoSelection(
      p.participants,
      p.mode,
      p.page,
      p.pinned,
      p.speakers,
      p.lastSpeaker,
    ),
    gallery = callPage(p.participants, "", p.page, VIDEO_PAGE_SIZE),
    roster = callPage(p.participants, p.query, p.peoplePage, PEOPLE_PAGE_SIZE);
  return (
    <div className="call-view">
      <div className="call-view-controls" aria-label="Call layout">
        <button
          aria-pressed={p.mode === "stage"}
          onClick={() => p.onMode("stage")}
        >
          Stage
        </button>
        <button
          aria-pressed={p.mode === "gallery"}
          onClick={() => p.onMode("gallery")}
        >
          Gallery
        </button>
        <button aria-expanded={p.peopleOpen} onClick={p.onPeople}>
          <Users size={14} /> People
        </button>
        <button
          aria-label={p.expanded ? "Collapse call" : "Expand call"}
          onClick={p.onExpand}
        >
          {p.expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
      <div className={`call-grid call-${p.mode}`}>
        {selected.tiles.map((person) => (
          <CallTile
            key={person.identity}
            participant={person}
            screen={p.mode === "stage" && person.isScreenShareEnabled}
            active={p.speakers.includes(person.identity)}
            pinned={p.pinned === person.identity}
            onPin={() => {
              p.onPin(p.pinned === person.identity ? "" : person.identity);
              p.onMode("stage");
            }}
          />
        ))}
      </div>
      {p.mode === "stage" && (
        <p className="call-view-caption">
          {p.pinned
            ? "Pinned view"
            : "Following screen share and active speaker"}
          {p.pinned && <button onClick={() => p.onPin("")}>Unpin</button>}
        </p>
      )}
      {p.mode === "gallery" && (
        <div className="call-pagination" aria-label="Video pages">
          <button
            aria-label="Previous video page"
            disabled={!gallery.page}
            onClick={() => p.onPage(gallery.page - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            Page {gallery.page + 1} of {gallery.pages} · {p.participants.length}{" "}
            people
          </span>
          <button
            aria-label="Next video page"
            disabled={gallery.page >= gallery.pages - 1}
            onClick={() => p.onPage(gallery.page + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      {p.peopleOpen && (
        <section className="call-people" aria-label="People in call">
          <label>
            Find a participant
            <input
              type="search"
              value={p.query}
              onChange={(e) => {
                p.onQuery(e.target.value);
                p.onPeoplePage(0);
              }}
              placeholder="Search by name"
            />
          </label>
          <p>
            {roster.total} {p.query ? "matching participants" : "participants"}
          </p>
          <ul>
            {roster.items.map((person) => (
              <li key={person.identity}>
                <div>
                  <strong>
                    {person.name || "Guest"}
                    {person.isLocal ? " · You" : ""}
                  </strong>
                  <small>
                    {person.isScreenShareEnabled
                      ? "Sharing screen"
                      : p.speakers.includes(person.identity)
                        ? "Speaking"
                        : person.isMicrophoneEnabled
                          ? "Microphone on"
                          : "Muted"}
                  </small>
                </div>
                <button
                  aria-label={`Focus ${person.name || "Guest"}`}
                  onClick={() => {
                    p.onPin(person.identity);
                    p.onMode("stage");
                  }}
                >
                  View
                </button>
              </li>
            ))}
          </ul>
          {!roster.total && <p>No matching participants.</p>}
          <div className="call-pagination" aria-label="Participant pages">
            <button
              aria-label="Previous participant page"
              disabled={!roster.page}
              onClick={() => p.onPeoplePage(roster.page - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <span>
              {roster.page + 1} / {roster.pages}
            </span>
            <button
              aria-label="Next participant page"
              disabled={roster.page >= roster.pages - 1}
              onClick={() => p.onPeoplePage(roster.page + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
