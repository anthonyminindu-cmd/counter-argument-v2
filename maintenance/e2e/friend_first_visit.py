"""Two isolated first-time members go from a shared invitation to a private result."""
import re
import secrets
import shutil
from contextlib import ExitStack
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from friend_live import APP, argument, button, check, check_positions_and_arguments, run, session, topic_to_suggest


def sign_up(page, role):
    page.get_by_role("tab", name="Sign Up", exact=True).click()
    form = page.locator("form").filter(has=page.locator("#confirmPassword"))
    password = "Xy9!" + secrets.token_urlsafe(20)
    form.locator("[name=displayName]").fill("InboxQA" + run + role)
    form.locator("[name=signupEmail]").fill(f"dk-invite-e2e-{run}-{role.lower()}@example.com")
    form.locator("[name=signupPassword]").fill(password)
    form.locator("[name=confirmPassword]").fill(password)
    for box in form.get_by_role("checkbox").all():
        box.check()
    button(form, "Create Account").click()


def run_flow():
    with ExitStack() as stack:
        pw = stack.enter_context(sync_playwright())
        browser = pw.chromium.launch(executable_path=shutil.which("google-chrome") or shutil.which("chromium"))
        stack.callback(browser.close)
        def seat(width):
            context = browser.new_context(viewport={"width": width, "height": 850})
            page = context.new_page()
            page.set_default_timeout(15000)
            return page
        host, guest = seat(1180), seat(390)
        host.goto(APP)
        host.get_by_role("link", name="Debate with a friend", exact=True).first.click()
        sign_up(host, "Sender")
        create = button(host, "Create invitation link")
        expect(create).to_be_visible(timeout=30000)
        create.click()
        invite = host.get_by_role("textbox", name="Invitation link")
        expect(invite).to_be_visible()
        url = invite.input_value()
        assert urlparse(url).netloc == urlparse(APP).netloc
        guest.goto(url)
        guest.get_by_role("link", name="Sign in or create an account").click()
        sign_up(guest, "Receiver")
        accept = button(guest, "Accept invitation")
        expect(accept).to_be_visible(timeout=30000)
        accept.click()
        expect(topic_to_suggest(guest)).to_be_visible(timeout=30000)
        opened = host.get_by_role("dialog").get_by_role("button", name="Open debate")
        expect(opened).to_be_visible(timeout=30000)
        opened.click()
        expect(topic_to_suggest(host)).to_be_visible()
        room = session(host)
        assert session(guest) == room
        check("Two first-time email signups kept their destinations; the phone accepted the shared link and the host opened the same room")
        question = "Should libraries share repair tools?"
        topic_to_suggest(guest).fill(question)
        button(guest, re.compile(r"^(Propose|Suggest topic)$", re.I)).click()
        host.reload()
        button(host, re.compile(r"^Accept Topic$", re.I)).click()
        for page in (host, guest):
            expect(page.get_by_role("textbox", name="Your position", exact=True)).to_be_visible(timeout=35000)
        button(host, "Request private debate").click()
        guest.reload()
        button(guest, "Acknowledge and make private").click()
        for page in (host, guest):
            expect(page.get_by_text("Private debate", exact=True).first).to_be_visible(timeout=35000)
        check("Both sides agreed on the topic and confirmed private visibility before submitting")
        check_positions_and_arguments(host, guest, room, question)


if __name__ == "__main__":
    run_flow()
