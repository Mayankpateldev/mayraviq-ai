# Working local setup

The current scope is local development, as confirmed on 12 October 2026. External hosting, public access and live team identity-provider setup are deferred.

## Start and use

The local model service must already be running on loopback. This workstation has `llama3:latest` installed; an actual synthetic-content smoke test and room-UI generation succeeded. The 8B model was used after the smaller example model failed to reliably extract the proposed action. This is a limited functional evaluation, not a general quality or hallucination guarantee.

A private, ignored `.env.local` configures AI and the locally built media binary. From the project root:

```
npm run dev:local
```

In a second terminal:

```
VITE_DEV_AUTH=true npm run dev:web
```

Open `http://127.0.0.1:5174`. The API runs at loopback port 4000, media signalling at loopback port 7880, and the model at loopback port 11434. `npm run ai:verify` evaluates structured output using synthetic content only. A fresh installation needs the model service, approved weights and the official media server; these binaries and weights are not included in the source archive.

Development uses a shared local identity. It must remain on loopback. It is not a sign-in system for other computers or an externally accessible team deployment.

## Canvas collaboration

Room canvases enable Live save by default. Project canvases offer the same option. Changes save after a brief pause, and visible editors refresh saved state every three seconds. The API and browser reconcile independent node/property changes against the last saved base. Concurrent changes to the same field, delete-versus-edit conflicts, ID collisions and invalid merged connections pause for review. Drafts remain in the current editor; export a copy before discarding or reloading.

This is three-way, versioned reconciliation, not a CRDT or offline queue. It does not promise lossless recovery after closing the browser with an unsaved draft. Undo history resets when a new saved board is reconciled, and a race at the final compare-and-swap can require retry. High-contention simultaneous text editing still needs a stronger collaborative document model.

## Calls and AI

Independent tabs receive separate client identities tied to the verified caller, allowing the same account to connect from multiple clients. Two local clients joined together and leaving one preserved the other. Microphone and camera were kept off during that check; actual multi-person audio/video, screen sharing and cross-network TURN still require testing.

The assistant processes saved notes, recent discussion and visible room-canvas labels only after acknowledgement. Generated recaps and action suggestions are drafts. Notes still require Save, and actions still require human review. The UI labels source versions and warns when saved notes changed during generation. Opted-in microphone transcription and automatically saved recaps are now available; see [automatic meeting notes](MEETING_NOTES.md). Camera recording remains off.

## Encrypted local backups

With the embedded API running:

```
npm run backup:local
```

This creates an authenticated AES-256-GCM encrypted PGlite snapshot in ignored `apps/api/.data/backups`. The random key is in owner-readable `apps/api/.data/backup.key`. Keep the key separately when copying backups off the machine; copying the key together with a snapshot defeats that separation. This local snapshot facility is not production PostgreSQL backup scheduling or off-host retention.

Restore into a **new** directory, never over the running database:

```
npm run restore:local -- BACKUP_FILE KEY_FILE NEW_DIRECTORY
```

The restore helper rejects an existing destination and refuses the active database path or a directory inside it, including a parent-directory symlink into the active database. It does not switch the application to the restored database. A restore drill succeeded on the current data, and automated tests verify synthetic content restoration, wrong-key rejection and tamper rejection. Protect backups and key access, decide retention, and keep a separate recovery copy of the key.

The backup endpoint exists only in the explicit loopback development entry point. It requires the local development bearer token and JSON acknowledgement. Production API images contain no local backup endpoint.

The dev web server uses polling for reliable file updates on the desktop-managed filesystem and denies raw access to private storage and key files. The local API, web, model and media signalling listeners were verified on loopback.
