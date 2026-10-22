import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  mailMode,
  prepareMail,
  sealMail,
  openMail,
} from "../../apps/api/src/modules/invitations/mail.ts";
test("Meeting email includes a calendar attachment, while local preview never contacts SMTP", async () => {
  const previous = { ...process.env };
  try {
    process.env.MAIL_MODE = "preview";
    process.env.MAIL_OUTBOX_KEY = randomBytes(32).toString("base64");
    delete process.env.APP_ORIGIN;
    assert.equal(mailMode(), "preview");
    const value = await prepareMail({
      id: "test-invite",
      title: "Review, layout;\nnext steps",
      scheduledAt: "2026-10-15T15:00:00.000Z",
      inviter: "Synthetic colleague",
      email: "peer@example.test",
      code: "code",
      sessionId: "session",
    });
    assert.ok(value.raw.includes("text/calendar"));
    assert.ok(value.calendar.includes("DTSTART:20261015T150000Z"));
    assert.ok(value.calendar.includes("DTEND:20261015T154500Z"));
    assert.ok(
      value.calendar.includes("SUMMARY:Review\\, layout\\;\\nnext steps"),
    );
    assert.ok(value.text.includes("peer@example.test"));
    const sealed = sealMail(JSON.stringify(value), "test-invite");
    assert.ok(!sealed.includes("peer@example.test"));
    assert.equal(openMail(sealed, "test-invite"), JSON.stringify(value));
    assert.throws(() => openMail(sealed, "other-invite"));
    process.env.MAIL_MODE = "smtp";
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_USER = "test";
    process.env.SMTP_PASSWORD = "test";
    process.env.MAIL_FROM = "invites@example.test";
    assert.throws(() => mailMode());
  } finally {
    for (const k of [
      "MAIL_MODE",
      "MAIL_OUTBOX_KEY",
      "APP_ORIGIN",
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "MAIL_FROM",
    ]) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
});
