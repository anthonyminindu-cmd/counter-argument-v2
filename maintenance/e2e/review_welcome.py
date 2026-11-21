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
        expect(hero.get_by_text("Welcome to Differ Kindly",exact=True)).to_be_visible()
        debate=page.get_by_role("group",name="Start a debate",exact=True)
        expect(debate.get_by_role("link")).to_have_text(["Debate with a friend","Debate with AI"])
        discover=page.get_by_role("group",name="Discover",exact=True)
        expect(discover.get_by_role("link",name="Trending topics")).to_be_visible()
        page.locator(".dk-welcome-photo").evaluate("(el)=>el.decode()")
        expect(page.get_by_role("heading",name="Community feed")).to_be_visible()
        expect(page.locator(".dk-home-question").first).to_be_visible()
        assert page.locator('h1').count()==1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"),w
        for name in ["Debate with a friend","Trending topics","Debate with AI"]:
            expect(page.get_by_role("link",name=name,exact=True)).to_be_in_viewport()
        expect(page.get_by_role("heading",name="Community feed")).to_be_in_viewport()
        print("LAYOUT",w,round(hero.bounding_box()["height"]),page.locator(".dk-welcome-photo").evaluate("i=>i.naturalWidth"),flush=True)
        if w in (1280,390): snapshot(page,"desktop" if w==1280 else "phone")
        page.get_by_role("link",name="Trending topics",exact=True).click()
        expect(hero).to_have_count(0)
        expect(page.get_by_role("heading",level=1,name="Community feed")).to_be_visible()
        page.get_by_role("link",name="Latest",exact=True).click()
        page.get_by_role("link",name="Home",exact=True).click()
        expect(hero).to_be_visible()
        page.locator(".dk-home-question h3 a").first.click()
        expect(page.get_by_role("heading",name="Perspectives")).to_be_visible()
        expect(hero).to_have_count(0)
    print("Passed desktop, tablet, mobile and narrow phone. Navigation and first discussion opened.",flush=True)
    import re
    from urllib.request import Request, urlopen
    manifest=json.loads((root/"maintenance/build-manifest.json").read_text())
    assert manifest["generatedAsset"] in urlopen(app+"/?v=clarity-qa",timeout=25).read().decode()
    runtime=(root/manifest["generatedAsset"]).read_text()
    public_key=re.search(r'sb_publishable_[A-Za-z0-9_-]+',runtime).group()
    email="section-qa-"+secrets.token_hex(9)+"@example.com"
    password=secrets.token_urlsafe(36)
    signup=Request("https://bqhyropctavxjdnogmor.supabase.co/auth/v1/signup",
        data=json.dumps({"email":email,"password":password,"data":{"display_name":"Section layout QA"}}).encode(),
        headers={"apikey":public_key,"Content-Type":"application/json"})
    with urlopen(signup,timeout=30) as response:
        account=json.load(response)
    print("SECTION_QA_ACCOUNT",account["user"]["id"],email,flush=True)
    page=browser.new_page(viewport={"width":1280,"height":850})
    page.set_default_timeout(25000)
    page.goto(app+"/?v=clarity-qa")
    page.get_by_role("link",name="Sign in",exact=True).click()
    page.get_by_placeholder("Enter your email",exact=True).fill(email)
    page.get_by_placeholder("Enter your password",exact=True).fill(password)
    page.get_by_role("button",name="Sign In",exact=True).click()
    expect(page.get_by_role("button",name="Sign out",exact=True)).to_be_visible()
    for w,h in [(1280,850),(768,930),(390,844),(320,667)]:
        page.set_viewport_size({"width":w,"height":h})
        page.get_by_role("link",name="Home",exact=True).click()
        expect(page.get_by_role("heading",level=1,name="Pull up a chair.")).to_be_visible()
        expect(page.get_by_role("region",name="Your activity")).to_be_visible()
        expect(page.get_by_role("heading",name="Community feed")).to_be_in_viewport()
        expect(page.get_by_role("button",name="Notifications",exact=False)).to_be_in_viewport()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.locator(".dk-welcome-photo").evaluate("(el)=>el.decode()")
        if w in [1280,390]:
            snapshot(page,"memberdesk" if w==1280 else "memberphone")
        page.get_by_role("link",name="Debate with a friend",exact=True).click()
        expect(page.get_by_role("heading",name="Debate with a friend",exact=True)).to_be_visible()
        expect(page.get_by_label("Search for users")).to_be_visible()
        page.get_by_role("link",name="Debate with AI",exact=True).click()
        expect(page.get_by_role("heading",name="What would you like to explore?")).to_be_visible()
        page.get_by_role("link",name="Trending topics",exact=True).click()
        expect(page.get_by_role("link",name="Trending",exact=True)).to_have_attribute("aria-current","page")
        page.get_by_role("link",name="Your people",exact=True).click()
        expect(page.locator(".dk-welcome")).to_have_count(0)
        for name in ["Debate with a friend","Trending topics","Debate with AI"]:
            expect(page.get_by_role("link",name=name,exact=True)).to_be_in_viewport()
        page.get_by_role("button",name="Notifications",exact=False).click()
        expect(page.get_by_role("dialog")).to_be_visible()
        page.get_by_role("button",name="Close",exact=True).click()
    page.get_by_role("button",name="Sign out",exact=True).click()
    expect(page.get_by_role("link",name="Sign in",exact=True)).to_be_visible()
    print("Verified authenticated landing, route destinations, active trending filter and inbox at all four widths",flush=True)

    browser.close()
    http.shutdown()
