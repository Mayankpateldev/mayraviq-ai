# Calling setup

## Local preview on one computer

The room client needs a running LiveKit media server as well as the Mayraviq API. An unconfigured preview disables Join call; it does not simulate a call.

Install the official server using the [LiveKit local setup guide](https://docs.livekit.io/transport/self-hosting/local/). On macOS, the documented package is `brew install livekit`. Alternatively, build the official tagged source into a workspace directory and set `LIVEKIT_SERVER_BIN` to the resulting server executable.

Stop the existing `dev:api`/`dev:embedded` process so port 4000 is free. From the repository root, run:

```
npm run dev:call
```

If the binary is outside PATH:

```
LIVEKIT_SERVER_BIN=/absolute/path/to/livekit-server npm run dev:call
```

In another terminal:

```
VITE_DEV_AUTH=true npm run dev:web
```

`dev:call` starts the local media server and the embedded development API. It generates random media credentials and keeps them in the ignored `apps/api/.data` directory with owner-only file permissions. Signalling binds to loopback at port 7880; local ICE candidates use loopback. Plain WebSocket is allowed only by the explicit development runtime for loopback hosts. The production runtime never enables this exception.

Open http://127.0.0.1:5174, enter an open room, and select Join call. The microphone and camera start off. Enable devices with the call controls when ready, or Leave call to disconnect. The room's notes and design remain available after leaving.

This local setup supports tabs on the same computer. A peer on another computer cannot connect to its loopback address.

The client uses LiveKit’s supported dual peer connection mode. This avoids a mid-join WebRTC configuration change that the in-app WebKit preview rejects.

## Team deployment

Use a self-hosted LiveKit deployment or an approved LiveKit Cloud project. Set server-side `LIVEKIT_URL` (WSS), `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`; do not put secrets in React environment variables. Configure valid TLS, DNS, reachable ICE/TURN and firewall ports according to [LiveKit's deployment guide](https://docs.livekit.io/transport/self-hosting/deployment/).

Media stays a separately deployed service. The Node API checks room membership/guest access and grants a short-lived token scoped to that room. Do not expose the local development identity or local media configuration to the team network.

Before production, verify two participants on different networks, device permissions, screen share, reconnect, guest expiry and participant removal. Retained audio/video recording is not implemented. Local opt-in speech notes are documented separately in MEETING_NOTES.md. Physical-device and cross-network acceptance remain required.

Two independent local clients were verified on 12 October 2026 with devices off. Each client nonce is bound to its verified caller when issuing a grant, so another tab no longer displaces the first tab from the same account. Leaving one client preserves the other.

## Large-call layout and recording status

The call header reports the local participant's speech-note state separately from audiovisual recording. Automatic notes save transcripts and recaps; retained audio/video recording is not enabled.

Stage view follows screen sharing and the active speaker, with a personal pin override. Gallery view renders at most six participant tiles per page. People search and paging render at most twenty roster rows. Expand opens a larger call view with keyboard focus containment and Escape to collapse. The browser joins with automatic subscription disabled, subscribes only to visible video sources, and retains audio subscriptions to preserve conversation and active-speaker detection. This uses LiveKit's [selective subscription controls](https://docs.livekit.io/transport/media/subscribe/).

A development-only fixture and automated rendering tests exercise 1,000 simulated participant entries, page bounds, search, pins, sharing and speaker fallback. This is UI validation, not a 1,000-connection media load test. The current local media service and single CPU speech worker have no such capacity claim. Supporting 1,000 real attendees requires a moderated speaker/audience model, publishing limits, SFU/TURN/network sizing, distributed transcription and real media-load tests. Audience permissions and moderation remain planned work.

## Synthetic media verification (20 October 2026)

The local development fixture `/synthetic-call-preview.html?room=<synthetic-room-id>` replaces device acquisition with generated audio/video/screen tracks. It is excluded from the production entry/build and requires localhost development mode. Two in-app browser tabs exchanged nonzero inbound audio and video bytes through the real local SFU. Device denial/retry, screen-share stage switching, leave/rejoin without dropping the other client, and signal interruption/recovery passed. The client now offers an explicit Enable call audio control when autoplay is blocked, prevents stale callbacks after leaving and clears microphone/camera/screen state on disconnect. Autoplay recovery still needs a browser that actually denies playback; these checks do not establish physical-device, TURN or 1,000-person capacity.
