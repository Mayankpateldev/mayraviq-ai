import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
export function mailMode() {
  const mode = process.env.MAIL_MODE;
  if (mode !== "preview" && mode !== "smtp") return "disabled";
  key();
  if (mode === "smtp") {
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD ||
      !z.string().email().safeParse(process.env.MAIL_FROM).success
    )
      throw Error("SMTP configuration incomplete");
    const origin = new URL(process.env.APP_ORIGIN || "");
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw Error("SMTP invitations require the HTTPS application origin");
  }
  return mode;
}
function key() {
  const bytes = Buffer.from(process.env.MAIL_OUTBOX_KEY || "", "base64");
  if (bytes.length !== 32) throw Error("Configure a 32-byte MAIL_OUTBOX_KEY");
  return bytes;
}
export function sealMail(body: string, id: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(id));
  return Buffer.concat([
    iv,
    cipher.update(body, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function openMail(body: string, id: string) {
  const bytes = Buffer.from(body, "base64"),
    cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(id));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    cipher.update(bytes.subarray(12, -16)),
    cipher.final(),
  ]).toString("utf8");
}
const escapeIcs = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
const stamp = (s: string) =>
  new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export async function prepareMail(value: {
  id: string;
  title: string;
  scheduledAt: string;
  inviter: string;
  email: string;
  code: string;
  sessionId: string;
}) {
  const origin = new URL(process.env.APP_ORIGIN || "http://127.0.0.1:5174");
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw Error("Invalid application origin");
  const link =
    origin.origin + "/#room/" + value.sessionId + "?invite=" + value.code;
  const from = process.env.MAIL_FROM || "invitations@mayraviq.local";
  const subject =
    "Meeting invitation: " + value.title.replace(/[\r\n]/g, " ").slice(0, 160);
  const text = `${value.inviter} invited you to a Mayraviq room.\n\n${value.title}\nScheduled: ${new Date(value.scheduledAt).toUTCString()}\n\nSign in with ${value.email}, then accept the invitation:\n${link}\n\nThis invitation expires in 24 hours and gives access to this room only.\n`;
  const calendar =
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Mayraviq//Meeting invitations//EN",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:" + value.sessionId + "@mayraviq.local",
      "DTSTAMP:" + stamp(new Date().toISOString()),
      "DTSTART:" + stamp(value.scheduledAt),
      "DTEND:" +
        stamp(
          new Date(Date.parse(value.scheduledAt) + 45 * 60000).toISOString(),
        ),
      "SUMMARY:" + escapeIcs(value.title),
      "DESCRIPTION:" + escapeIcs("Join the meeting: " + link),
      "URL:" + link,
      "ORGANIZER:mailto:" + from,
      "ATTENDEE;RSVP=TRUE:mailto:" + value.email,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";
  const options = {
    from,
    to: value.email,
    subject,
    text,
    messageId: `<invite-${value.id}@mayraviq.local>`,
    icalEvent: {
      method: "REQUEST",
      filename: "meeting.ics",
      content: calendar,
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  };
  const result = await nodemailer
    .createTransport({
      streamTransport: true,
      buffer: true,
      newline: "windows",
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    .sendMail(options);
  return { raw: result.message.toString(), subject, text, calendar, options };
}
export async function sendMail(
  options: Awaited<ReturnType<typeof prepareMail>>["options"],
) {
  const port = Number(process.env.SMTP_PORT || 587);
  if (![465, 587].includes(port))
    throw Error("Use secure SMTP port 465 or 587");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail(options);
    if (!result.accepted?.length) throw Error("Recipient rejected");
    return true;
  } finally {
    transport.close();
  }
}
