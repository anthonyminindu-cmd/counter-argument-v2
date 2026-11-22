"""Check all public topics and a private invitation shared between two isolated members."""
import re
import shutil
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright
from friend_live import APP, check, create_member, run

with sync_playwright() as pw:
    chrome = pw.chromium.launch(executable_path=shutil.which("google-chrome"))
    host = chrome.new_page(viewport={"width":1200,"height":900})
    guest = chrome.new_page(viewport={"width":390,"height":844})
    expect.set_options(timeout=20000)
    host.goto(APP+"/home/?view=feed&sort=trending")
    cards=host.locator(".dk-example-card")
    expect(cards).to_have_count(10)
    topics=cards.locator(".dk-topic-label").all_text_contents()
    assert len(set(t.strip() for t in topics))==len(topics)
    dates=cards.locator("time").evaluate_all("(nodes)=>nodes.map(x=>x.dateTime)")
    links=cards.locator(".dk-example-link").evaluate_all("(nodes)=>nodes.map(x=>x.href)")
    for url in links:
        host.goto(url)
        expect(host.locator(".dk-piece-hit")).to_have_count(20)
        expect(host.locator(".dk-point-title")).to_have_count(20)
        ids=host.locator(".dk-piece-hit").evaluate_all("(nodes)=>nodes.map(x=>new URL(x.href.baseVal,location.href).searchParams.get('point'))")
        assert len(set(ids))==20 and all(ids)
        expect(host.locator(".dk-point-title").first).to_be_visible()
    host.goto(APP+"/home/?view=feed&sort=latest")
    expect(cards).to_have_count(5)
    assert cards.locator("time").evaluate_all("(nodes)=>nodes.map(x=>x.dateTime)") == sorted(dates,reverse=True)[:5]
    check("All ten live Trending topics have distinct labels and twenty linked pieces. Latest shows the five newest.")
    a=create_member("LinkSender",host)
    b=create_member("LinkReceiver",guest)
    for page in [host,guest]:
        page.wait_for_url(re.compile(r"/(?:home/?)?(?:\?.*)?$"),timeout=60000)
    host.get_by_role("link",name="Debate with a friend",exact=True).click()
    issue=host.get_by_role("button",name="Create invitation link")
    issue.click()
    link=host.get_by_label("Invitation link",exact=True)
    expect(link).to_be_visible()
    revoked=link.input_value()
    tool=host.locator(".dk-invite-links")
    assert tool.get_by_role("link",name="Email",exact=True).get_attribute("href").startswith("mailto:")
    assert tool.get_by_role("link",name="Text message",exact=True).get_attribute("href").startswith("sms:")
    tool.locator("summary").click()
    tool.get_by_role("button",name="Revoke").click()
    expect(link).to_have_count(0)
    guest.goto(revoked)
    guest.get_by_role("button",name="Accept invitation").click()
    expect(guest.get_by_role("alert")).to_contain_text("unavailable",ignore_case=True)
    check("A revoked share link was rejected at the actual join screen")
    issue.click()
    expect(link).to_be_visible()
    fresh=link.input_value()
    assert fresh!=revoked
    guest.get_by_role("button",name="Sign out",exact=True).click()
    guest.goto(fresh)
    guest.get_by_role("link",name="Sign in or create an account",exact=True).click()
    guest.get_by_placeholder("Enter your email",exact=True).fill(b["email"])
    guest.get_by_placeholder("Enter your password",exact=True).fill(b["password"])
    guest.get_by_role("button",name="Sign In",exact=True).click()
    guest.get_by_role("button",name="Accept invitation",exact=True).click()
    guest.wait_for_url(re.compile(r"/debate/topic\??[^#]*session="))
    session=parse_qs(urlparse(guest.url).query)["session"]
    guest.goto(fresh)
    guest.get_by_role("button",name="Accept invitation").click()
    guest.wait_for_url(re.compile(r"/debate/topic\??[^#]*session="))
    assert parse_qs(urlparse(guest.url).query)["session"]==session
    check("The signed-out recipient kept the link through login and re-opening it returned to the same private debate")
    chrome.close()
