from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, webbrowser

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
url = "http://127.0.0.1:8080"
print(f"ANALYSIS est disponible sur {url}")
try:
    webbrowser.open(url)
except Exception:
    pass
ThreadingHTTPServer(("127.0.0.1", 8080), SimpleHTTPRequestHandler).serve_forever()
