import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8788


class OneHoldHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path != "/api/voice-command":
            self.send_error(404, "Not found")
            return

        duration = 3
        try:
            content_length = int(self.headers.get("content-length", "0"))
            if content_length:
                body = self.rfile.read(content_length)
                payload = json.loads(body.decode("utf-8"))
                duration = max(1, min(5, int(payload.get("duration", duration))))
        except (ValueError, json.JSONDecodeError):
            self.send_error(400, "Invalid JSON")
            return

        try:
            from voicerecogfeature import record_and_transcribe
        except ImportError as exc:
            self._send_json(
                {
                    "ok": False,
                    "transcript": "",
                    "error": f"Voice dependencies are not installed: {exc}",
                },
                status=503,
            )
            return

        try:
            transcript = record_and_transcribe(duration=duration)
        except Exception as exc:
            self._send_json(
                {
                    "ok": False,
                    "transcript": "",
                    "error": f"Voice recording failed: {exc}",
                },
                status=500,
            )
            return

        is_error = transcript.startswith("Error:")
        self._send_json(
            {
                "ok": not is_error,
                "transcript": "" if is_error else transcript,
                "error": transcript if is_error else "",
            },
            status=200 if not is_error else 422,
        )

    def _send_json(self, payload, status=200):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main():
    server = ThreadingHTTPServer((HOST, PORT), OneHoldHandler)
    print(f"One Tap running at http://{HOST}:{PORT}/")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
