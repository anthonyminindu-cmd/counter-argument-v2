"""Live QA for a private AI debate and a reversible editorial reaction."""
import json
import re
import shutil
import struct
import time
from pathlib import Path
from urllib.request import Request, urlopen

from playwright.sync_api import expect, sync_playwright
from friend_live import API, APP, build, check, create_member, public_key, run

points = [
    ("Lower household costs", "A shared repair tool lets a household fix a bike without buying equipment for one job."),
    ("Make small repairs possible", "A basic loan kit could get a commuter riding again after a minor breakdown."),
    ("Teach practical skills", "Borrowers can learn how to patch a tire using the printed steps that come with a kit."),
    ("Use existing desks", "Branches already have a way to track loans, due dates and returns."),
    ("Reach casual riders", "Occasional cyclists have less reason to own a full tool set but sometimes need one."),
    ("Offer short loans", "A two-day loan would let multiple families use a kit within one week."),
    ("Support local workshops", "A repair class could use the same tools that patrons can later borrow."),
    ("Test demand first", "A small pilot could measure the number of loans before buying more kits."),
    ("Reduce waste", "Repairing a damaged bicycle part can extend the usable life of the bicycle."),
    ("Expand access", "A neighborhood branch may be closer to a household than a specialist repair shop."),
]

def read_workflow(member):
    req = Request(API + "/rest/v1/debate_workflows?select=stage,ranking,snapshot,counters,failure_reason&user_id=eq." + member["id"],
        headers={"apikey":public_key,"Authorization":"Bearer "+member["access_token"]})
    with urlopen(req, timeout=20) as res:
        return json.load(res)

def button(page, label):
    return page.get_by_role("button", name=label, exact=True)

def public_reaction(page, member):
    page.get_by_role("link", name="Trending topics", exact=True).click()
    page.locator(".dk-example-link").first.click()
    first = page.locator(".dk-point-title").first
    first.click()
    action = page.locator(".dk-point-body").get_by_role("button",name=re.compile("^Informative"))
    expect(action).to_have_attribute("aria-pressed","false")
    action.click()
    try:
        expect(action).to_have_attribute("aria-pressed","true")
        page.reload()
        expect(first).to_be_visible()
        if first.get_attribute("aria-expanded") != "true": first.click()
        expect(action).to_have_attribute("aria-pressed","true")
    finally:
        if action.is_visible() and action.get_attribute("aria-pressed") == "true":
            action.click()
            expect(action).to_have_attribute("aria-pressed","false")
    check("A newly registered member saved a real point reaction, refreshed it and removed it")

def solo(page, member):
    page.get_by_role("link", name="Debate with AI", exact=True).click()
    topic="Should public libraries lend bicycle repair kits?"
    page.get_by_label("Your question").fill(topic)
    button(page,"Continue with AI").click()
    page.get_by_role("textbox", name="Your position",exact=True).fill("Try lending tool kits at one neighborhood branch.")
    button(page,"Submit Position").click()
    page.get_by_role("textbox",name="AI position",exact=True).fill("Use the library budget for other priorities.")
    button(page,"Set AI Position").click()
    button(page,"Ready for Counter Arguments").click()
    expect(page.locator("#argument-title-0")).to_be_visible(timeout=45000)
    for i,(title,detail) in enumerate(points):
        ti=page.locator(f"#argument-title-{i}")
        ti.fill(title)
        page.locator(f"#argument-description-{i}").fill(detail)
        if i == 2:
            page.reload()
            expect(ti).to_have_value(title,timeout=20000)
            expect(page.locator("#argument-title-0")).to_have_value(points[0][0])
            check("AI draft recovered submitted points and an unsent point after refresh")
        button(page, "Submit Argument "+str(i+1)).click()
        if i<9: expect(ti).to_have_attribute("readonly","")
    check("Submitted ten original arguments through the live AI editor")
    previous=None
    for _ in range(112):
        rows=read_workflow(member)
        if rows:
            result=rows[0]
            stage=result["stage"]
            if stage!=previous: print("AI stage",stage,flush=True); previous=stage
            if stage=="complete": break
            if stage=="failed": raise AssertionError("AI workflow failed: "+str(result["failure_reason"])[:280])
        page.wait_for_timeout(8000)
    else: raise AssertionError("AI workflow did not complete within 15 minutes. Last stage: "+str(previous))
    rank=result["ranking"]
    assert len(result["counters"])==10 and sorted(r["rank"] for r in rank)==list(range(1,21))
    assert {p["title"] for p in result["snapshot"]["points"]}=={p[0] for p in points}
    assert {p["id"] for p in rank}=={p["id"] for p in result["snapshot"]["points"]+result["counters"]}
    check("AI research generated ten counterpoints and ranked the original twenty unique point IDs")
    page.get_by_role("link",name="Profile",exact=True).click()
    page.get_by_role("region",name="Your activity").get_by_role("link",name=topic,exact=True).click()
    expect(page.locator("svg [data-label]")).to_have_count(20,timeout=90000)
    with page.expect_download() as downloaded:
        button(page,"Download PNG").click()
    png=Path(downloaded.value.path()).read_bytes()
    assert png[:8] == bytes.fromhex("89504e470d0a1a0a")
    dimensions=struct.unpack(">II",png[16:24]); assert dimensions in {(6400,3600),(4480,2520)}
    check("Reopened completed AI history and downloaded a "+str(dimensions)+" PNG with all 20 labels")

if __name__=="__main__":
    expect.set_options(timeout=20000)
    with urlopen(APP+"/?qa_build="+run,timeout=20) as response:
        assert build["generatedAsset"] in response.read().decode()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=shutil.which("google-chrome"))
        page=browser.new_page(viewport={"width":1280,"height":900})
        page.set_default_timeout(25000)
        member=create_member("Solo",page)
        try:
            public_reaction(page,member)
            solo(page,member)
        except Exception:
            print("Visible headings:",page.get_by_role("heading").all_text_contents()[:12],flush=True)
            print("Visible controls:",page.get_by_role("button").all_text_contents()[-16:],flush=True)
            raise
        finally: browser.close()
