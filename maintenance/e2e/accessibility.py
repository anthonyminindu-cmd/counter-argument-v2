"""Read-only accessibility checks. Set DK_TEST_URL and AXE_JS (axe-core 4.14.1).
Requires Python Playwright with Chromium. DK_CHROME can select a system browser.
DK_STORAGE_STATE optionally adds signed-in pages using a local Playwright session.
"""
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

SITE = os.environ["DK_TEST_URL"].rstrip("/")
AXE = str(Path(os.environ["AXE_JS"]).resolve(strict=True))
PUBLIC = ["/", "/home/?view=feed", "/home/?view=feed&example=ai-data-centers",
          "/home/?commenter=person-033", "/login/", "/reset-password/",
          "/missing-page", "/demo/school-start-times/"]
MEMBER = ["/profile/", "/profile/?section=friends", "/profile/?section=comments",
          "/profile/?section=work", "/profile/?tab=account", "/settings/",
          "/debate/start/?mode=friend", "/debate/start/?mode=ai", "/debate/topic/?mode=ai"]
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]


def scan(page, label, modal=False):
    page.add_script_tag(path=AXE)
    findings = page.evaluate("""async tags => {
      const {violations} = await axe.run(document, {runOnly: {type: 'tag', values: tags}});
      return violations.map(v => [v.id, v.nodes.map(n=>n.target)]);
    }""", TAGS)
    assert not findings, (label, findings)
    if not modal:
        expect(page.get_by_role("main")).to_have_count(1)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), label


def check_routes(browser, width, theme, session=None):
    context = browser.new_context(viewport={"width": width, "height": 800}, storage_state=session)
    context.add_init_script(
        f"localStorage.setItem('debateai-settings',JSON.stringify({{theme:'{theme}'}}))")
    page = context.new_page()
    for route in MEMBER if session else PUBLIC:
        page.goto(SITE + route)
        page.get_by_role("heading", level=1).first.wait_for()
        if "example=" in route:
            page.locator(".dk-point-title").first.wait_for()
        scan(page, (route, width, theme))
    if not session:
        page.goto(SITE + "/login/")
        skip = page.get_by_role("link", name="Skip to main content")
        skip.wait_for()
        page.keyboard.press("Tab")
        expect(skip).to_be_focused()
        page.keyboard.press("Enter")
        expect(page.get_by_role("main")).to_be_focused()
        page.goto(SITE + "/home/?view=feed")
        share = page.get_by_role("button", name="Share", exact=True).first
        share.focus()
        page.keyboard.press("Enter")
        expect(page.get_by_role("dialog")).to_be_visible()
        scan(page, ("Share dialog", width, theme), modal=True)
        page.keyboard.press("Escape")
        expect(share).to_be_focused()
    context.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv("DK_CHROME"))
        for size in (320, 1280):
            for mode in ("light", "dark"):
                check_routes(browser, size, mode)
                if os.getenv("DK_STORAGE_STATE"):
                    check_routes(browser, size, mode, os.environ["DK_STORAGE_STATE"])
        browser.close()
    print("Accessibility scans and keyboard checks passed.")
