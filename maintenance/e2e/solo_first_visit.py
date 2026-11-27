"""Walk the released solo debate as a new member. Keep the debate private."""
import json
import re
import shutil
import struct
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from friend_first_visit import sign_up
from friend_live import APP, button, check

QUESTION = "Will Palestinians and Israelis ever find lasting peace?"
HUMAN = "Lasting peace is possible if both peoples gain safeguards."
AI = "The opposing case"
POINTS = [
    ("Civilian safety", "People on both sides need credible protection in daily life for compromise to earn public trust."),
    ("Political voice", "A settlement can gain legitimacy if both peoples have an effective say in decisions that shape their future."),
    ("Independent verification", "Mutually accepted monitoring could give both communities a way to check whether promises are kept."),
    ("Dispute resolution", "An agreed process for resolving disputes could help prevent one disagreement from ending negotiations."),
    ("Everyday cooperation", "Cooperation on water or public health could give families a practical reason to sustain an agreement."),
    ("Freedom of movement", "Predictable access to work, education and family could make the benefits of peace tangible."),
    ("Room for grief", "Acknowledging loss on both sides can make dialogue possible without asking people to surrender their identity."),
    ("Representation of refugees", "Including displaced families in discussions about remedies could make an agreement more durable."),
    ("Long-term commitments", "Institutions that survive a change of leaders could give each side more confidence in agreed commitments."),
    ("Gradual implementation", "Smaller, verifiable commitments could build confidence for harder decisions while preserving long-term goals."),
]

def check_width(page, step):
    sizes=page.evaluate("() => [document.documentElement.scrollWidth,innerWidth]")
    print("LAYOUT",step,*sizes,flush=True)
    assert sizes[0]<=sizes[1], f"Horizontal overflow on {step}: {sizes}"

def summary(page):
    print("HEADINGS",page.get_by_role("heading").all_text_contents()[:22],flush=True)
    print("CONTROLS",page.get_by_role("button").all_text_contents()[:25],flush=True)
    print("STATUS",page.get_by_role("status").all_text_contents()[:12],flush=True)
    print("ALERT",page.get_by_role("alert").all_text_contents()[:6],flush=True)

def poster(page):
    graphic=page.locator('svg[data-poster-format="impact-v2"]')
    if not graphic.is_visible():
        button(page,"View infographic").click()
    cells=graphic.locator("g[data-argument-id]")
    expect(cells).to_have_count(20,timeout=30000)
    data=cells.evaluate_all("(ns)=>ns.map(n=>[n.dataset.argumentId,+n.dataset.pick,+n.dataset.impact,+n.dataset.rank])")
    assert len({r[0] for r in data})==20 and sorted(r[1] for r in data)==sorted(list(range(1,11))*2)
    assert sorted(r[3] for r in data)==list(range(1,21))
    impacts=[r[2] for r in sorted(data,key=lambda r:r[3])]
    assert all(0<=v<=100 for v in impacts) and impacts==sorted(impacts,reverse=True)
    with page.expect_download() as download:
        button(page,"Download PNG").click()
    raw=Path(download.value.path()).read_bytes()
    assert raw[:8]==b"\x89PNG\r\n\x1a\n" and struct.unpack(">II",raw[16:24])==(1080,1350)
    return sorted(data),raw

