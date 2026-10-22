# Meeting invitations

Rooms now support person-specific invitations alongside the optional share-link flow.

## Invite and respond

Open a room and choose **Invite people**. Select a workspace teammate for an in-app invitation, or enter a guest email address. Invitations appear in **Invited people**, with response, expiry, revocation and email-delivery states. The workspace header has a **Meeting invitations** inbox: recipients can accept and open the room directly or decline. Invitations expire after 24 hours.

Teammate invitations bind to the verified account ID and do not change existing workspace membership. Guest email invitations require the intended email address to be verified by the configured identity provider. A forwarded person-specific link cannot grant access to another account. Guest access covers only that room. Declining or revoking removes the guest access derived from that invitation. Workspace members retain their independent workspace access.

Local development still uses one shared identity and loopback URLs. The in-app workflow can be exercised with that local account; separate recipient identities are covered by signed-token integration tests. Friends and clients cannot use a loopback link from another computer. External identity/hosting remains deferred as requested.

## Local email previews

`npm run dev:local` prepares invitation emails without contacting an SMTP server. **View email** displays the message; **Download email with calendar attachment** exports an `.eml` containing an iCalendar invitation. The calendar slot is currently 45 minutes because session records do not yet have an end time. This is an attachment, not a calendar-provider synchronization feature.

The UI states **Email prepared · local preview**, never “sent.” Preview content is encrypted in the database using AES-256-GCM with the invitation ID as authenticated context. The local encryption key is stored in ignored, owner-readable `apps/api/.data/local-mail.key`. Keep a separate protected recovery copy of this key: a database restore alone cannot decrypt its email previews. Keys, previews and database contents are excluded from source exports.

## Configure real email later

Provide these settings to the API, outside source control:

```
MAIL_MODE=smtp
MAIL_OUTBOX_KEY=BASE64_ENCODED_32_BYTE_RANDOM_KEY
MAIL_FROM=invitations@your-domain.example
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
APP_ORIGIN=https://your-application-origin.example
```

SMTP uses authenticated TLS with certificate validation (port 587 with mandatory STARTTLS or port 465 with TLS). Email and calendar contents are composed by the server; clients cannot choose transport settings, sender identity or the application origin. Email submission is synchronous and rate limited. The UI distinguishes server acceptance from failure; acceptance by an SMTP server does not establish inbox delivery. Nodemailer's [SMTP configuration](https://nodemailer.com/smtp) describes the transport controls used here.

Production recipients must have a permitted sign-in account. Email invitations do not bypass the team's sign-in or group policy. An identity provider that omits `email_verified=true` cannot claim an email-targeted invitation until verified-claim mapping is configured. Known teammates can still use account-ID invitations.

## Validation and remaining work

Tests cover workspace-scoped recipients, wrong-account rejection, verified-email matching, in-app responses, preview authorization and encryption, calendar attachment generation, idempotent creation, decline/revocation and unchanged decisions. The actual local UI workflow was checked: create teammate invite, view inbox, accept and open the room, prepare a synthetic guest email and view its preview. No real recipient was emailed. A private database backup was taken before migration 006.

SMTP delivery with a real provider is not verified because credentials are not configured. Delivery retries/background dispatch, bounce tracking, reminders, contact search, bulk invitations, custom durations, rescheduling/cancellation emails and retention policies remain future work. A process interruption during submission can leave an uncertain delivery state; no automatic resend is performed.
