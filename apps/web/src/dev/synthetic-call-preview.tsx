// Local development fixture only. Replaces device acquisition with generated media;
// never opens a physical microphone, camera, or screen picker.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Room, RoomEvent } from "livekit-client";
import RoomCall from "../app/components/room-call";
import "../app/components/live-room.css";
if (!import.meta.env.DEV || location.hostname !== "127.0.0.1")
  throw Error("Local fixture only");
const sessionId = new URLSearchParams(location.search).get("room") || "";
if (!/^[a-f0-9-]{36}$/.test(sessionId))
  throw Error("Supply a synthetic room ID");
let reconnects = 0,
  recoveries = 0;
const rooms = new Set<Room>();
const listen = Room.prototype.on;
Room.prototype.on = function (this: Room, ...args: Parameters<Room["on"]>) {
  if (!rooms.has(this)) {
    rooms.add(this);
    listen.call(this, RoomEvent.SignalReconnecting, () => {
      reconnects++;
    });
    listen.call(this, RoomEvent.Reconnected, () => {
      recoveries++;
    });
  }
  return listen.apply(this, args);
};
const connections: RTCPeerConnection[] = [];
const Original = window.RTCPeerConnection;
window.RTCPeerConnection = class extends Original {
  constructor(config?: RTCConfiguration) {
    super(config);
    connections.push(this);
  }
};
let deny = false;
async function synthetic(constraints: MediaStreamConstraints) {
  if (deny)
    throw new DOMException("Synthetic permission denied", "NotAllowedError");
  const stream = new MediaStream();
  if (constraints.audio) {
    const context = new AudioContext(),
      source = context.createOscillator(),
      gain = context.createGain(),
      destination = context.createMediaStreamDestination();
    gain.gain.value = 0.005;
    source.connect(gain).connect(destination);
    source.start();
    await context.resume();
    const track = destination.stream.getAudioTracks()[0],
      stop = track.stop.bind(track);
    track.stop = () => {
      stop();
      source.stop();
      void context.close();
    };
    stream.addTrack(track);
  }
  if (constraints.video) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    let frame = 0;
    const timer = setInterval(() => {
      context.fillStyle = frame++ % 2 ? "#263c62" : "#467dcc";
      context.fillRect(0, 0, 640, 360);
      context.fillStyle = "#fff";
      context.font = "24px sans-serif";
      context.fillText("Synthetic media · " + frame, 30, 80);
    }, 100);
    const track = canvas.captureStream(10).getVideoTracks()[0],
      stop = track.stop.bind(track);
    track.stop = () => {
      clearInterval(timer);
      stop();
    };
    stream.addTrack(track);
  }
  return stream;
}
navigator.mediaDevices.getUserMedia = synthetic;
navigator.mediaDevices.getDisplayMedia = () => synthetic({ video: true });
function Preview() {
  const [denied, setDenied] = useState(false),
    [stats, setStats] = useState("Waiting for media"),
    [mounted, setMounted] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        let audio = 0,
          video = 0;
        for (const pc of connections)
          if (pc.connectionState !== "closed")
            for (const s of (await pc.getStats()).values()) {
              if (s.type === "inbound-rtp" && s.kind === "audio")
                audio += s.bytesReceived || 0;
              if (s.type === "inbound-rtp" && s.kind === "video")
                video += s.bytesReceived || 0;
            }
        setStats(
          `Received audio bytes: ${audio} · video bytes: ${video} · Signal interruptions: ${reconnects} · Recoveries: ${recoveries}`,
        );
      })().catch(() => setStats("Connection changed; refreshing stats"));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "24px auto",
        padding: 20,
        fontFamily: "system-ui",
      }}
    >
      <h1>Synthetic call verification</h1>
      <p>
        Generated audio, camera and screen only. No physical devices are
        accessed.
      </p>
      <label>
        <input
          type="checkbox"
          checked={denied}
          onChange={(e) => {
            deny = e.target.checked;
            setDenied(deny);
          }}
        />{" "}
        Simulate device permission denial
      </label>
      <button onClick={() => setMounted((v) => !v)}>
        {mounted ? "Unmount call" : "Mount call"}
      </button>
      <button
        onClick={() => {
          for (const room of rooms)
            if (room.state === "connected")
              void room.simulateScenario("signal-reconnect", 2000);
        }}
      >
        Simulate signal interruption
      </button>
      <p role="status">{stats}</p>
      {mounted && (
        <RoomCall
          sessionId={sessionId}
          ready
          readOnly={false}
          onActive={() => {}}
          onPending={() => {}}
          onData={() => {}}
          getPreview={() => null}
          onOpenNotes={() => {}}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
