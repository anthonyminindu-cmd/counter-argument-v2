"""Serve the checked-out Pages build on loopback against an explicit V2 test project.

Set DK_TEST_PROJECT_REF and DK_TEST_PUBLISHABLE_KEY. Run this module with
solo_first_visit, friend_first_visit or friend_live. Use 'serve' for interactive
Google sign-in with http://127.0.0.1:8172/login/ registered as a staging redirect.
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
APP = "http://127.0.0.1:8172"
PRODUCTION = "bqhyropctavxjdnogmor"
LEGACY = "jgmkhntqfffkwggqzxql"


def target():
    ref = os.getenv("DK_TEST_PROJECT_REF", "")
    key = os.getenv("DK_TEST_PUBLISHABLE_KEY", "")
    if not re.fullmatch("[a-z]{20}", ref) or ref in (PRODUCTION, LEGACY):
        raise ValueError("Set DK_TEST_PROJECT_REF to a separate V2 QA project or branch")
    if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", key):
        raise ValueError("Set DK_TEST_PUBLISHABLE_KEY to the staging publishable key")
    return f"https://{ref}.supabase.co", key


def preview_bundle():
    api, key = target()
    manifest = json.loads((ROOT / "maintenance/build-manifest.json").read_text())
    runtime = (ROOT / manifest["generatedAsset"]).read_bytes()
    if hashlib.sha256(runtime).hexdigest() != manifest["generatedSha256"]:
        raise ValueError("Build manifest differs from checkout")
    production_url = f"https://{PRODUCTION}.supabase.co".encode()
    if runtime.count(production_url) != 1:
        raise ValueError("Review the backend binding for this build")
    runtime, count = re.subn(rb'sb_publishable_[A-Za-z0-9_-]+', key.encode(), runtime)
    if count != 1:
        raise ValueError("Review the publishable key binding for this build")
    return "/" + manifest["generatedAsset"], runtime.replace(production_url, api.encode())


def verify_preview():
    path, expected = preview_bundle()
    with urlopen(APP + "/", timeout=10) as page:
        if f'src="{path[1:]}"' not in page.read().decode():
            raise ValueError("QA frontend is serving a different build")
    with urlopen(APP + path, timeout=10) as script:
        if script.read() != expected:
            raise ValueError("QA frontend is not using the selected isolated backend")


if __name__ == "__main__":
    flow, = sys.argv[1:]
    if flow not in ("solo_first_visit", "friend_first_visit", "friend_live", "serve"):
        raise ValueError("Unknown QA flow")
    path, bundle = preview_bundle()

    class Preview(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kw):
            super().__init__(*args, directory=ROOT, **kw)

        def send_head(self):
            requested = urlsplit(self.path).path
            if requested == path:
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return io.BytesIO(bundle)
            if requested.startswith("/assets/index-") and requested.endswith(".js"):
                self.send_error(404)
                return None
            return super().send_head()

    with ThreadingHTTPServer(("127.0.0.1", 8172), Preview) as server:
        if flow == "serve":
            print(APP, flush=True)
            server.serve_forever()
        else:
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                subprocess.run([sys.executable, "-u", str(Path(__file__).with_name(flow + ".py"))], check=True)
            finally:
                server.shutdown()
