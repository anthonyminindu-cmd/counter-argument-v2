"""Exercise account-owned photo uploads against V2 from the responsive dashboard."""
import os
import secrets
import shutil
import struct
import zlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright
from dashboard_live import ROOT, api


def solid_png(red, green, blue):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    width, height = 36, 22
    scanlines = (b"\0" + bytes([red, green, blue]) * width) * height
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(scanlines)) + chunk(b"IEND", b""))


def run():
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = os.getenv("DK_PHOTO_URL") or f"http://127.0.0.1:{server.server_port}"
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=shutil.which("google-chrome") or shutil.which("chromium"),
                                         args=["--no-sandbox"])
            email = "dk-photo-e2e-" + secrets.token_hex(8) + "@example.com"
            session = api("/auth/v1/signup", {"email": email, "password": secrets.token_urlsafe(28),
                                              "data": {"display_name": "Photo QA"}})
            assert session.get("access_token")
            print("Photo QA member", session["user"]["id"], email, flush=True)
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(base + "/")
            page.evaluate("(s)=>localStorage.setItem('sb-bqhyropctavxjdnogmor-auth-token',JSON.stringify(s))", session)
            page.goto(base + "/profile/")
            header = page.locator(".dk-profile-button img")
            dialog = page.get_by_role("dialog", name="Profile picture")
            save = dialog.get_by_role("button", name="Save photo")
            picker = dialog.locator('input[type="file"]')

            def upload(red, green, blue):
                picker.set_input_files({"name": "picture.png", "mimeType": "image/png",
                                        "buffer": solid_png(red, green, blue)})
                expect(dialog.locator(".dk-portrait-preview img")).to_be_visible()
                expect(save).to_be_enabled()
                save.click()
                expect(dialog).to_have_count(0)
                page.wait_for_function("document.querySelector('.dk-profile-button img')?.naturalWidth > 0")
                return header.get_attribute("src")

            page.get_by_role("button", name="Add photo").click()
            picker.set_input_files({"name": "wrong.txt", "mimeType": "text/plain", "buffer": b"not an image"})
            expect(dialog.get_by_role("alert")).to_contain_text("Choose a JPG")
            first = upload(82, 66, 135)
            page.reload()
            expect(header).to_have_attribute("src", first)
            page.get_by_role("button", name="Edit photo").click()
            dialog.get_by_role("button", name="Remove photo").click()
            dialog.get_by_role("button", name="Cancel").click()
            expect(header).to_have_attribute("src", first)
            page.set_viewport_size({"width": 320, "height": 844})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.set_viewport_size({"width": 1280, "height": 900})
            page.locator(".dk-profile-settings summary").click()
            page.get_by_role("link", name="Account settings").click()
            page.get_by_role("button", name="Edit photo").click()
            second = upload(72, 160, 110)
            assert first != second
            with urlopen(second, timeout=20) as image:
                assert image.headers.get_content_type() == "image/jpeg" and image.read(2) == b"\xff\xd8"
            page.get_by_role("link", name="Profile", exact=True).click()
            page.get_by_role("button", name="Edit photo").click()
            dialog.get_by_role("button", name="Remove photo").click()
            save.click()
            expect(dialog).to_have_count(0)
            page.reload()
            expect(page.get_by_role("button", name="Add photo")).to_be_enabled()
            expect(header).to_have_count(0)
            browser.close()
            print("PASS upload, preview, persistence, replace, public image, cancel and remove", flush=True)
    finally:
        server.shutdown()


if __name__ == "__main__":
    run()
