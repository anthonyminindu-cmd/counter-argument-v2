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
    return {"id": result["user"]["id"], "name": display, "email": email, "password": password}


def login(page, member):
    page.goto(APP + "/?qa=" + run)
    page.get_by_role("link", name="Sign in", exact=True).click()
    page.get_by_placeholder("Enter your email", exact=True).fill(member["email"])
    page.get_by_placeholder("Enter your password", exact=True).fill(member["password"])
    page.get_by_role("button", name="Sign In", exact=True).click()
    expect(page.get_by_role("button", name="Sign out", exact=True)).to_be_visible()


def send(page, member):
    page.get_by_role("link", name="Debate with a friend", exact=True).click()
    page.get_by_label("Search for users").fill(member["name"])
    expect(page.get_by_text(member["name"], exact=True).first).to_be_visible()
    page.get_by_role("button", name=re.compile(r"^(Send invitation|Invite)$", re.I)).click()
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
    positions = ("Lend repair kits on a trial basis", "Keep the lending collection focused on books")
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
    subjects = (
        ("Lower repair costs", "Keep bicycles usable", "Support library workshops", "Offer short loans",
         "Reach infrequent riders", "Use existing lending desks", "Teach basic maintenance",
         "Reuse durable tools", "Measure pilot demand", "Help nearby commuters"),
        ("Protect staff time", "Budget for replacements", "Maintain tool condition", "Handle missing parts",
         "Preserve book budgets", "Avoid duplicate services", "Keep instructions current",
         "Store kits securely", "Check return quality", "Assess local demand"),
    )
    descriptions = (
        ("Riders could borrow tools for minor adjustments instead of buying a kit they rarely use.",
         "Keeping tires in good working order makes an existing bicycle more useful.",
         "A workshop could pair hands-on instruction with a short kit loan.",
         "A short loan period could serve several borrowers with the same tools.",
         "Occasional cyclists could borrow a wrench without paying for a full kit.",
         "Library staff could use the same checkout desk for compact tool kits.",
         "First-time borrowers could follow a guide to patch a tire or adjust a loose seat.",
         "Durable hand tools can support many loans when staff inspect the kit.",
         "A limited pilot would show whether residents actually borrow the kits.",
         "A borrower could use a tire pump to keep a short commute on schedule."),
        ("Checking for missing parts takes staff time away from reader services.",
         "The library budget should cover replacing lost tools.",
         "Staff may need to inspect worn wrenches and damaged pumps before each new loan.",
         "The library needs a plan for restocking tire patches after each loan.",
         "New kit purchases could compete with the library's book budget.",
         "An existing bicycle shop partnership may already provide free tools.",
         "Instructions should cover common fittings and change whenever kits do.",
         "A busy branch needs secure storage outside its crowded returns desk.",
         "A return checklist could prevent damaged tools from going back into use.",
         "A rider survey could prevent the library from buying rarely used kits."),
    )
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
        check_rankings_and_poster(pages, subjects[0] + subjects[1])


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
        capture(sender, "01-desktop-invitation-sent")
        alert = await_popup(receiver,a["name"])
        capture(receiver, "02-mobile-live-invitation")
        alert.get_by_role("button",name="Close",exact=True).click()
        receiver.get_by_role("button",name="Notifications, 1 unread",exact=True).click()
        receiver.get_by_role("dialog").get_by_role("button",name="Decline",exact=True).click()
        expect(sender.get_by_role("heading",name=b["name"]+" declined")).to_be_visible(timeout=30000)
        check("Online delivery in Latest, inbox badge, decline, sender acknowledgement")
        if sender.get_by_role("dialog").is_visible():
            sender.get_by_role("dialog").get_by_role("button",name="Close",exact=True).click()
        sender.get_by_role("link",name="Home",exact=True).click()
        expect(sender.get_by_role("region",name="Your activity").get_by_text(
            re.compile(r"^(cancelled|Invitation closed)$",re.I))).to_be_visible()
        check("Declined invitation closed the waiting debate in the sender's table")
        receiver.get_by_role("button",name="Sign out",exact=True).click()
        expect(receiver.get_by_role("link",name="Sign in",exact=True)).to_be_visible()
        send(sender,b)
        login(receiver,b)
        alert=await_popup(receiver,a["name"])
        capture(receiver, "03-mobile-invitation-after-sign-in")
        alert.get_by_role("button",name="Accept invitation",exact=True).click()
        for page in (sender,receiver):
            page.wait_for_url(re.compile(r'/debate/topic\??[^#]*session='),timeout=35000)
            expect(topic_to_suggest(page)).to_be_visible()
        room=session(sender)
        assert room==session(receiver)
        check("Offline invitation appeared on login and both browsers joined the same session")
        check_friend_topic_recovery(receiver, APP, room, capture)
        capture(sender, "04-desktop-pick-topic")
        chat_field = re.compile(r"^(Type|Write) a message", re.I)
        suggest = re.compile(r"^(Propose|Suggest topic)$", re.I)
        chat = "I can see our shared table."
        first_question = "Should the library open earlier?"
        receiver.get_by_placeholder(chat_field).fill(chat)
        topic_to_suggest(sender).fill(first_question)
        simultaneous(button(receiver,"Send message"), button(sender,suggest))
        for page in (sender,receiver):
            expect(page.get_by_text(chat,exact=True)).to_be_visible()
            expect(page.get_by_text(first_question,exact=True)).to_be_visible()
        check("Sending a chat message while suggesting a topic preserved both changes")
        button(receiver,re.compile(r"^(Decline|Suggest another topic|Choose another topic)$", re.I)).click()
        for page in (sender,receiver):
            expect(topic_to_suggest(page)).to_be_visible()
        check("Declining a topic cleared it for both members")
        topic="Should libraries share repair tools?"
        topic_to_suggest(receiver).fill(topic)
        button(receiver,suggest).click()
        expect(receiver.get_by_text(topic,exact=True)).to_be_visible()
        capture(receiver, "05-mobile-wait-for-topic")
        sender.reload()
        expect(sender.get_by_text(topic,exact=True)).to_be_visible(timeout=30000)
        accept_topic=button(sender,re.compile(r"^Accept Topic$", re.I))
        expect(accept_topic).to_be_visible()
        capture(sender, "06-desktop-review-topic")
        accept_topic.click()
        for page in (sender,receiver):
            page.wait_for_url(re.compile(r'/debate/active\?'),timeout=35000)
            expect(page.get_by_role("textbox",name="Your position",exact=True)).to_be_visible(timeout=30000)
            assert session(page)==room
            assert parse_qs(urlparse(page.url).query)["topic"]==[topic]
        check("Topic persisted through refresh and both accounts advanced with the same agreed topic")
        check_positions_and_arguments(sender, receiver, room, topic)
        # Both accounts have already used the automatic handoff while waiting.
        # Here the sender keeps browsing after sending another invitation.
        send(sender, b)
        sender.get_by_role("link", name="Feed", exact=True).click()
        expect(sender.get_by_role("heading", name="Trending", exact=True)).to_be_visible()
        await_popup(receiver, a["name"]).get_by_role("button", name="Accept invitation", exact=True).click()
        alert = sender.get_by_role("dialog")
        expect(alert.get_by_text(b["name"] + " accepted your invitation", exact=True)).to_be_visible(timeout=30000)
        assert parse_qs(urlparse(sender.url).query).get("view") == ["feed"]
        capture(sender, "13-desktop-acceptance-while-browsing")
        button(alert, re.compile(r"^(Open debate|Join session)$", re.I)).click()
        for page in (sender, receiver):
            page.wait_for_url(re.compile(r"/debate/topic\??[^#]*session="), timeout=30000)
        assert session(sender) == session(receiver) != room
        check("The sender stayed on the feed until opening the acceptance notice, then joined the same new debate")
