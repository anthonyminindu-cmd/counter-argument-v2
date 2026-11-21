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
    page=browser.new_page()
    page.set_default_timeout(20000)
    for w,h in [(1280,850),(768,960),(390,844),(320,667)]:
        page.set_viewport_size({"width":w,"height":h})
        page.goto(app+"/")
        expect(page.get_by_role("heading",level=1,name="Pull up a chair.")).to_be_visible()
        hero=page.locator(".dk-welcome")
        page.locator(".dk-welcome-photo").evaluate("(el)=>el.decode()")
        expect(page.get_by_role("heading",name="Community feed")).to_be_visible()
        expect(page.locator(".dk-home-question").first).to_be_visible()
        assert page.locator('h1').count()==1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"),w
        for name in ["Find a friend","Pick a topic","Debate with AI"]:
            expect(page.get_by_role("link",name=name,exact=True)).to_be_in_viewport()
        expect(page.get_by_role("heading",name="Community feed")).to_be_in_viewport()
        print("LAYOUT",w,round(hero.bounding_box()["height"]),page.locator(".dk-welcome-photo").evaluate("i=>i.naturalWidth"),flush=True)
        if w in (1280,390): snapshot(page,"desktop" if w==1280 else "phone")
        page.get_by_role("link",name="Pick a topic",exact=True).click()
        expect(hero).to_have_count(0)
        expect(page.get_by_role("heading",level=1,name="Community feed")).to_be_visible()
        page.get_by_role("link",name="Latest",exact=True).click()
        page.get_by_role("link",name="Home",exact=True).click()
        expect(hero).to_be_visible()
        page.locator(".dk-home-question h3 a").first.click()
        expect(page.get_by_role("heading",name="Perspectives")).to_be_visible()
        expect(hero).to_have_count(0)
    print("Passed desktop, tablet, mobile and narrow phone. Navigation and first discussion opened.",flush=True)
    browser.close()
    http.shutdown()
