"""Opt-in signed-in dashboard check against V2 using an isolated QA member."""
import json
import os
import re
import secrets
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.request import Request, urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
API = "https://bqhyropctavxjdnogmor.supabase.co"
manifest = json.loads((ROOT / "maintenance/build-manifest.json").read_text())
public_key = re.search(r"sb_publishable_[A-Za-z0-9_-]+", (ROOT / manifest["generatedAsset"]).read_text()).group()


def api(path, payload, token=None):
    headers = {"apikey": public_key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    with urlopen(Request(API + path, headers=headers, data=json.dumps(payload).encode()), timeout=20) as response:
        return json.loads(response.read() or b"null")


def run():
    email = "dk-dashboard-e2e-" + secrets.token_hex(8) + "@example.com"
    session = api("/auth/v1/signup", {"email": email, "password": secrets.token_urlsafe(28),
                                     "data": {"display_name": "Dashboard QA"}})
    assert session.get("access_token"), "QA signup requires email confirmation"
    print("Dashboard QA member", session["user"]["id"], email, flush=True)
    edition = json.loads((ROOT / "demo/november-2026/edition.json").read_text())
    example = edition[0]
    comment = example["sampleActivity"]["comments"][0]["commentId"]
    peer = api("/auth/v1/signup", {"email": "dk-dashboard-e2e-" + secrets.token_hex(8) + "@example.com",
                                  "password": secrets.token_urlsafe(28), "data": {"display_name": "Dashboard QA"}})
    assert peer.get("access_token")
    print("Dashboard QA peer", peer["user"]["id"], peer["user"]["email"], flush=True)
    token = session["access_token"]
    def rpc(name, args):
        return api("/rest/v1/rpc/" + name, args, token)
    server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = os.getenv("DK_DASHBOARD_URL") or ("http://127.0.0.1:" + str(server.server_port))
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(base + "/")
            page.evaluate("(session) => localStorage.setItem('sb-bqhyropctavxjdnogmor-auth-token',JSON.stringify(session))", session)
            page.reload()
            header = page.locator(".dk-member-bar")
            bell = header.get_by_role("button", name=re.compile("^Notifications"))
            profile_button = header.get_by_role("link", name="Profile", exact=True)
            shortcuts = header.get_by_role("navigation", name="Your activity shortcuts")
            expect(shortcuts.get_by_role("link")).to_have_count(3)
            expect(bell).to_be_visible()
            expect(profile_button).to_be_visible()
            for width in [320, 390, 768, 1280]:
                page.set_viewport_size({"width": width, "height": 844})
                for control in [header.locator(".dk-mark"), header.locator(".dk-bell-label"), profile_button]:
                    box = control.bounding_box()
                    assert box and box["width"] > 15 and box["x"] >= 0 and box["x"] + box["width"] <= width
                layout = header.evaluate("""el => ({client:el.clientWidth, scroll:el.scrollWidth,
                    controls:[...el.querySelectorAll('nav,a,button')].filter(n=>n.offsetWidth).map(n=>[
                      n.className,Math.round(n.getBoundingClientRect().left),Math.round(n.getBoundingClientRect().right)])})""")
                assert layout["scroll"] <= layout["client"], (width, layout)
            page.set_viewport_size({"width": 390, "height": 844})
            shortcuts.get_by_role("link", name=re.compile("^Comments")).click()
            expect(page.get_by_role("heading", name="Your comments", exact=True)).to_be_visible()
            page.get_by_role("link", name="Profile", exact=True).click()
            expect(page.get_by_role("heading", name="Your dashboard")).to_be_visible()
            cards = page.locator(".dk-dashboard-metrics a")
            expect(cards).to_have_count(5)
            expect(cards.first.locator("strong")).to_have_text("0")
            assert cards.nth(4).bounding_box()["y"] < 844
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            for section, title in [(2,"Your posts and debates"),(3,"Your comments"),(4,"Your friends")]:
                cards.nth(section).click()
                expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()
            page.set_viewport_size({"width": 1280, "height": 900})
            assert abs(cards.first.bounding_box()["y"] - cards.nth(4).bounding_box()["y"]) < 2
            page.goto(base + "/home/?view=feed&example=" + example["id"] + "&comments=1&comment=" + comment)
            row = page.locator("#dk-comment-" + comment)
            row.get_by_role("button", name="Like comment", exact=True).click()
            expect(row.get_by_role("button", name="Unlike comment", exact=True)).to_be_enabled()
            page.get_by_role("link", name="Profile", exact=True).click()
            expect(cards.first.locator("strong")).to_have_text("1")
            page.reload()
            expect(cards.first.locator("strong")).to_have_text("1")
            page.locator(".dk-dashboard-list a").first.click()
            expect(row).to_be_focused()
            row.get_by_role("button", name="Unlike comment", exact=True).click()
            expect(row.get_by_role("button", name="Like comment", exact=True)).to_be_enabled()
            page.get_by_role("link", name="Profile", exact=True).click()
            expect(cards.first.locator("strong")).to_have_text("0")
            expect(shortcuts.get_by_role("link", name="Likes given, 0")).to_be_visible()
            api("/rest/v1/rpc/dk_change_friend", {"p_peer": session["user"]["id"], "p_action": "request"}, peer["access_token"])
            page.reload()
            bell = page.get_by_role("button", name="Notifications, 1 unread", exact=True)
            bell.click()
            dialog = page.get_by_role("dialog", name="Notifications")
            expect(dialog.get_by_role("heading", name="Debate invitations")).to_be_visible()
            dialog.get_by_role("button", name="Mark activity as read").click()
            expect(dialog.get_by_role("button", name="Mark activity as read")).to_have_count(0)
            dialog.get_by_role("link", name=re.compile("sent you a friend request")).click()
            expect(page.get_by_role("heading", name="Your friends", exact=True)).to_be_visible()
            page.get_by_role("button", name="Accept request").click()
            expect(shortcuts.get_by_role("link", name="Friends, 1")).to_be_visible()
            page.reload()
            expect(page.locator(".dk-notify")).to_have_attribute("aria-label","Notifications")
            with browser.new_context() as peer_context:
                peer_page = peer_context.new_page()
                peer_page.goto(base + "/")
                peer_page.evaluate("(s) => localStorage.setItem('sb-bqhyropctavxjdnogmor-auth-token',JSON.stringify(s))", peer)
                peer_page.reload()
                peer_page.get_by_role("button", name="Notifications, 1 unread", exact=True).click()
                peer_page.get_by_role("dialog").get_by_role("link", name=re.compile("accepted your friend request")).click()
                expect(peer_page.get_by_role("heading", name="Your friends", exact=True)).to_be_visible()
            expect(page.get_by_role("link", name="Appearance",exact=True)).to_be_visible()
            browser.close()
            print("PASS signed-in mobile and desktop dashboard, drilldowns, persistent like, exact comment and unlike", flush=True)
    finally:
        rpc("dk_set_member_comment_like", {"p_kind": "editorial", "p_id": comment, "p_enabled": False})
        rpc("dk_change_friend", {"p_peer": peer["user"]["id"], "p_action": "remove"})
        api("/rest/v1/rpc/dk_change_friend", {"p_peer": session["user"]["id"], "p_action": "cancel"}, peer["access_token"])
        server.shutdown()


if __name__ == "__main__":
    os.chdir(ROOT)
    run()
