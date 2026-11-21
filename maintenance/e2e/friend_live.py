"""Opt-in live integration test. Only the two newly created QA members interact."""
import json
import os
import re
import secrets
import shutil
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from contextlib import ExitStack
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
APP = os.environ["DK_TEST_URL"].rstrip("/")
API = "https://bqhyropctavxjdnogmor.supabase.co"
build = json.loads((ROOT / "maintenance/build-manifest.json").read_text())
runtime = (ROOT / build["generatedAsset"]).read_text()
public_key = re.search(r'sb_publishable_[A-Za-z0-9_-]+', runtime).group()
run = secrets.token_hex(5)
print("QA cohort dk-invite-e2e-" + run, flush=True)


def create_member(role):
    display = "InboxQA" + run + role
    email = f"dk-invite-e2e-{run}-{role.lower()}@example.com"
    password = secrets.token_urlsafe(28)
    request = Request(API + "/auth/v1/signup", data=json.dumps({
        "email": email, "password": password, "data": {"display_name": display}
    }).encode(), headers={"apikey": public_key, "Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    if not result.get("access_token"):
        raise RuntimeError("QA signup did not produce a verified session.")
    return {"id": result["user"]["id"], "name": display, "email": email, "password": password}


def login(page, member):
    page.goto(APP + "/?qa=" + run)
    page.get_by_role("link", name="Sign in", exact=True).click()
    page.get_by_placeholder("Enter your email", exact=True).fill(member["email"])
    page.get_by_placeholder("Enter your password", exact=True).fill(member["password"])
    page.get_by_role("button", name="Sign In", exact=True).click()
    expect(page.get_by_role("button", name="Sign out", exact=True)).to_be_visible()


def send(page, member):
    page.get_by_role("link", name="Find a friend", exact=True).click()
    page.get_by_label("Search for users").fill(member["name"])
    expect(page.get_by_text(member["name"], exact=True).first).to_be_visible()
    page.get_by_role("button", name="Invite", exact=True).click()
    expect(page.get_by_role("heading", name="Invitation sent", exact=True)).to_be_visible()


def await_popup(page, name):
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible(timeout=30000)
    expect(dialog.get_by_text(name + " invited you to a debate", exact=True)).to_be_visible()
    return dialog


def session(page):
    return parse_qs(urlparse(page.url).query)["session"][0]


def check(label):
    print("PASS " + label, flush=True)


if __name__ == "__main__":
    expect.set_options(timeout=15000)
    with ExitStack() as stack:
        if os.getenv("DK_TEST_SERVE_CHECKOUT"):
            # Match the published Pages base path, including static deep-link shells.
            import tempfile
            basedir = Path(stack.enter_context(tempfile.TemporaryDirectory()))
            (basedir / "counter-argument-v2").symlink_to(ROOT, target_is_directory=True)
            server = ThreadingHTTPServer(("127.0.0.1",8172), partial(SimpleHTTPRequestHandler,directory=str(basedir)))
            threading.Thread(target=server.serve_forever,daemon=True).start()
            stack.callback(server.server_close)
            stack.callback(server.shutdown)
        with urlopen(APP + "/?qa_build=" + run, timeout=20) as response:
            assert build["generatedAsset"] in response.read().decode(), "The test URL is serving a different build"
        a, b = create_member("Sender"), create_member("Receiver")
        assert a["id"] != b["id"]
        pw = stack.enter_context(sync_playwright())
        chrome = shutil.which("google-chrome") or shutil.which("chromium")
        if not chrome:
            raise RuntimeError("Chrome or Chromium is required")
        def browser_page(width):
            browser = pw.chromium.launch(executable_path=chrome)
            stack.callback(browser.close)
            page = browser.new_page(viewport={"width":width,"height":850})
            page.set_default_timeout(20000)
            def report_rpc_failure(response):
                if "/rest/v1/rpc/" in response.url and response.status >= 400:
                    body=response.json()
                    print("RPC failure",urlparse(response.url).path,body.get("code"),body.get("message"),flush=True)
            page.on("response",report_rpc_failure)
            return page
        sender, receiver = browser_page(1180), browser_page(390)
        login(sender,a)
        login(receiver,b)
        receiver.get_by_role("link",name="Latest",exact=True).click()
        send(sender,b)
        alert = await_popup(receiver,a["name"])
        alert.get_by_role("button",name="Close",exact=True).click()
        receiver.get_by_role("button",name="Notifications, 1 unread",exact=True).click()
        receiver.get_by_role("dialog").get_by_role("button",name="Decline",exact=True).click()
        expect(sender.get_by_role("heading",name=b["name"]+" declined")).to_be_visible(timeout=30000)
        check("Online delivery in Latest, inbox badge, decline, sender acknowledgement")
        if sender.get_by_role("dialog").is_visible():
            sender.get_by_role("dialog").get_by_role("button",name="Close",exact=True).click()
        receiver.get_by_role("button",name="Sign out",exact=True).click()
        expect(receiver.get_by_role("link",name="Sign in",exact=True)).to_be_visible()
        send(sender,b)
        login(receiver,b)
        alert=await_popup(receiver,a["name"])
        alert.get_by_role("button",name="Accept invitation",exact=True).click()
        for page in (sender,receiver):
            page.wait_for_url(re.compile(r'/debate/topic\??[^#]*session='),timeout=35000)
            expect(page.get_by_placeholder("Enter your debate topic...")).to_be_visible()
        room=session(sender)
        assert room==session(receiver)
        check("Offline invitation appeared on login and both browsers joined the same session")
        chat="I can see our shared table."
        receiver.get_by_placeholder("Type a message...",exact=True).fill(chat)
        receiver.get_by_role("button",name="Send message",exact=True).click()
        expect(sender.get_by_text(chat,exact=True)).to_be_visible()
        sender.get_by_placeholder("Enter your debate topic...").fill("Should the library open earlier?")
        sender.get_by_role("button",name="Propose",exact=True).click()
        receiver.get_by_role("button",name="Decline",exact=True).click()
        expect(sender.get_by_placeholder("Enter your debate topic...")).to_be_visible()
        check("Partner chat delivered and declining a proposal cleared it for both members")
        sender,receiver=receiver,sender  # Reverse who proposes and who accepts.
        topic="Should libraries share repair tools?"
        sender.get_by_placeholder("Enter your debate topic...").fill(topic)
        sender.get_by_role("button",name="Propose",exact=True).click()
        expect(sender.get_by_text("You agreed. Waiting for your partner.",exact=True)).to_be_visible()
        receiver.reload()
        expect(receiver.get_by_text("Your turn to review this topic.",exact=True)).to_be_visible(timeout=30000)
        expect(receiver.get_by_text(topic,exact=True)).to_be_visible()
        receiver.get_by_role("button",name="Accept Topic",exact=True).click()
        for page in (sender,receiver):
            page.wait_for_url(re.compile(r'/debate/active\?'),timeout=35000)
            expect(page.get_by_role("textbox",name="Your position",exact=True)).to_be_visible(timeout=30000)
            assert session(page)==room
            assert parse_qs(urlparse(page.url).query)["topic"]==[topic]
        check("Topic persisted through refresh and both accounts advanced with the same agreed topic")