def trip(page):
    page.goto(APP)
    entry=page.get_by_role("link",name="Debate with Diff AI",exact=True).first
    expect(entry).to_be_visible()
    entry.click()
    page.get_by_role("link",name="Sign up",exact=True).click()
    sign_up(page,"Solo",select_tab=False)
    q=page.get_by_label("Your question")
    expect(q).to_be_visible(timeout=35000)
    check("New account returned to the AI topic entry")
    check_width(page,"topic")
    expect(page.get_by_text(re.compile("write 10 points"))).to_be_visible()
    q.fill(QUESTION)
    button(page,"Continue to your position").click()
    mine=page.get_by_role("textbox",name="Your position",exact=True)
    opponent=page.get_by_role("textbox",name="AI position",exact=True)
    expect(mine).to_be_visible(timeout=30000)
    check_width(page,"positions")
    mine.fill(HUMAN)
    expect(opponent).to_have_count(0)
    button(page,"Write my 10 points").click()
    point=lambda i: page.get_by_role("region",name=f"Point {i} of 10",exact=True)
    title=lambda i:point(i).get_by_label("Title",exact=False)
    detail=lambda i:point(i).get_by_label("Explanation",exact=True)
    expect(title(1)).to_be_visible(timeout=30000)
    button(page,"Make private").click()
    private=page.get_by_text("Private debate",exact=True).first
    expect(private).to_be_visible(timeout=20000)
    check("Set the participant stance and made the debate private before submitting any points")
    check_width(page,"writing")
    final_submit=button(point(10),"Submit")
    expect(final_submit).to_be_disabled()
    expect(page.get_by_role("textbox",name="AI position",exact=True)).to_have_count(0)
    expect(page.get_by_text("AI Research Status",exact=True)).to_have_count(0)
    btn=button(point(1),"Submit point 1")
    expect(btn).to_be_disabled()
    expect(page.locator(".dk-writing-card")).to_have_count(10)
    title(2).fill(POINTS[1][0])
    detail(2).fill(POINTS[1][1])
    expect(point(2).get_by_role("button",name="Submit point 2")).to_have_count(0)
    for i,(name,body) in enumerate(POINTS,1):
        if i==2:
            button(point(1),"Edit point 1").click()
            title(1).fill("Reliable civilian safety")
            button(point(1),"Save changes").click()
            page.reload()
            expect(private).to_be_visible(timeout=30000)
            expect(page.get_by_text("Reliable civilian safety",exact=True)).to_be_visible()
            expect(title(2)).to_have_value(name)
            expect(detail(2)).to_have_value(body)
            check("Refresh restored the submitted point, the unsubmitted second point, and privacy")
        else:
            title(i).fill(name)
            detail(i).fill(body)
        if i==10:
            with page.expect_request(lambda req:req.method=="POST" and req.url.endswith("/functions/v1/submit-ai-debate")) as submission:
                final_submit.click()
            payload=submission.value.post_data_json
            assert payload["action"]=="submit" and len(payload["arguments"])==10
            assert payload["arguments"][0]["title"]=="Reliable civilian safety"
            assert payload["positions"]==[HUMAN,AI]
        else:
            button(point(i),f"Submit point {i}").click()
            expect(point(i+1)).to_have_attribute("aria-current","step",timeout=15000)
    check("All ten original peace arguments submitted")
    table=page.get_by_role("list",name="Ranked original arguments")
    complete=page.get_by_role("heading",name="Final rankings",exact=True)
    begin=time.monotonic()
    seen=set()
    ready=page.get_by_role("heading",name="Your debate results are ready",exact=True)
    while time.monotonic()-begin<950:
        if complete.is_visible() or ready.is_visible(): break
        status=" | ".join(" ".join(t.split()) for t in page.get_by_role("status").all_text_contents() if t.strip())
        if status not in seen:
            print("OBSERVED",round(time.monotonic()-begin),status[:360],flush=True)
            seen.add(status)
        alerts=page.get_by_role("alert").all_text_contents()
        if any(re.search(r"failed|paused|not finish|review the previous request",a,re.I) for a in alerts):
            raise AssertionError("Processing alert: "+" / ".join(alerts)[:350])
        page.wait_for_timeout(4000)
    if ready.is_visible():
        button(page,"View ranked arguments").click()
    expect(complete).to_be_visible(timeout=15000)
    print("RANKS READY after seconds",round(time.monotonic()-begin),flush=True)
    expect(table.get_by_role("listitem")).to_have_count(20)
    print("RESULT HEADINGS",table.get_by_role("heading").all_text_contents(),flush=True)
    for item in table.locator("details > summary").all():
        item.click()
    links=table.get_by_role("link").evaluate_all("(ns)=>[...new Set(ns.map(n=>new URL(n.href).hostname))]")
    print("SOURCE DOMAINS",links,flush=True)
    assert links, "The ranked arguments did not include any source links"
    check_width(page,"rankings")
    a,img=poster(page)
    check_width(page,"poster")
    page.set_viewport_size({"width":1180,"height":850})
    page.get_by_role("link",name="Profile",exact=True).click()
    page.get_by_role("link",name=re.compile(r"Posts & debates")).click()
    hist=page.get_by_role("region",name="Your posts and debates")
    hist.get_by_role("link",name=QUESTION,exact=True).click()
    expect(private).to_be_visible(timeout=30000)
    expect(page.locator('svg[data-poster-format="impact-v2"]').or_(button(page,"View infographic")).first).to_be_visible(timeout=35000)
    b,img2=poster(page)
    assert a==b
    print("POSTER exports same bytes",img==img2,flush=True)
    check("Saved profile result kept all twenty identities, picks, impact scores and ranks, with PNG downloads on mobile and desktop")

if __name__=="__main__":
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=shutil.which("google-chrome"))
        page=browser.new_page(viewport={"width":390,"height":844},accept_downloads=True)
        page.set_default_timeout(12000)
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)[:200]))
        try:
            trip(page)
        except Exception:
            summary(page)
            raise
        finally:
            print("BROWSER ERRORS",errors[:6],flush=True)
            browser.close()
