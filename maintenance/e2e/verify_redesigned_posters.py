import json
import shutil
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect

root = Path.cwd()
edition = root/'demo/november-2026'
entries = json.loads((edition/'edition.json').read_text())
assert len(entries)==10

def trending_cards(page):
    feed=page.get_by_role('region', name='Community feed')
    expect(feed.get_by_role('link', name='Trending', exact=True)).to_have_attribute('aria-current','page')
    expect(feed.locator('.dk-example-card')).to_have_count(10)
    expect(page.get_by_text('In the news this month',exact=True)).to_have_count(0)
    return feed

with TemporaryDirectory() as temp, sync_playwright() as pw:
    Path(temp,'counter-argument-v2').symlink_to(root,target_is_directory=True)
    http = ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=temp))
    threading.Thread(target=http.serve_forever,daemon=True).start()
    site = f'http://127.0.0.1:{http.server_port}/counter-argument-v2'
    browser = pw.chromium.launch(executable_path=shutil.which('google-chrome'))
    page = browser.new_page(viewport={'width':1280,'height':930},accept_downloads=True)
    page.set_default_timeout(15000)
    page.goto(site+'/')
    trending_cards(page)
    page.get_by_role('link',name='Trending topics',exact=True).click()
    feed=trending_cards(page)
    vector_page=browser.new_page()
    for index,entry in enumerate(entries):
        feed.get_by_role('link',name=entry['question'], exact=False).click()
        expect(page.get_by_role('heading',name=entry['question'],exact=True)).to_be_visible()
        image=page.locator('.dk-example-figure img')
        assert image.evaluate("async i=>{await i.decode();return i.naturalWidth===1600&&i.naturalHeight===900}")
        vector=page.evaluate("""async () => {
            const url=document.querySelector(".dk-example-figure img").src;
            const svg=new DOMParser().parseFromString(await (await fetch(url)).text(),"image/svg+xml");
            return Array.from(svg.querySelectorAll("[data-rank]"), node=>[Number(node.dataset.rank),node.querySelector("title").textContent]);
        }""")
        vector_page.goto(site+'/demo/november-2026/'+entry['id']+'.svg')
        expect(vector_page.locator('[data-main-subject]')).to_have_count(1)
        expect(vector_page.locator('[data-position]')).to_have_count(2)
        expect(vector_page.locator('[data-core-pieces] [data-piece-rank]')).to_have_count(8)
        expect(vector_page.locator('[data-attached-pieces] [data-piece-rank]')).to_have_count(12)
        boxes=vector_page.locator('[data-rank]').evaluate_all('''nodes=>{
            const outline=document.querySelector('[data-main-subject]');
            const inverse=outline.getCTM().inverse();
            const lum=rgb=>rgb.match(/[0-9.]+/g).map(Number).slice(0,3).map(n=>n/255)
              .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
              .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
            const errors=[];
            for(const g of nodes) {
              const n=g.querySelector('[data-label]'), rank=g.querySelector('[data-rank-marker]');
              const b=n.getBBox(), a=rank.getBBox(), key=Number(g.dataset.rank), left=g.dataset.side==='left';
              const core=g.dataset.band==='core', piece=document.querySelector('[data-piece-rank="'+key+'"]');
              const fore=lum(getComputedStyle(n).fill), back=lum(getComputedStyle(piece).fill);
              const ratio=(Math.max(fore,back)+.05)/(Math.min(fore,back)+.05);
              if (ratio<7||((key%2===1)!==left)||(left?b.x+b.width>=782:b.x<=818)||a.y+a.height>=b.y+.75
                  || b.x<28||b.x+b.width>1572||b.y<230||b.y+b.height>790||b.width<=0||b.height<=0)
                errors.push({key,reason:"layout",ratio,markBottom:a.y+a.height,left:b.x,top:b.y,right:b.x+b.width,bottom:b.y+b.height});
              if(core){
                for(const x of [b.x,b.x+b.width])
                  for(const y of [b.y,b.y+b.height])
                    if(!outline.isPointInFill(new DOMPoint(x,y).matrixTransform(inverse)))
                      errors.push({key,reason:"outside silhouette",x,y});
              }
            }
            return errors;
        }''')
        assert not boxes,(entry['id'],boxes)
        page.get_by_role('button',name='Read all 20 points').click()
        heading=page.get_by_role('heading',name='All 20 debate points',level=2,exact=True)
        expect(heading).to_be_focused()
        expect(heading).to_be_in_viewport()
        assert heading.evaluate("el=>el.getBoundingClientRect().top>=document.querySelector('.dk-header').getBoundingClientRect().bottom")
        points=page.locator('.dk-example-positions li')
        expect(points).to_have_count(20)
        for i,(label,explanation) in enumerate(entry['arguments']):
            rank=(i%10)*2+i//10+1
            assert vector[rank-1]==[rank,label]
            expect(points.nth(i).locator('h4')).to_have_text('#'+str(rank)+' '+label)
            expect(points.nth(i).locator('p')).to_have_text(explanation)
        expect(page.locator('.dk-example-discussion li')).to_have_count(3)
        if not index:
            with page.expect_download() as pending:
                page.get_by_role('button',name='Download PNG').click()
            raw=Path(pending.value.path()).read_bytes()
            assert raw[16:24]==(3200).to_bytes(4,'big')+(1800).to_bytes(4,'big')
        page.get_by_role('link',name='Back to Trending',exact=True).click()
        feed=trending_cards(page)
    page.goto(site+'/home/?view=feed&edition=november-2026')
    trending_cards(page)
    for width in (768,390,320):
        page.set_viewport_size({'width':width,'height':780})
        page.get_by_role('link',name='Home',exact=True).click()
        expect(page.get_by_role('heading',name='Pull up a chair.')).to_be_visible()
        feed=trending_cards(page)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        feed.get_by_role('link',name='Latest',exact=True).click()
        expect(page.locator('.dk-example-card')).to_have_count(0)
        page.get_by_role('link',name='Trending topics',exact=True).click()
        feed=trending_cards(page)
        feed.get_by_role('link',name=entries[-1]['question'],exact=False).click()
        expect(page.get_by_role('heading',name=entries[-1]['question'],exact=True)).to_be_visible()
        page.get_by_role('button',name='Read all 20 points').click()
        expect(page.get_by_role('heading',name='All 20 debate points',exact=True)).to_be_focused()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    print('Passed 10 centered silhouettes, 200 rank and label checks, text contrast of at least 7:1, PNG export, and navigation on four viewport widths.',flush=True)
    browser.close()
    http.shutdown()
