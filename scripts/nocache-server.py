#!/usr/bin/env python3
"""Serve this directory with cache tags filled in: python3 scripts/nocache-server.py [port]

The tags themselves are handled by cache_tag.py, shared with the deploy job.
"""

import http.server
import os
import sys

from cache_tag import rewrite

CONTENT_TYPE = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        extension = os.path.splitext(path)[1]
        if extension not in ('.html', '.js') or not os.path.isfile(path):
            return super().do_GET()

        with open(path, encoding='utf-8') as handle:
            body = rewrite(handle.read(), os.path.dirname(path)).encode()
        self.send_response(200)
        self.send_header('Content-Type', CONTENT_TYPE[extension])
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


host, port = '127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f'serving http://{host}:{port}/', flush=True)
http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()
