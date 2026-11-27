# Local dev server that never lets the browser cache files.
#   python3 tools/serve.py   ->  http://localhost:8768
import http.server, os

os.chdir(os.path.join(os.path.dirname(__file__), '..'))

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.ThreadingHTTPServer(('127.0.0.1', 8768), NoCache).serve_forever()
