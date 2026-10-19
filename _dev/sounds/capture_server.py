"""あそびラボの今の音（ビフォー）を録るための、ローカルだけのサーバー。

  ../ゲーム を配り、POST /save?name=<game>__<sound> で受けた録音（webm）を
  ../sound-library/remake/before/ に置く。127.0.0.1 だけで待つ。
  python _dev/sounds/capture_server.py [port]
"""
import re, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
GAMES = HERE.parents[2] / "ゲーム"
OUT = HERE.parents[2] / "sound-library" / "remake" / "before"


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path == "/__rec.js":
            body = (HERE / "rec.js").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = q.get("name", [""])[0]
        if not urlparse(self.path).path == "/save" or not re.fullmatch(r"[\w-]+__[\w-]+", name):
            self.send_error(400)
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f"{name}.webm").write_bytes(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(str(len(data)).encode())


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8811
    ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(GAMES))).serve_forever()
