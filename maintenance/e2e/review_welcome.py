import base64
import json
import os
import secrets
import shutil
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect

root = Path.cwd()
def snapshot(page, tag):
    data = page.screenshot(type="jpeg", quality=77, animations="disabled")
    encoded = base64.b64encode(data).decode()
    for i in range(0, len(encoded), 5000):
        print(f"DKSHOT_{tag} {i} {encoded[i:i+5000]}", flush=True)

with TemporaryDirectory() as directory, sync_playwright() as pw:
    Path(directory, "counter-argument-v2").symlink_to(root, target_is_directory=True)
    http = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=directory))
    threading.Thread(target=http.serve_forever,daemon=True).start()
    app=f"http://127.0.0.1:{http.server_port}/counter-argument-v2"
    browser=pw.chromium.launch(executable_path=shutil.which("google-chrome"))
    import re
    from urllib.request import Request, urlopen
    app="https://anthonyminindu-cmd.github.io/counter-argument-v2"
    manifest=json.loads((root/"maintenance/build-manifest.json").read_text())
    assert manifest["generatedAsset"] in urlopen(app+"/?v=94cade13",timeout=25).read().decode()
    runtime=(root/manifest["generatedAsset"]).read_text()
    public_key=re.search(r'sb_publishable_[A-Za-z0-9_-]+',runtime).group()
    email="welcome-qa-"+secrets.token_hex(9)+"@example.com"
    password=secrets.token_urlsafe(36)
    signup=Request("https://bqhyropctavxjdnogmor.supabase.co/auth/v1/signup",
        data=json.dumps({"email":email,"password":password,"data":{"display_name":"Welcome layout QA"}}).encode(),
        headers={"apikey":public_key,"Content-Type":"application/json"})
    with urlopen(signup,timeout=30) as response:
        account=json.load(response)
    print("WELCOME_QA_ACCOUNT",account["user"]["id"],email,flush=True)
    page=browser.new_page(viewport={"width":1280,"height":850})
    page.set_default_timeout(25000)
    page.goto(app+"/?v=94cade13")
    page.get_by_role("link",name="Sign in",exact=True).click()
    page.get_by_placeholder("Enter your email",exact=True).fill(email)
    page.get_by_placeholder("Enter your password",exact=True).fill(password)
    page.get_by_role("button",name="Sign In",exact=True).click()
    expect(page.get_by_role("button",name="Sign out",exact=True)).to_be_visible()
    for w,h in [(1280,850),(390,844)]:
        page.set_viewport_size({"width":w,"height":h})
        page.get_by_role("link",name="Home",exact=True).click()
        expect(page.get_by_role("heading",level=1,name="Pull up a chair.")).to_be_visible()
        expect(page.get_by_role("region",name="Your activity")).to_be_visible()
        expect(page.get_by_role("heading",name="Community feed")).to_be_in_viewport()
        expect(page.get_by_role("button",name="Notifications",exact=False)).to_be_in_viewport()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.locator(".dk-welcome-photo").evaluate("(el)=>el.decode()")
        page.get_by_role("link",name="Your people",exact=True).click()
        expect(page.locator(".dk-welcome")).to_have_count(0)
        for name in ["Find a friend","Pick a topic","Debate with AI"]:
            expect(page.get_by_role("link",name=name,exact=True)).to_be_in_viewport()
        page.get_by_role("button",name="Notifications",exact=False).click()
        expect(page.get_by_role("dialog")).to_be_visible()
        page.get_by_role("button",name="Close",exact=True).click()
    page.get_by_role("button",name="Sign out",exact=True).click()
    expect(page.get_by_role("link",name="Sign in",exact=True)).to_be_visible()
    print("Verified signed-in and signed-out production home, feed, notifications and three launch routes",flush=True)
    browser.close()
    http.shutdown()
