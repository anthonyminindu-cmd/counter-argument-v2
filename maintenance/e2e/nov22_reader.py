from friend_live import APP, button, capture, check, create_member, login
import os, re, shutil
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
TOPIC="Black Friday: buy a good deal now or wait until Friday?"
SLUG="poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2"
expect.set_options(timeout=30000)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which("google-chrome"))
    desktop=browser.new_page(viewport={"width":1280,"height":820})
    reader=browser.new_page(viewport={"width":390,"height":850})
    member=create_member("Reader")
    login(reader,member)
    try:
        for order, page in (("Latest",desktop),("Trending",desktop)):
            page.goto(APP+"/home/?view=feed&sort="+order.lower())
            card=page.get_by_role("article").filter(has=page.get_by_role("heading",name=TOPIC,exact=True))
            expect(card).to_have_count(1)
            expect(card.get_by_text(re.compile("Includes 8 sample likes and 4 sample comments"))).to_be_visible(timeout=45000)
            card.scroll_into_view_if_needed()
            capture(page,"published-"+order.lower())
            ranks=page.get_by_role("article").get_by_role("heading", level=3).all_text_contents()
            print(order,"position",ranks.index(TOPIC)+1,"of",len(ranks),flush=True)
        url=APP+"/home/?view=feed&example="+SLUG
        reader.goto(url+"&comments=1")
        form=reader.get_by_role("textbox",name=re.compile(r"^Add a public comment"))
        expect(form).to_be_visible()
        text="QA reader: I would compare the exact model and the full delivered price. A written price adjustment would persuade me to buy early."
        form.fill(text)
        reader.route("**/functions/v1/moderate-content",lambda route: None)
        with reader.expect_request(lambda request: request.url.endswith("/functions/v1/moderate-content") and request.method=="POST"):
            button(reader,"Post comment").click()
        reader.reload()
        reader.unroute("**/functions/v1/moderate-content")
        expect(reader.get_by_role("button",name="Sign out",exact=True)).to_be_visible()
        expect(form).to_have_value(text)
        check("An interrupted submission restored the reader's draft on reload")
        button(reader,"Post comment").click()
        expect(reader.get_by_text("Comment posted.",exact=True)).to_be_visible(timeout=50000)
        # Match a persisted reply paragraph; the editable draft is a separate control.
        posted=reader.locator(".dk-replies li p").filter(has_text=text)
        expect(posted).to_have_count(1)
        reader.reload()
        expect(posted).to_have_count(1)
        expect(form).to_have_value("")
        posted.scroll_into_view_if_needed()
        capture(reader,"persisted-reader-comment")
        sample=reader.get_by_role("heading",name="Sample discussion")
        expect(sample).to_be_visible()
        reader.get_by_text("The return window changes my answer.",exact=False).scroll_into_view_if_needed()
        capture(reader,"fictional-community-replies")
        desktop.goto(url)
        friend=desktop.get_by_role("link",name="Debate this with a friend")
        expect(friend).to_be_visible()
        expect(desktop.get_by_text(re.compile("November 22 article on Black Friday pricing"))).to_be_visible()
        reader.goto(url)
        reader.get_by_role("link",name="Debate this with a friend").click()
        expect(reader.get_by_text(TOPIC,exact=True)).to_be_visible()
        check("The public poster included its article and passed its subject into a new friend invitation")
        desktop.goto(url)
        expect(desktop.get_by_role("button",name="Comments · 5")).to_be_visible(timeout=20000)
        check("Four persona comments and one posted member comment reached a signed-out reader")
    except Exception:
        print("HEADINGS",reader.get_by_role("heading").all_text_contents(),flush=True)
        print("READER CONTROLS",reader.get_by_role("button").all_text_contents()[-12:],reader.locator("textarea").count(),reader.locator("textarea").evaluate_all("(xs)=>xs.map(x=>[x.value,x.labels[0]?.innerText])"),flush=True)
        print("ALERTS",reader.get_by_role("alert").all_text_contents(),flush=True)
        capture(reader,"reader-diagnostic")
        raise
    finally:
        browser.close()
