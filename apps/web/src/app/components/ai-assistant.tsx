import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, FileText, Plus } from "lucide-react";
import { apiFetch } from "../../auth";
import type { AiDraft, AiStatus } from "@mayraviq/contracts/ai";
import { workspaceHeaders } from "../../lib/discussion-client";
type DraftResponse = {
  draft: AiDraft;
  model: string;
  generatedAt: string;
  sourceVersion: number;
  notesChangedDuringGeneration?: boolean;
  sources?: {
    notesVersion: number;
    canvasVersion: number;
    discussionMessages: number;
  };
};
export default function AiAssistant({
  sessionId,
  readOnly,
  onNotes,
  onAction,
}: {
  sessionId: string;
  readOnly: boolean;
  onNotes: (text: string) => boolean;
  onAction: (title: string) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<AiStatus | null>(null),
    [result, setResult] = useState<DraftResponse | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [added, setAdded] = useState<number[]>([]),
    [notesAdded, setNotesAdded] = useState(false);
  useEffect(() => {
    let stopped = false;
    void apiFetch("/api/ai?sessionId=" + encodeURIComponent(sessionId), {
      headers: workspaceHeaders(),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "AI settings unavailable.");
        if (!stopped) setStatus(data);
      })
      .catch((e: Error) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [sessionId]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders() },
        body: JSON.stringify({ sessionId, acknowledged }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "AI draft unavailable.");
      setResult(data);
      setAdded([]);
      setNotesAdded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="room-ai" aria-label="AI room assistant">
      <div className="room-panel-heading">
        <div>
          <span className="eyebrow">THINK IT THROUGH</span>
          <h2>
            <Sparkles size={20} /> AI room assistant
          </h2>
        </div>
        {status?.enabled && <span>{status.model}</span>}
      </div>
      <p>
        Turn the room’s saved notes, recent discussion and design labels into a
        recap, possible actions and ideas to explore.
      </p>
      {error && (
        <p className="room-error" role="alert">
          {error}
        </p>
      )}
      {!status && !error && <p>Checking the team’s model connection…</p>}
      {status && !status.enabled && (
        <div className="room-ai-setup">
          <h3>Your team’s model is not connected yet.</h3>
          <p>
            An administrator can connect an approved team model. Suggestions
            will appear here once the service is configured.
          </p>
        </div>
      )}
      {status?.enabled && !status.permitted && (
        <p>AI drafting is available to workspace members in an open room.</p>
      )}
      {status?.enabled && status.permitted && (
        <>
          <label className="room-ai-consent">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={busy || readOnly}
            />
            <span>
              Process this room’s saved content with the team’s configured
              model. Unsaved edits and call audio are not included.
            </span>
          </label>
          <button
            className="button primary"
            disabled={busy || readOnly || !acknowledged}
            onClick={() => void generate()}
          >
            <RefreshCw size={16} />
            {busy
              ? "Preparing your draft…"
              : result
                ? "Generate a fresh draft"
                : "Generate room draft"}
          </button>
        </>
      )}
      {result && (
        <div className="room-ai-results">
          <small>
            AI draft · {result.model} · Review against the original discussion
            before using it.
          </small>
          {result.sources && (
            <p className="room-ai-source-label">
              Sources: saved room notes (version {result.sources.notesVersion}),
              up to {result.sources.discussionMessages} recent messages, and
              visible canvas labels (version {result.sources.canvasVersion}).
            </p>
          )}
          {result.notesChangedDuringGeneration && (
            <p role="status" className="room-error">
              Room notes changed during generation. Review against the latest
              notes or generate a fresh draft.
            </p>
          )}
          <article>
            <h3>Conversation recap</h3>
            <p className="room-ai-summary">
              {result.draft.summary ||
                "There was not enough context for a recap."}
            </p>
            <button
              className="button secondary"
              disabled={readOnly || notesAdded || !result.draft.summary}
              onClick={() => {
                if (onNotes(result.draft.summary)) setNotesAdded(true);
              }}
            >
              <FileText size={15} />
              {notesAdded ? "Added to notes draft" : "Add to notes draft"}
            </button>
          </article>
          <article>
            <h3>Possible next steps</h3>
            {!result.draft.actions.length && (
              <p>No actions were supported by the saved context.</p>
            )}
            {result.draft.actions.map((action, index) => (
              <div className="room-ai-action" key={index}>
                <strong>{action.title}</strong>
                <p>{action.rationale}</p>
                <button
                  className="button secondary"
                  disabled={readOnly || busy || added.includes(index)}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      if (await onAction(action.title))
                        setAdded((previous) => [...previous, index]);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Plus size={15} />
                  {added.includes(index)
                    ? "Proposed for review"
                    : "Propose action for review"}
                </button>
              </div>
            ))}
          </article>
          {!!result.draft.designIdeas.length && (
            <article>
              <h3>Design ideas to explore</h3>
              <ul>
                {result.draft.designIdeas.map((idea, index) => (
                  <li key={index}>{idea}</li>
                ))}
              </ul>
            </article>
          )}
          {!!result.draft.questions.length && (
            <article>
              <h3>Open questions</h3>
              <ul>
                {result.draft.questions.map((question, index) => (
                  <li key={index}>{question}</li>
                ))}
              </ul>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
