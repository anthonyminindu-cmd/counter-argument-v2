"""Opt-in live integration test. Only the two newly created QA members interact."""
import base64
import json
import os
import re
import secrets
import shutil
import struct
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from contextlib import ExitStack
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
from uuid import UUID

from playwright.sync_api import expect, sync_playwright
from friend_topic_recovery import check_friend_topic_recovery

ROOT = Path(__file__).resolve().parents[2]
APP = os.environ["DK_TEST_URL"].rstrip("/")
API = "https://bqhyropctavxjdnogmor.supabase.co"
build = json.loads((ROOT / "maintenance/build-manifest.json").read_text())
runtime = (ROOT / build["generatedAsset"]).read_text()
public_key = re.search(r'sb_publishable_[A-Za-z0-9_-]+', runtime).group()
run = secrets.token_hex(5)
SCREENSHOTS = os.getenv("DK_TEST_SCREENSHOTS")
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
    print("FRIEND_QA_ACCOUNT", result["user"]["id"], email, flush=True)
    if not result.get("access_token"):
        raise RuntimeError("QA signup did not produce a verified session.")
    return {"id": result["user"]["id"], "name": display, "email": email, "password": password, "access_token": result["access_token"]}


def login(page, member):
    page.goto(APP + "/?qa=" + run)
    page.get_by_role("link", name="Sign in", exact=True).click()
    page.get_by_placeholder("Enter your email", exact=True).fill(member["email"])
    page.get_by_placeholder("Enter your password", exact=True).fill(member["password"])
    page.get_by_role("button", name="Sign In", exact=True).click()
    expect(page.get_by_role("button", name="Sign out", exact=True)).to_be_visible()


