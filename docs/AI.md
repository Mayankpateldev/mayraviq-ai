# Private AI room assistance

The room's **AI assistant** tab can generate a conversation recap, up to six proposed actions, design ideas and unresolved questions from saved room notes, the latest 30 nondeleted messages and visible room canvas text. It does not process call audio, unsaved edits, project canvases outside the room or other workspaces. Drafts are returned to the requesting browser, not persisted automatically. Adding a recap stages a notes edit requiring Save; proposing an action creates a draft for review.

The API verifies the caller and current room membership before reading context and again before returning a generated draft. Only workspace members in open rooms can generate; room-only guests cannot. Each request requires an explicit acknowledgement. The server restricts context length, output size, output shape, generation duration, per-user rate and concurrent requests. Model content has no tool access. Prompt instructions describe room text as untrusted evidence; that reduces risk but does not guarantee immunity from misleading instructions or hallucinations. Review all suggestions against the source discussion.

## Deploy a private model

The initial provider is Ollama. It uses the official `/api/chat` endpoint with a JSON schema and nonstreaming responses. See [Ollama API](https://docs.ollama.com/api/chat). The example model `llama3.2:3b` is a small text model available in [Ollama's model library](https://ollama.com/library/llama3.2); it is a starting configuration, not a quality evaluation for your business data. Choose and evaluate a model on representative, approved test material before relying on it.

1. Configure the existing Docker/OIDC/PostgreSQL deployment as documented in Operations.
2. Start only the optional model service:

```
docker compose -f compose.yaml -f compose.ai.yaml up -d ollama
docker compose -f compose.yaml -f compose.ai.yaml exec ollama ollama pull llama3.2:3b
```

3. Set the untracked deployment environment:

```
AI_ENABLED=true
AI_ENDPOINT=http://ollama:11434
AI_MODEL=llama3.2:3b
```

4. Recreate the API with that environment:

```
docker compose -f compose.yaml -f compose.ai.yaml up --build -d api web
```

The optional container has no published host port. Model weights persist in `ollama-models`. `OLLAMA_NO_CLOUD=1` disables Ollama cloud features, as described in the [official FAQ](https://docs.ollama.com/faq). Keep this setting and control model-server egress. The example image uses a configurable `OLLAMA_IMAGE`; pin a reviewed version or image digest for deployment. Downloading the weights requires disk space and an internet connection; serving them requires sufficient CPU/RAM or a separately configured GPU. Models are not downloaded or installed by the source build. Preload the model for interactive performance; requests time out after 45 seconds. Test latency and output quality on your deployment hardware.

For a native local Ollama installation, set `AI_ENDPOINT=http://127.0.0.1:11434` and enable the same variables when starting the Node API. For the embedded development server, pass them in its process environment, for example `AI_ENABLED=true AI_MODEL=llama3.2:3b AI_ENDPOINT=http://127.0.0.1:11434 npm run dev:embedded`. Browser configuration never contains the model endpoint or server credentials.

## Boundaries and current limitations

AI is disabled by default. A configured endpoint is not a guarantee that the service or model is available; failed or malformed responses produce a clear error and no draft is applied. The adapter currently supports Ollama only. A hosted provider requires a separate approved adapter and a data-handling decision before private context is sent there.

The assistant does not record, transcribe, continuously listen, draw directly on the canvas, approve decisions, send messages or execute external tasks. It suggests design ideas in text. Unsaved notes are intentionally omitted. Output can contain mistakes even when it passes schema validation. Existing room history may exceed the included context; the draft is not a complete account of every prior conversation.

Tests use a controlled model response to verify authorization, context selection, output validation, time/size controls and draft-only behavior. Real local inference was verified on 12 October 2026 with the installed `llama3:latest` 8B model using synthetic material, including the room UI. The proposed action stayed a draft, and saved-room source versions are exposed for review. The Docker model container remains untested because the daemon is unavailable. Broader representative evaluation is still required; see [local setup](LOCAL_DEVELOPMENT.md).

## Speech-derived notes

Opted-in microphone clips can now feed automatically saved room recaps and draft actions through the local speech worker. See [meeting notes](MEETING_NOTES.md) for configuration, privacy controls and validation limits.
