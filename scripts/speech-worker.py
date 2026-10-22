"""Loopback-only local speech worker. No audio or transcript logging."""
import json
import os
import secrets
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import whisper

TOKEN = os.environ["SPEECH_TOKEN"]
MODEL = os.environ.get("SPEECH_MODEL", "tiny.en")
MODEL_DIR = os.environ["SPEECH_MODEL_DIR"]
model = whisper.load_model(MODEL, download_root=MODEL_DIR, device="cpu")
lock = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200 if self.path == "/health" else 404, {"ready": True})

    def do_POST(self):
        if self.path != "/transcribe" or not secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN):
            self.reply(403, {"error": "Denied"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= 160000:
            self.reply(413, {"error": "Invalid audio size"})
            return
        if not lock.acquire(blocking=False):
            self.reply(429, {"error": "Speech service busy"})
            return
        try:
            self.connection.settimeout(10)
            audio = self.rfile.read(size)
            if len(audio) != size:
                raise ValueError("Incomplete audio")
            with tempfile.TemporaryDirectory(prefix="mayraviq-speech-") as folder:
                source = Path(folder) / "clip"
                source.write_bytes(audio)
                source.chmod(0o600)
                # Bound decoded samples before inference, regardless of container duration.
                pcm = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(source), "-t", "20", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, timeout=15, check=True).stdout
                import numpy as np
                samples = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
                # Avoid known silence hallucinations. Transcripts still require review.
                if len(samples) == 0 or np.sqrt(np.mean(samples ** 2)) < 0.003:
                    text = ""
                else:
                    result = model.transcribe(samples, fp16=False, verbose=None, condition_on_previous_text=False)
                    text = " ".join(s["text"].strip() for s in result["segments"] if s["no_speech_prob"] < 0.6).strip()[:4000]
            self.reply(200, {"text": text, "model": MODEL})
        except Exception:
            self.reply(503, {"error": "Speech processing failed"})
        finally:
            lock.release()

ThreadingHTTPServer(("127.0.0.1", 8091), Handler).serve_forever()