def send(page, sender, receiver):
    page.get_by_role("link", name="Debate with a friend", exact=True).click()
    with page.expect_response(lambda res: res.request.method == "POST" and
                              res.url.endswith("/rpc/search_debate_partners") and
                              res.request.post_data_json.get("p_query") == receiver["name"]) as lookup:
        page.get_by_label("Search for users").fill(receiver["name"])
    assert lookup.value.ok and lookup.value.json() == [], "A QA member is visible in friend search"
    expect(page.get_by_text("No users found", exact=True)).to_be_visible()

    # Start the private fixture invitation by ID. Its recipient is intentionally undiscoverable.
    request = Request(API + "/rest/v1/rpc/dk_invite_friend", data=json.dumps({
        "p_receiver": receiver["id"]
    }).encode(), headers={"apikey": public_key, "Authorization": "Bearer " + sender["access_token"],
                          "Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        invitation = UUID(json.load(response))
    page.goto(f"{APP}/debate/start?mode=friend&waiting={invitation}")
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


def capture(page, name):
    if not SCREENSHOTS:
        return
    shot = page.screenshot(type="jpeg", quality=72, animations="disabled", timeout=15000)
    if SCREENSHOTS == "logs":
        encoded = base64.b64encode(shot).decode()
        for offset in range(0, len(encoded), 6000):
            print(f"DKFRIEND_{name} {offset} {encoded[offset:offset + 6000]}", flush=True)
        return
    directory = Path(SCREENSHOTS)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / (name + ".jpg")).write_bytes(shot)


def button(page, name):
    return page.get_by_role("button", name=name, exact=isinstance(name, str))


def simultaneous(*buttons):
    for control in buttons:
        expect(control).to_be_enabled()
    start = int(time.time() * 1000) + 450
    for control in buttons:
        control.evaluate("(control, start) => {setTimeout(() => control.click(), Math.max(0, start-Date.now()));}", start)


def resume_from_table(page, room, topic):
    page.get_by_role("link", name="Profile", exact=True).click()
    activity = page.get_by_role("region", name="Your activity")
    activity.get_by_role("link", name=re.compile(re.escape(topic) + r"|Friend debate(?: session)?", re.I)).first.click()
    button_or_link = page.get_by_role("link", name=re.compile(r"^Resume (friend )?debate$", re.I))
    button_or_link.click()
    page.wait_for_url(re.compile(r"/debate/active\?"), timeout=30000)
    assert session(page) == room


def argument(page, index):
    return page.get_by_role("region", name=f"Point {index} of 10", exact=True)


def topic_to_suggest(page):
    return page.get_by_label("Topic to suggest", exact=True).or_(
        page.get_by_placeholder(re.compile(r"Enter your debate topic|Write a topic|Enter a question to debate", re.I))
    )


def check_rankings_and_poster(pages, expected_titles):
    exports, posters, dimensions = [], [], []
    for index, page in enumerate(pages):
        side = "desktop" if index == 0 else "mobile"
        expect(page.get_by_role("heading", name="Final AI rankings", exact=True)).to_be_visible(timeout=720000)
        expect(page.get_by_role("heading", name="Final AI rankings", exact=True)).to_have_count(1)
        expect(page.get_by_role("heading", name="Final AI rankings", exact=True)).to_be_in_viewport()
        expect(page.get_by_text("20 of 20 points submitted", exact=True)).to_be_visible()
        expect(page.locator(".dk-active-header")).not_to_contain_text("50% Complete")
        capture(page, "11-" + side + "-rankings")
        with page.expect_download() as download:
            button(page, "Download rankings").click()
        rankings = json.loads(Path(download.value.path()).read_text())
        records = rankings["ranking"]
        assert sorted(row["rank"] for row in records) == list(range(1, 21))
        assert len({row["id"] for row in records}) == 20
        assert {row["title"] for row in records} == set(expected_titles)
        exports.append(rankings)
        if button(page, "View infographic").is_visible():
            button(page, "View infographic").click()
        expect(page.locator("svg [data-label]")).to_have_count(20, timeout=210000)
        labels = page.locator("svg [data-label]").evaluate_all("(nodes) => nodes.map(node => node.textContent.trim())")
        assert len(set(labels)) == 20
        capture(page, "12-" + side + "-poster")
        with page.expect_download() as download:
            button(page, "Download PNG").click()
        png = Path(download.value.path()).read_bytes()
        assert png[:8] == b"\x89PNG\r\n\x1a\n"
        size = struct.unpack(">II", png[16:24])
        assert size in {(6400, 3600), (4480, 2520)}, size
        dimensions.append(size)
        posters.append(png)
    assert exports[0] == exports[1]
    assert dimensions[0] == dimensions[1]
    assert posters[0] == posters[1]
    check(f"Both accounts exported all 20 original points in the same rank order and an identical {dimensions[0][0]} by {dimensions[0][1]} PNG")


def check_positions_and_arguments(sender, receiver, room, topic):
    pages = (sender, receiver)
    positions = ("Buy a planned gift early when the price meets your target", "Wait for Friday and compare the price history first")
    for page, position in zip(pages, positions):
        page.get_by_role("textbox", name="Your position", exact=True).fill(position)
    capture(sender, "07-desktop-write-view")
    simultaneous(*(button(page, re.compile(r"^(Save my view|Submit Position)$", re.I)) for page in pages))
    for index, page in enumerate(pages):
        expect(page.get_by_role("textbox", name="Your position", exact=True)).to_have_value(positions[index])
        expect(page.get_by_role("textbox", name=re.compile(r" (position|view)$", re.I)).last).to_have_value(positions[1-index])
    check("Both views saved without one replacing the other")
    capture(receiver, "08-mobile-both-views")
    receiver.reload()
    for index, page in enumerate(pages):
        expect(page.get_by_role("textbox", name="Your position", exact=True)).to_have_value(positions[index])
    simultaneous(*(button(page, re.compile(r"^(Ready to write points|Ready for Counter Arguments|I.m ready)$", re.I)) for page in pages))
    for side, page in zip(("desktop", "mobile"), pages):
        try:
            expect(argument(page, 1)).to_be_visible(timeout=35000)
        except AssertionError:
            capture(page, "09-" + side + "-waiting-for-points")
            print(side, "headings:", page.get_by_role("heading").all_text_contents(), flush=True)
            raise
    receiver.evaluate("window.scrollTo(0, 0)")
    expect(receiver.get_by_role("link", name="Debate with a friend", exact=True)).to_be_in_viewport()
    expect(argument(receiver, 1).get_by_role("heading", name="Point 1 of 10", exact=True)).to_be_in_viewport()
    assert receiver.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    expect(receiver.locator(".dk-friend-points form")).to_have_count(1)
    capture(receiver, "09-mobile-writing-points")
    capture(sender, "09-desktop-write-points")
    subjects = [["Set a target price","Reserve the right model","Make time for delivery","Compare current offers","Use a price adjustment","Avoid wasted searching","Test the gift early","Spread out purchases","Choose local pickup","Stick to the list"],["Check the price history","Wait for scheduled drops","Check the model number","Count the full cost","Skip artificial urgency","Set a price alert","Read return terms","Compare refurbished stock","Wait for the wishlist","Keep the cash"]]
    descriptions = [["If the price drops below the amount I wrote down before the sale, I can buy the gift inside my budget.","I want the exact size or model on my list. Waiting could leave me with a substitute the recipient cannot use.","An early order leaves time to fix a missed delivery before the family exchanges gifts.","I can compare the same model across stores today and buy if the total already looks fair.","If the store gives a written holiday price adjustment, I can buy now and request the difference if it drops.","Once I find a price I would happily pay, another evening of deal hunting has a cost of its own.","Buying ahead leaves time to check that the item works and exchange it if something is missing.","An early sale lets me time a planned purchase to my budget instead of paying for every gift on one day.","A confirmed pickup nearby can avoid a shipping fee and a last-minute trip.","I can close the shopping app after buying the item I planned. Fewer visits mean fewer impulse buys."],["A crossed-out price can exaggerate the saving. I would compare the exact item's recent price before buying.","Some stores announce additional deals for Friday. I can wait if my item is easy to replace.","Two similar-looking TVs can have different features. I want time to compare the exact models.","A membership fee, shipping charge or required bundle can wipe out an apparent saving.","A countdown on a product page gives me no new information about how much the item is worth.","An alert can tell me when the price crosses my target while I spend the weekend doing something else.","A narrow return window might end before the gift is opened. I want to know that before I buy.","A refurbished version with a warranty might beat the sale price even after Black Friday.","Buying before the recipient settles on a gift could lead to an unnecessary purchase.","The best outcome might be skipping the purchase. Waiting a few days gives me time to decide."]]
    future = receiver.locator(".dk-friend-points details").filter(has_text="Draft a later point")
    future.locator("summary").click()
    future.get_by_label("Point to draft").select_option(label="Point 2")
    future.get_by_label("Title", exact=True).fill(subjects[1][1])
    future.get_by_label("Explanation", exact=True).fill(descriptions[1][1])
    capture(receiver, "09a-mobile-draft-ahead")
    future.locator("summary").click()
    focused = argument(receiver, 1).get_by_label("Title", exact=True)
    focused.fill(subjects[1][0])
    scroll_before = receiver.evaluate("window.scrollY")
    chat = "I can still see where to write my point."
    sender.get_by_placeholder("Type your message...", exact=True).fill(chat)
    button(sender, "Send message").click()
    expect(receiver.get_by_text(chat, exact=True)).to_be_attached(timeout=20000)
    expect(focused).to_be_focused()
    assert abs(receiver.evaluate("window.scrollY") - scroll_before) < 4
    check("A live chat update left the phone's writing field focused and in place")
    full = os.getenv("DK_TEST_RANKING") == "1"
    for index in range(1, 11 if full else 3):
        for side, page in enumerate(pages):
            card = argument(page, index)
            title = card.get_by_label("Title", exact=True)
            explanation = card.get_by_label("Explanation", exact=True)
            if index == 2 and side == 1:
                expect(title).to_have_value(subjects[side][index-1])
                expect(explanation).to_have_value(descriptions[side][index-1])
                check("Drafting ahead survived refresh and the draft opened as the next point")
            else:
                title.fill(subjects[side][index-1])
                explanation.fill(descriptions[side][index-1])
        if index == 1:
            receiver.reload()
            expect(argument(receiver, index).get_by_label("Title", exact=True)).to_have_value(subjects[1][index-1])
        simultaneous(*(button(argument(page, index), f"Submit point {index}") for page in pages))
        for page in pages:
            heading = f"Point {index+1} of 10" if index < 10 else "All 10 points submitted"
            expect(page.get_by_role("heading", name=heading, exact=True)).to_be_visible()
        if index == 2:
            resume_from_table(receiver, room, topic)
            expect(argument(receiver, 3)).to_be_visible()
            receiver.get_by_text("Review submitted points (2)", exact=True).click()
            for own_index in range(1, 3):
                expect(receiver.get_by_text(subjects[1][own_index-1], exact=True)).to_be_visible()
            expect(receiver.get_by_text("You: 2 of 10 points", exact=True)).to_be_visible()
            expect(receiver.get_by_text("Your friend: 2 of 10 points", exact=True)).to_be_visible()
            capture(receiver, "10-mobile-resumed-points")
    check("Draft and submitted points survived refresh or returning from Your table, with both accounts retaining their own text")
    if full:
        check("Both members saved their ten points; confirming both submissions to start live ranking")
        simultaneous(*(button(page, "Confirm my 10 arguments") for page in pages))
        verify_and_publish(pages, subjects[0] + subjects[1], topic)



def verify_and_publish(pages, titles, topic):
    ranked = []
    for page in pages:
        expect(page.get_by_role("heading",name="Final AI rankings",exact=True)).to_be_visible(timeout=640000)
        with page.expect_download() as download:
            button(page, "Download rankings").click()
        ranking = json.loads(Path(download.value.path()).read_text())["ranking"]
        assert len({x["id"] for x in ranking}) == 20
        assert sorted(x["rank"] for x in ranking) == list(range(1,21))
        assert sorted(x["title"] for x in ranking) == sorted(titles)
        ranked.append(ranking)
    assert ranked[0] == ranked[1]
    capture(pages[0], "04-desktop-rankings")
    check("20 original points match in both friends' ranked exports")
    sender, reader = pages
    if button(sender, "View infographic").is_visible():
        button(sender, "View infographic").click()
    expect(sender.locator("svg [data-label]")).to_have_count(20, timeout=240000)
    capture(sender, "05-desktop-poster")
    with sender.expect_download() as dl:
        button(sender, "Download PNG").click()
    png = Path(dl.value.path()).read_bytes()
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    check("PNG export " + str(struct.unpack(">II",png[16:24])))
    publish = button(sender,re.compile(r"^Publish infographic"))
    expect(publish).to_be_visible(timeout=45000)
    publish.click()
    expect(button(sender,"Make private")).to_be_visible(timeout=45000)
    check("Member published the finished poster")
    reader.get_by_role("link",name="Home",exact=True).click()
    for order in ("Latest", "Trending"):
        reader.get_by_role("link",name=order,exact=True).click()
        card=reader.get_by_role("article").filter(has=reader.get_by_role("heading",name=topic,exact=True))
        expect(card).to_have_count(1)
        card.scroll_into_view_if_needed()
        capture(reader, "06-mobile-"+order.lower())
    social=card.get_by_role("button",name=re.compile("^Like"))
    social.click()
    expect(social).to_have_attribute("aria-pressed","true")
    social.click()
    expect(social).to_have_attribute("aria-pressed","false")
    social.click()
    expect(social).to_have_attribute("aria-pressed","true")
    card.get_by_role("button",name=re.compile("^Comments")).click()
    comment="QA discussion: I would buy early if the exact model hits my target price. Shipping and the return window would decide it for me."
    reader.get_by_label("Add a public comment",exact=True).fill(comment)
    button(reader,"Post comment").click()
    expect(reader.get_by_text(comment,exact=True)).to_be_visible(timeout=50000)
    reader.reload()
    expect(reader.get_by_text(comment,exact=True)).to_be_visible()
    capture(reader,"07-mobile-persisted-comment")
    check("Latest, Trending, like/unlike/re-like and a moderated comment after reload")
    print("PUBLIC_RESULT", reader.url, flush=True)

if __name__ == "__main__":
    os.environ["DK_TEST_RANKING"]="1"
    expect.set_options(timeout=25000)
    with ExitStack() as stack:
        pw=stack.enter_context(sync_playwright())
        pages=[]
        for width in (1280,390):
            browser=pw.chromium.launch(executable_path=shutil.which("google-chrome"))
            stack.callback(browser.close)
            pages.append(browser.new_page(viewport={"width":width,"height":850}))
        sender,receiver=pages
        try:
            a,b=create_member("Sender"),create_member("Receiver")
            login(sender,a)
            login(receiver,b)
            sender.get_by_role("link",name="Debate with a friend",exact=True).click()
            button(sender,"Create invitation link").click()
            invitation=sender.get_by_label("Invitation link",exact=True).input_value()
            receiver.goto(invitation)
            button(receiver,"Accept invitation").click()
            expect(topic_to_suggest(receiver)).to_be_visible()
            room=session(receiver)
            alert=sender.get_by_role("dialog")
            if alert.is_visible() or sender.get_by_role("button",name=re.compile("Notifications")).is_visible():
                try:
                    button(alert,re.compile(r"^(Open debate|Join session)$",re.I)).click(timeout=10000)
                except Exception:
                    sender.get_by_role("button",name=re.compile("Notifications")).click()
                    button(sender.get_by_role("dialog"),re.compile(r"^(Open debate|Join session)$",re.I)).first.click()
            expect(topic_to_suggest(sender)).to_be_visible()
            assert session(sender)==room
            check("Single-use invite brought both signed-in friends to the same room")
            print("ROOM",room,flush=True)
            topic="Black Friday: buy a good deal now or wait until Friday?"
            receiver.get_by_placeholder(re.compile(r"^(Type|Write) a message",re.I)).fill("Article for our debate: https://www.the-sun.com/money/17329611/black-friday-pre-inflated-prices-trick-exposed/")
            button(receiver,"Send message").click()
            topic_to_suggest(receiver).fill(topic)
            button(receiver,re.compile(r"^(Propose|Suggest topic)$",re.I)).click()
            expect(sender.get_by_text(topic,exact=True)).to_be_visible()
            capture(sender,"01-desktop-friend-proposal")
            button(sender,re.compile(r"^Accept Topic$",re.I)).click()
            for page in pages:
                expect(page.get_by_role("textbox",name="Your position",exact=True)).to_be_visible()
            check_positions_and_arguments(sender,receiver,room,topic)
        except Exception:
            for i,page in enumerate(pages):
                print("SCREEN", i, urlparse(page.url).path, page.get_by_role("heading").all_text_contents(),page.get_by_role("button").all_text_contents()[-25:],flush=True)
                capture(page, "failure-"+str(i))
            raise
