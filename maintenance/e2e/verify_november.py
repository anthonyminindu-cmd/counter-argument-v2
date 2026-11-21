import base64
import json
import math
import shutil
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect

root = Path.cwd()
entries = json.loads((root/'demo/november-2026/edition.json').read_text())
assert len(entries) == 10

def screenshot(page, tag):
    data = base64.b64encode(page.screenshot(type='jpeg', quality=78)).decode()
    for i in range(0, len(data), 4500):
        print(f'NOVSHOT_{tag} {i} {data[i:i+4500]}', flush=True)

with TemporaryDirectory() as temp, sync_playwright() as pw:
    Path(temp,'counter-argument-v2').symlink_to(root,target_is_directory=True)
    http = ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=temp))
    threading.Thread(target=http.serve_forever,daemon=True).start()
    site = f'http://127.0.0.1:{http.server_port}/counter-argument-v2'
    browser = pw.chromium.launch(executable_path=shutil.which('google-chrome'))
    page = browser.new_page(accept_downloads=True,viewport={'width':1280,'height':930})
    page.set_default_timeout(15000)
    page.goto(site+'/')
    region = page.get_by_role('region',name='In the news this month')
    expect(region.get_by_text('Example debates · By Differ Kindly')).to_be_visible()
    expect(page.get_by_role('heading',name='Community feed')).to_be_visible()
    expect(region.get_by_role('link',name='See all ten')).to_be_visible()
    page.locator('.dk-example-link img').first.evaluate('i=>i.decode()')
    screenshot(page,'home')
    region.get_by_role('link',name='See all ten').click()
    expect(page.get_by_role('heading',level=1,name='In the news this month')).to_be_visible()
    expect(page.locator('.dk-example-card')).to_have_count(10)
    vector=browser.new_page()
    for entry in entries:
        page.get_by_role('link',name=entry['question'],exact=False).click()
        expect(page.get_by_role('heading',level=1,name=entry['question'],exact=True)).to_be_visible()
        expect(page.get_by_text('Example debate · By Differ Kindly')).to_be_visible()
        expect(page.locator('.dk-example-positions li')).to_have_count(20)
        expect(page.locator('.dk-example-discussion li')).to_have_count(3)
        expect(page.locator('.dk-example-sources a')).to_have_count(len(entry['sources']))
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        image=page.locator('.dk-example-figure img')
        assert image.evaluate("async i=>{await i.decode();return i.naturalWidth===1600&&i.naturalHeight===900}")
        vector.goto(site+'/demo/november-2026/'+entry['id']+'.svg')
        points=vector.locator('[data-argument-id]')
        expect(points).to_have_count(20)
        expect(vector.locator('[data-core-pieces][clip-path] [data-piece-rank]')).to_have_count(8)
        ranks=points.evaluate_all("nodes=>nodes.map(n=>Number(n.getAttribute('data-rank')))")
        assert ranks==list(range(1,21)),ranks
        errors=vector.locator('[data-label]').evaluate_all("""nodes=>nodes.flatMap(n=>{
          const {left,right,top,bottom}=n.dataset, b=n.getBBox();
          const m=n.previousElementSibling.getBBox();
          const p=1.9;
          return b.width<=0||b.height<=0||b.x<Number(left)-p||b.x+b.width>Number(right)+p||
            b.y<Number(top)-p||b.y+b.height>Number(bottom)+p||m.y+m.height>b.y+p
            ? [[n.textContent,{x:b.x,y:b.y,w:b.width,h:b.height},[left,right,top,bottom],m.y+m.height]]:[];
        })""")
        assert not errors,(entry['id'],errors)
        if entry is entries[0]:
            nav=page.get_by_role('link',name='Debate this with a friend')
            assert 'suggested%3D' in nav.get_attribute('href')
            with page.expect_download() as download:
                page.get_by_role('button',name='Download PNG').click()
            data=Path(download.value.path()).read_bytes()
            assert data[16:24]==(3200).to_bytes(4,'big')+(1800).to_bytes(4,'big')
        page.get_by_role('link',name='All November debates').click()
        expect(page.locator('.dk-example-card')).to_have_count(10)

    for w in (390,320):
        page.set_viewport_size({'width':w,'height':775})
        page.get_by_role('link',name='Home',exact=True).click()
        expect(page.get_by_role('heading',name='Pull up a chair.')).to_be_visible()
        expect(page.get_by_role('region',name='In the news this month')).to_be_visible()
        expect(page.get_by_role('link',name='Trending topics')).to_be_in_viewport()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.get_by_role('link',name='Trending topics').click()
        expect(page.get_by_role('region',name='In the news this month')).to_be_visible()
        page.get_by_role('link',name='Latest',exact=True).click()
        expect(page.get_by_role('region',name='In the news this month')).to_have_count(0)
        page.get_by_role('link',name='Home',exact=True).click()
        page.locator('.dk-example-link').first.click()
        expect(page.get_by_role('heading',name=entries[0]['question'],exact=True)).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await_problem = page.locator('.dk-example-figure img').evaluate("i=>i.decode().then(()=>false,()=>true)")
        assert not await_problem
        if w==390:screenshot(page,'phone')
    print('Verified ten examples, all poster labels, 3200×1800 PNG, and desktop and mobile navigation.',flush=True)
    browser.close()
    http.shutdown()
