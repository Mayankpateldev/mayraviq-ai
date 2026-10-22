import { useEffect, useState } from "react";
import { apiFetch } from "../../auth";
import { workspaceHeaders } from "../../lib/discussion-client";
import {
  SavedMeetingRecord,
  type MeetingRecordData,
} from "./saved-meeting-record";
export default function MeetingRecord({
  sessionId,
  active,
  readOnly,
  onAction,
}: {
  sessionId: string;
  active: boolean;
  readOnly: boolean;
  onAction: (title: string) => Promise<boolean>;
}) {
  const [meeting, setMeeting] = useState<MeetingRecordData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const r = await apiFetch(
          "/api/meeting?sessionId=" + encodeURIComponent(sessionId),
          { headers: workspaceHeaders() },
        );
        const data = await r.json();
        if (!r.ok) {
          if (r.status === 403 && !stopped) setMeeting(null);
          throw Error(data.error || "Meeting notes unavailable.");
        }
        if (!stopped) {
          setMeeting(data);
          setError("");
        }
      } catch {
        if (!stopped)
          setError("Could not refresh saved meeting notes. Retrying…");
      } finally {
        if (!stopped) timer = setTimeout(refresh, 5000);
      }
    };
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [sessionId, active]);
  return (
    <>
      {error && (
        <p role="alert" className="room-error">
          {error}
        </p>
      )}
      {meeting ? (
        <SavedMeetingRecord
          meeting={meeting}
          readOnly={readOnly}
          onAction={onAction}
        />
      ) : (
        !error && <p role="status">Loading saved meeting notes…</p>
      )}
    </>
  );
}
