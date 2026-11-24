"""Run the feature against the candidate frontend and a disposable member."""
from contextlib import ExitStack
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
import json, os, secrets, shutil, tempfile, threading
from playwright.sync_api import sync_playwright, expect
from friend_live import API, public_key, login, APP, ROOT

topic='ai-data-centers'
public_url='https://www.differkindly.com/home/?view=feed&example='+topic
run=os.environ['GITHUB_RUN_ID']+'-'+os.environ['GITHUB_RUN_ATTEMPT']
member={'email':'dk-pin-qa-'+run+'@example.com','password':secrets.token_urlsafe(28)}
with ExitStack() as stack:
    folder=Path(stack.enter_context(tempfile.TemporaryDirectory()))
    (folder/'counter-argument-v2').symlink_to(ROOT,target_is_directory=True)
    server=ThreadingHTTPServer(('127.0.0.1',8172),partial(SimpleHTTPRequestHandler,directory=str(folder)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    stack.callback(server.server_close)
    stack.callback(server.shutdown)
    pw=stack.enter_context(sync_playwright())
    browser=pw.chromium.launch(executable_path=shutil.which('google-chrome'))
    stack.callback(browser.close)
    ctx=browser.new_context(viewport={'width':390,'height':844},permissions=['clipboard-read','clipboard-write'])
    page=ctx.new_page()
    page.set_default_timeout(30000)
    expect.set_options(timeout=20000)
    page.add_init_script("""Object.defineProperty(navigator,'share',{configurable:true,value:undefined});""")
    page.goto(APP+'/home/?view=feed&sort=trending')
    card=page.locator('#dk-card-'+topic)
    share=card.get_by_role('button',name='Share',exact=True)
    expect(share).to_be_visible()
    expect(card.get_by_role('button',name='Pin',exact=True)).to_have_count(0)
    share.click()
    dialog=page.get_by_role('dialog',name='Share topic')
    expect(dialog).to_be_visible()
    expect(dialog.get_by_label('Public topic link')).to_have_value(public_url)
    assert public_url in parse_qs(urlparse(dialog.get_by_role('link',name='Text message').get_attribute('href')).query)['body'][0]
    assert parse_qs(urlparse(dialog.get_by_role('link',name='Facebook').get_attribute('href')).query)['u']==[public_url]
    dialog.get_by_role('button',name='Copy link').click()
    expect(dialog.get_by_text('Link copied.',exact=True)).to_be_visible()
    assert page.evaluate('navigator.clipboard.readText()')==public_url
    page.keyboard.press('Escape')
    expect(dialog).to_have_count(0)
    page.evaluate("""Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared=data}})""")
    share.click()
    assert page.evaluate('window.shared.url')==public_url
    page.evaluate("""Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError')}})""")
    share.click()
    expect(dialog).to_have_count(0)
    print('Guest share, SMS, Facebook, clipboard, native payload, and cancellation verified',flush=True)
    request=Request(API+'/auth/v1/signup',data=json.dumps({**member,'data':{'display_name':'QA Pin '+run}}).encode(),headers={'apikey':public_key,'Content-Type':'application/json'})
    with urlopen(request,timeout=30) as response:
        result=json.load(response)
    assert result.get('access_token'), 'QA account requires email confirmation'
    login(page,member)
    page.goto(APP+'/home/?view=feed&sort=trending')
    card=page.locator('#dk-card-'+topic)
    pin=card.get_by_role('button',name='Pin',exact=True)
    pin.click()
    expect(card.get_by_role('button',name='Pinned',exact=True)).to_have_attribute('aria-pressed','true')
    page.goto(APP+'/profile/?tab=pinned')
    saved=page.locator('.dk-collection article').filter(has=page.locator('a[href*="example=ai-data-centers"]'))
    expect(saved).to_have_count(1)
    page.reload()
    expect(saved.get_by_role('button',name='Share',exact=True)).to_be_visible()
    saved.get_by_role('link').click()
    expect(page.get_by_role('button',name='Pinned',exact=True)).to_have_attribute('aria-pressed','true')
    page.get_by_role('button',name='Pinned',exact=True).click()
    expect(page.get_by_role('button',name='Pin',exact=True)).to_have_attribute('aria-pressed','false')
    page.goto(APP+'/profile/?tab=pinned')
    expect(page.get_by_role('heading',name='Your pinned topics')).to_be_visible()
    print('Signed-in pin, profile persistence after reload, reopen, and unpin verified',flush=True)
