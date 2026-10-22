// Local preview only. Keeps random media credentials in the ignored .data folder.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
if (process.env.NODE_ENV === "production")
  throw Error("Development calling cannot run in production");
const file = resolve("apps/api/.data/local-media.json");
await mkdir(resolve("apps/api/.data"), { recursive: true });
let settings: { key: string; secret: string };
try {
  settings = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  settings = {
    key: "local-" + randomBytes(8).toString("hex"),
    secret: randomBytes(32).toString("hex"),
  };
  await writeFile(file, JSON.stringify(settings), { mode: 0o600 });
}
if (
  !/^local-[a-f0-9]{16}$/.test(settings.key) ||
  !/^[a-f0-9]{64}$/.test(settings.secret)
)
  throw Error("Invalid local media settings");
process.env.LIVEKIT_URL = "ws://127.0.0.1:7880";
process.env.LIVEKIT_API_KEY = settings.key;
process.env.LIVEKIT_API_SECRET = settings.secret;
const mailKeyFile = resolve("apps/api/.data/local-mail.key");
if (!process.env.MAIL_OUTBOX_KEY) {
  try {
    process.env.MAIL_OUTBOX_KEY = await readFile(mailKeyFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    process.env.MAIL_OUTBOX_KEY = randomBytes(32).toString("base64");
    await writeFile(mailKeyFile, process.env.MAIL_OUTBOX_KEY, { mode: 0o600 });
  }
}
process.env.MAIL_MODE ||= "preview";
const binary = process.env.LIVEKIT_SERVER_BIN || "livekit-server";
if (binary.includes("/")) await access(binary);
const config = resolve("apps/api/.data/local-media.yaml");
await writeFile(
  config,
  `port: 7880\nbind_addresses: ["127.0.0.1"]\nrtc:\n  tcp_port: 7881\n  port_range_start: 50000\n  port_range_end: 50100\n  use_external_ip: false\n  node_ip: 127.0.0.1\n  enable_loopback_candidate: true\nkeys:\n  ${settings.key}: ${settings.secret}\nlogging:\n  level: warn\n`,
  { mode: 0o600 },
);
const media = spawn(binary, ["--config", config, "--bind", "127.0.0.1"], {
  stdio: "inherit",
});
media.on("error", () => {
  console.error(
    "LiveKit server is unavailable. Install the official LiveKit server and set LIVEKIT_SERVER_BIN if needed.",
  );
  process.exitCode = 1;
});
let speech: ReturnType<typeof spawn> | undefined;
if (process.env.SPEECH_ENABLED === "true") {
  process.env.SPEECH_TOKEN = randomBytes(32).toString("hex");
  speech = spawn(
    process.env.SPEECH_PYTHON || "python3",
    ["scripts/speech-worker.py"],
    { stdio: "inherit", env: process.env },
  );
  speech.on("error", () => console.error("Local speech service unavailable."));
}
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  speech?.kill("SIGTERM");
  media.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
media.on("exit", (code) => {
  if (!stopping) process.exit(code || 1);
});
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (media.exitCode !== null) throw Error("Media server stopped");
    try {
      if (
        (
          await fetch("http://127.0.0.1:7880", {
            signal: AbortSignal.timeout(500),
          })
        ).ok
      )
        break;
    } catch {
      /* Wait for the local signal service. */
    }
    if (attempt === 49) throw Error("Local media server did not become ready");
    await new Promise((done) => setTimeout(done, 200));
  }
  console.log(
    "Local call service on 127.0.0.1:7880. Camera and microphone remain opt-in.",
  );
  await import("./dev-embedded");
} catch (error) {
  speech?.kill("SIGTERM");
  media.kill("SIGTERM");
  throw error;
}
