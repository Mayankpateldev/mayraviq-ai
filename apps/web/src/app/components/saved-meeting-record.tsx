import React, { useState } from "react";
import { Download, FileText, ListTodo } from "lucide-react";
import type { AiDraft } from "@mayraviq/contracts/ai";
export type MeetingRecordData = {
  enabled: boolean;
  aiEnabled: boolean;
  member: boolean;
  count: number;
  clips: { id: string; speaker: string; body: string; captured_at: string }[];
  recap: null | { draft: AiDraft; source_count: number; generated_at: string };
};
export function SavedMeetingRecord({
  meeting,
  readOnly,
  onAction,
}: {
  meeting: MeetingRecordData;
  readOnly: boolean;
  onAction: (title: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState<number | null>(null),
    [saved, setSaved] = useState<string[]>([]);
  const recap = meeting.recap;
  const download = () => {
    const draft = recap?.draft;
    const text = [
      "# Meeting notes",
      "AI draft — review against the transcript.",
      ...(draft
        ? [
            "## Recap",
            draft.summary,
            "## Suggested next steps",
            ...draft.actions.map((a) => `- ${a.title}`),
            "## Design ideas",
            ...draft.designIdeas.map((x) => `- ${x}`),
            "## Open questions",
            ...draft.questions.map((x) => `- ${x}`),
          ]
        : []),
      `## Transcript (latest ${meeting.clips.length} of ${meeting.count} clips)`,
      ...meeting.clips.map((c) => `${c.captured_at} · ${c.speaker}\n${c.body}`),
    ].join("\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "meeting-notes.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section
      className="saved-meeting-record"
      aria-label="Saved automatic meeting notes"
    >
      <header>
        <div>
          <span className="eyebrow">AUTOMATICALLY SAVED</span>
          <h2>
            <FileText size={20} /> Meeting notes
          </h2>
        </div>
        <button
          className="button secondary"
          onClick={download}
          disabled={!meeting.count}
        >
          <Download size={15} /> Export notes
        </button>
      </header>
      <p>
        Recaps and suggested next steps are saved here automatically. Review AI
        drafts before relying on them.
      </p>
      {!meeting.count && (
        <div className="room-work-empty">
          <h3>Your conversation becomes notes here.</h3>
          <p>
            Join the call, enable your microphone and opt into automatic notes
            in the call panel.
          </p>
        </div>
      )}
      {meeting.count > (recap?.source_count || 0) && (
        <p role="status" className="meeting-processing">
          {meeting.aiEnabled
            ? "New speech is saved. The background service will update the recap automatically."
            : "Speech is saved. Enable the workspace AI service to generate a recap."}
        </p>
      )}
      {recap && (
        <>
          <small>
            Saved {new Date(recap.generated_at).toLocaleString()} · Based on{" "}
            {recap.source_count} of {meeting.count} speech clips · AI draft
          </small>
          <h3>Recap</h3>
          <p className="room-ai-summary">{recap.draft.summary}</p>
          <h3>Suggested next steps</h3>
          {!recap.draft.actions.length && (
            <p>No concrete next steps were identified.</p>
          )}
          <ul className="meeting-action-list">
            {recap.draft.actions.map((a, i) => (
              <li key={a.title}>
                <div>
                  <strong>{a.title}</strong>
                  <p>{a.rationale}</p>
                </div>
                <button
                  className="button secondary"
                  disabled={
                    readOnly || busy !== null || saved.includes(a.title)
                  }
                  onClick={async () => {
                    setBusy(i);
                    try {
                      if (await onAction(a.title))
                        setSaved((v) => [...v, a.title]);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <ListTodo size={14} />
                  {saved.includes(a.title)
                    ? "Added for review"
                    : busy === i
                      ? "Adding…"
                      : "Add to Actions"}
                </button>
              </li>
            ))}
          </ul>
          {!!recap.draft.designIdeas.length && (
            <>
              <h3>Design ideas</h3>
              <ul>
                {recap.draft.designIdeas.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {!!recap.draft.questions.length && (
            <>
              <h3>Open questions</h3>
              <ul>
                {recap.draft.questions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {!!meeting.clips.length && (
        <details>
          <summary>Source transcript · {meeting.count} saved clips</summary>
          {meeting.count > meeting.clips.length && (
            <p>Showing the latest {meeting.clips.length} clips.</p>
          )}
          {meeting.clips.map((c) => (
            <article key={c.id}>
              <strong>{c.speaker}</strong>{" "}
              <time>{new Date(c.captured_at).toLocaleTimeString()}</time>
              <p>{c.body}</p>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
