import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Mic } from "lucide-react";
import { apiFetch } from "../../auth";
import { workspaceHeaders } from "../../lib/discussion-client";
import type { MeetingRecordData as Meeting } from "./saved-meeting-record";
type Clip = { id: string; audio: string; capturedAt: string };
export default function MeetingNotes({
  sessionId,
  track,
  connected,
  readOnly,
  onPending,
  onStatus,
  onOpenNotes,
}: {
  sessionId: string;
  track: MediaStreamTrack | null;
  connected: boolean;
  readOnly: boolean;
  onPending: (value: boolean) => void;
  onStatus: (value: string) => void;
  onOpenNotes: () => void;
}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null),
    [enabled, setEnabled] = useState(false),
    [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [pending, setPending] = useState(0),
    [updating, setUpdating] = useState(false);
  useEffect(() => {
    onStatus(
      !enabled
        ? "Your notes off"
        : error || connectionError
          ? "Notes need attention"
          : !track || !connected || readOnly
            ? "Your notes paused"
            : "Taking notes",
    );
  }, [enabled, error, connectionError, track, connected, readOnly, onStatus]);
  const queue = useRef<Clip[]>([]),
    sending = useRef(false),
    mounted = useRef(true);
  const request = useCallback(async (body: unknown) => {
    const r = await apiFetch("/api/meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...workspaceHeaders() },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "Meeting notes unavailable.");
    return data;
  }, []);
  const drain = useCallback(async () => {
    if (sending.current || !queue.current.length) return;
    sending.current = true;
    try {
      while (queue.current.length && mounted.current) {
        const clip = queue.current[0];
        await request({
          action: "clip",
          sessionId,
          acknowledged: true,
          ...clip,
        });
        queue.current.shift();
        setPending(queue.current.length);
        setError("");
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Speech unavailable.");
    } finally {
      sending.current = false;
    }
  }, [request, sessionId]);
  useEffect(() => {
    onPending(pending > 0);
    return () => onPending(false);
  }, [pending, onPending]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const r = await apiFetch("/api/meeting?sessionId=" + sessionId, {
          headers: workspaceHeaders(),
        });
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (!stopped) {
          setMeeting(data);
          setConnectionError("");
        }
      } catch (e) {
        if (!stopped)
          setConnectionError(
            e instanceof SyntaxError
              ? "Meeting notes connection interrupted. Retrying…"
              : e instanceof Error
                ? e.message
                : "Meeting notes unavailable.",
          );
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sessionId]);
  useEffect(() => {
    if (!enabled || !track || !connected || readOnly) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      recorder: MediaRecorder | null = null;
    const capture = () => {
      if (stopped) return;
      if (queue.current.length >= 12) {
        setError(
          "Transcription is behind. Capture paused; retry queued audio to resume.",
        );
        timer = setTimeout(capture, 5000);
        return;
      }
      try {
        const mime = ["audio/webm;codecs=opus", "audio/mp4"].find((t) =>
          MediaRecorder.isTypeSupported(t),
        );
        if (!mime)
          throw Error(
            "This browser cannot capture speech. Try a supported browser.",
          );
        recorder = new MediaRecorder(new MediaStream([track]), {
          mimeType: mime,
          audioBitsPerSecond: 64000,
        });
        const chunks: BlobPart[] = [],
          capturedAt = new Date().toISOString();
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onerror = () => {
          setError(
            "Microphone capture failed. Turn automatic notes off and try again.",
          );
          stopped = true;
        };
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: mime });
          if (blob.size > 160000) {
            setError("Audio clip exceeded the limit and was discarded.");
          } else if (blob.size > 100 && mounted.current) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = "";
            for (const b of bytes) binary += String.fromCharCode(b);
            queue.current.push({
              id: crypto.randomUUID(),
              capturedAt,
              audio: btoa(binary),
            });
            setPending(queue.current.length);
            void drain();
          }
          if (!stopped) capture();
        };
        recorder.start();
        timer = setTimeout(() => {
          if (recorder?.state === "recording") recorder.stop();
        }, 10000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Speech capture failed.");
      }
    };
    capture();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (recorder?.state === "recording") recorder.stop();
    };
    // Capture uses this room's fixed identity; queue is kept in memory until saved.
  }, [enabled, track, connected, readOnly, sessionId, drain]);
  return (
    <section className="meeting-notes" aria-label="Automatic meeting notes">
      <h3>
        <FileText size={18} /> Automatic meeting notes
      </h3>
      <p>
        Enable for your own microphone. Every speaker opts in separately. Audio
        is processed locally and discarded; the shared transcript and AI draft
        are saved in this room.
      </p>
      <label className="room-ai-consent">
        <input
          type="checkbox"
          checked={enabled}
          disabled={readOnly || !connected || !meeting?.enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setError("");
          }}
        />
        <span>Automatically transcribe my speech and update meeting notes</span>
      </label>
      <p role="status">
        <Mic size={14} />{" "}
        {enabled
          ? track && connected
            ? "Taking notes from your microphone"
            : "Paused · enable your microphone in the call"
          : "Your microphone is not being transcribed"}
        {pending ? ` · ${pending} audio clips waiting to save` : ""}
        {updating ? " · Updating recap…" : ""}
      </p>
      {!meeting?.enabled && (
        <p>
          Automatic notes need the local speech service and transcription
          enabled by the workspace owner in Settings.
        </p>
      )}
      {(error || connectionError) && (
        <p role="alert" className="room-error">
          {error || connectionError}
        </p>
      )}
      {!!pending && (
        <button className="button secondary" onClick={() => void drain()}>
          Retry queued audio
        </button>
      )}
      {!!pending && (
        <small>
          Keep this room open until clips are saved. Closing loses queued audio.
        </small>
      )}
      {meeting?.member &&
        meeting.aiEnabled &&
        meeting.count > 0 &&
        !readOnly && (
          <button
            className="button secondary"
            disabled={updating}
            onClick={() => {
              setUpdating(true);
              void request({ action: "recap", sessionId, refresh: true })
                .catch((e) =>
                  setError(e instanceof Error ? e.message : "Recap failed."),
                )
                .finally(() => setUpdating(false));
            }}
          >
            Refresh saved recap
          </button>
        )}
      <button className="button secondary" onClick={onOpenNotes}>
        <FileText size={15} /> Open saved meeting notes
      </button>
      <small>
        Transcript, recap and suggested next steps appear in the Notes tab.
        Saved speech is processed in the background.
      </small>
    </section>
  );
}
