import CallView from "./call-view";
import { videoSelection } from "../../lib/call-layout";
import MeetingNotes from "./meeting-notes";
import { apiFetch } from "../../auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteAudioTrack,
} from "livekit-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Phone,
  FileText,
} from "lucide-react";
import { workspaceHeaders } from "../../lib/discussion-client";
export default function RoomCall({
  sessionId,
  ready,
  readOnly,
  onActive,
  onPending,
  onData,
  onOpenNotes,
  getPreview,
}: {
  sessionId: string;
  ready: boolean;
  readOnly: boolean;
  onActive: (v: boolean) => void;
  onPending: (v: boolean) => void;
  onData: (data: Uint8Array) => void;
  onOpenNotes: () => void;
  getPreview: () => Uint8Array | null;
}) {
  const roomRef = useRef<Room | null>(null),
    audio = useRef<HTMLDivElement>(null),
    generation = useRef(0),
    clientId = useRef(crypto.randomUUID()),
    onActiveRef = useRef(onActive),
    onDataRef = useRef(onData),
    previewRef = useRef(getPreview);
  const [participants, setParticipants] = useState<Participant[]>([]),
    [speechTrack, setSpeechTrack] = useState<MediaStreamTrack | null>(null),
    [status, setStatus] = useState("ready"),
    [error, setError] = useState(""),
    [mic, setMic] = useState(false),
    [camera, setCamera] = useState(false),
    [sharing, setSharing] = useState(false),
    [working, setWorking] = useState(false),
    [audioBlocked, setAudioBlocked] = useState(false),
    [notesStatus, setNotesStatus] = useState("Your notes off"),
    [speakers, setSpeakers] = useState<string[]>([]),
    [lastSpeaker, setLastSpeaker] = useState(""),
    [mode, setMode] = useState<"stage" | "gallery">("stage"),
    [page, setPage] = useState(0),
    [pinned, setPinned] = useState(""),
    [peopleOpen, setPeopleOpen] = useState(false),
    [query, setQuery] = useState(""),
    [peoplePage, setPeoplePage] = useState(0),
    [expanded, setExpanded] = useState(false);
  const callContainer = useRef<HTMLElement>(null);
  const videoIds = videoSelection(
    participants,
    mode,
    page,
    pinned,
    speakers,
    lastSpeaker,
  ).identities;
  const videoKey = JSON.stringify([...videoIds].sort());
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "connected") return;
    const ids = new Set<string>(JSON.parse(videoKey));
    for (const person of room.remoteParticipants.values())
      for (const publication of person.trackPublications.values()) {
        const wanted =
          publication.kind === Track.Kind.Audio ||
          (ids.has(person.identity) &&
            publication.source ===
              (mode === "stage" && person.isScreenShareEnabled
                ? Track.Source.ScreenShare
                : Track.Source.Camera));
        if (publication.isDesired !== wanted) publication.setSubscribed(wanted);
      }
  }, [participants, videoKey, mode, status]);
  useEffect(() => {
    if (!expanded) return;
    const original = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = callContainer.current;
    const controls = node?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), summary",
    );
    controls?.[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [
        ...node.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), summary",
        ),
      ].filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      original?.focus();
    };
  }, [expanded]);
  useEffect(() => {
    onActiveRef.current = onActive;
    onDataRef.current = onData;
    previewRef.current = getPreview;
  }, [onActive, onData, getPreview]);
  const releaseConnection = useCallback(() => {
    generation.current++;
    void roomRef.current?.disconnect();
    roomRef.current = null;
    audio.current?.replaceChildren();
    onActiveRef.current(false);
  }, []);
  useEffect(() => {
    // Hot refresh releases the connection while preserving React state.
    releaseConnection();
    setWorking(false);
    setStatus("ready");
    setParticipants([]);
    setSpeechTrack(null);
    setMic(false);
    setCamera(false);
    setSharing(false);
    return releaseConnection;
  }, [releaseConnection]);
  useEffect(() => {
    if (!readOnly) return;
    releaseConnection();
    setWorking(false);
    setStatus("ready");
    setParticipants([]);
    setSpeechTrack(null);
    setMic(false);
    setCamera(false);
    setSharing(false);
    setAudioBlocked(false);
    setExpanded(false);
  }, [readOnly, releaseConnection]);
  const join = async () => {
    if (working || roomRef.current) return;
    setWorking(true);
    setError("");
    setStatus("connecting");
    const attempt = ++generation.current;
    let room: Room | undefined;
    try {
      const response = await apiFetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders() },
        body: JSON.stringify({
          action: "token",
          sessionId,
          clientId: clientId.current,
        }),
      });
      const data = (await response.json()) as {
        token: string;
        url: string;
        error?: string;
      };
      if (!response.ok) throw Error(data.error);
      if (attempt !== generation.current) return;
      // Dual transports avoid mid-join RTC configuration changes rejected by
      // WebKit-based webviews. This is a supported LiveKit connection mode.
      room = new Room({
        adaptiveStream: true,
        dynacast: true,
        singlePeerConnection: false,
      });
      roomRef.current = room;
      const refresh = () => {
        if (attempt !== generation.current || !room) return;
        setParticipants([
          room.localParticipant,
          ...room.remoteParticipants.values(),
        ]);
        setMic(room.localParticipant.isMicrophoneEnabled);
        setSpeechTrack(
          room.localParticipant.isMicrophoneEnabled
            ? room.localParticipant.getTrackPublication(Track.Source.Microphone)
                ?.track?.mediaStreamTrack || null
            : null,
        );
        setCamera(room.localParticipant.isCameraEnabled);
        setSharing(room.localParticipant.isScreenShareEnabled);
      };
      for (const event of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackPublished,
        RoomEvent.TrackUnpublished,
        RoomEvent.ParticipantNameChanged,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
      ])
        room.on(event, refresh);
      room.on(RoomEvent.ActiveSpeakersChanged, (list) => {
        if (attempt !== generation.current) return;
        setSpeakers(list.map((p) => p.identity));
        if (list[0]) setLastSpeaker(list[0].identity);
      });
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (attempt !== generation.current) return;
        if (track.kind === Track.Kind.Audio) {
          const el = (track as RemoteAudioTrack).attach();
          audio.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });
      room.on(RoomEvent.DataReceived, (bytes, _participant, _kind, topic) => {
        if (attempt !== generation.current) return;
        if (topic === "canvas-preview" && bytes.byteLength <= 60000)
          onDataRef.current(bytes);
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (attempt === generation.current && room)
          setAudioBlocked(!room.canPlaybackAudio);
      });
      room.on(RoomEvent.Reconnecting, () => {
        if (attempt === generation.current) setStatus("reconnecting");
      });
      room.on(RoomEvent.Reconnected, () => {
        if (attempt === generation.current) {
          setStatus("connected");
          refresh();
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (attempt === generation.current) {
          setStatus("ready");
          setParticipants([]);
          setSpeechTrack(null);
          setMic(false);
          setCamera(false);
          setSharing(false);
          setAudioBlocked(false);
          setSpeakers([]);
          setLastSpeaker("");
          setExpanded(false);
          onActiveRef.current(false);
          roomRef.current = null;
          audio.current?.replaceChildren();
        }
      });
      await room.connect(data.url, data.token, { autoSubscribe: false });
      if (attempt !== generation.current) {
        await room.disconnect();
        return;
      }
      setStatus("connected");
      setAudioBlocked(!room.canPlaybackAudio);
      onActiveRef.current(true);
      refresh();
      // Joining does not request microphone/camera permission; controls opt into publishing.
    } catch (e) {
      await room?.disconnect();
      if (attempt === generation.current) {
        roomRef.current = null;
        setStatus("ready");
        setError(e instanceof Error ? e.message : "Unable to connect.");
      }
    } finally {
      if (attempt === generation.current) setWorking(false);
    }
  };
  useEffect(() => {
    if (status !== "connected") return;
    const timer = setInterval(() => {
      const bytes = previewRef.current();
      if (bytes && bytes.byteLength <= 60000)
        void roomRef.current?.localParticipant
          .publishData(new Uint8Array(bytes), {
            reliable: false,
            topic: "canvas-preview",
          })
          .catch(() => {});
    }, 250);
    return () => clearInterval(timer);
  }, [status]);
  const leave = async () => {
    generation.current++;
    setWorking(false);
    await roomRef.current?.disconnect();
    roomRef.current = null;
    audio.current?.replaceChildren();
    setParticipants([]);
    setSpeechTrack(null);
    setMic(false);
    setCamera(false);
    setSharing(false);
    setAudioBlocked(false);
    setStatus("ready");
    setExpanded(false);
    setPinned("");
    setSpeakers([]);
    setLastSpeaker("");
    onActiveRef.current(false);
  };
  const toggle = async (type: "mic" | "camera" | "share") => {
    const p = roomRef.current?.localParticipant;
    if (!p || working || status !== "connected") return;
    setWorking(true);
    setError("");
    try {
      if (type === "mic") await p.setMicrophoneEnabled(!p.isMicrophoneEnabled);
      if (type === "camera") await p.setCameraEnabled(!p.isCameraEnabled);
      if (type === "share")
        await p.setScreenShareEnabled(!p.isScreenShareEnabled);
      setMic(p.isMicrophoneEnabled);
      setCamera(p.isCameraEnabled);
      setSharing(p.isScreenShareEnabled);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Check device permissions and try again.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <section
      ref={callContainer}
      className={`room-call ${expanded ? "call-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label="Room call"
    >
      <div className="call-status">
        <span className={status === "connected" ? "live-dot" : ""} />
        <strong>
          {status === "connected"
            ? `${participants.length} in the call`
            : status === "connecting"
              ? "Connecting…"
              : status === "reconnecting"
                ? "Reconnecting…"
                : "Call room"}
        </strong>
        <small>
          <FileText size={13} /> {notesStatus}
        </small>
      </div>
      {participants.length ? (
        <CallView
          participants={participants}
          speakers={speakers}
          lastSpeaker={lastSpeaker}
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
      ) : (
        <div className="call-welcome">
          <div>
            <Video size={26} />
          </div>
          <h2>Think better, together.</h2>
          <p>
            Talk with your team, peers or clients.
            <br />
            Keep your ideas and next steps in the same room.
          </p>
          <button
            className="button primary"
            disabled={working || readOnly || !ready}
            onClick={() => void join()}
          >
            <Phone size={16} />
            {working ? "Connecting…" : "Join call"}
          </button>
          <small>
            {readOnly
              ? "This room has ended or is archived."
              : ready
                ? "Microphone and camera start off. Enable them when ready."
                : "Calling requires the media service connection."}
          </small>
        </div>
      )}
      {status === "connected" || status === "reconnecting" ? (
        <div className="call-controls">
          <button
            aria-label={mic ? "Mute microphone" : "Enable microphone"}
            aria-pressed={mic}
            disabled={working || status !== "connected"}
            onClick={() => void toggle("mic")}
          >
            {mic ? <Mic /> : <MicOff />}
          </button>
          <button
            aria-label={camera ? "Turn camera off" : "Enable camera"}
            aria-pressed={camera}
            disabled={working || status !== "connected"}
            onClick={() => void toggle("camera")}
          >
            {camera ? <Video /> : <VideoOff />}
          </button>
          <button
            aria-label={sharing ? "Stop screen sharing" : "Share screen"}
            aria-pressed={sharing}
            disabled={working || status !== "connected"}
            onClick={() => void toggle("share")}
          >
            <MonitorUp />
          </button>
          <button
            className="leave-call"
            aria-label="Leave call"
            onClick={() => void leave()}
          >
            <PhoneOff />
          </button>
        </div>
      ) : null}
      {audioBlocked && status === "connected" && (
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await roomRef.current?.startAudio();
              setAudioBlocked(!(roomRef.current?.canPlaybackAudio ?? false));
            } catch {
              setError(
                "Audio playback was blocked. Check this browser’s sound permission and retry.",
              );
            }
          }}
        >
          Enable call audio
        </button>
      )}
      {error && (
        <p role="alert" className="call-error">
          {error}
        </p>
      )}
      <p className="call-recording-info">
        Audio/video recording is not enabled. Meeting notes are controlled
        separately below.
      </p>
      <div ref={audio} />
      <MeetingNotes
        sessionId={sessionId}
        onOpenNotes={onOpenNotes}
        onPending={onPending}
        onStatus={setNotesStatus}
        track={mic ? speechTrack : null}
        connected={status === "connected"}
        readOnly={readOnly}
      />
    </section>
  );
}
