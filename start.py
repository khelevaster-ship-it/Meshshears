# Opens the tool through a small local web server, so the piece finder can use all your processor cores
# (browsers allow that only for pages served with two safety headers, which this server sends).
# usage: python3 start.py        (Windows: double-click start_windows.bat)   Stop it with Ctrl+C or by closing the window.
import http.server, os, socket, sys, threading, webbrowser
HERE = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json"}
    def __init__(self, *a, **k): super().__init__(*a, directory=HERE, **k)
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
    def log_message(self, *a): pass

def free_port():
    for p in range(8765, 8800):
        with socket.socket() as s:
            try: s.bind(("127.0.0.1", p)); return p
            except OSError: continue
    return 0

port = int(sys.argv[1]) if len(sys.argv) > 1 else free_port()
srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
url = f"http://localhost:{srv.server_address[1]}/"
print("MeshShears is running at " + url + "  (keep this window open; Ctrl+C stops it)", flush=True)
if os.environ.get("NO_BROWSER") != "1": threading.Timer(0.5, lambda: webbrowser.open(url)).start()
try: srv.serve_forever()
except KeyboardInterrupt: pass
