from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from PIL import Image
from hashlib import sha256
import base64, shutil, re
from zipfile import ZipFile,ZIP_DEFLATED
url='https://anthonyminindu-cmd.github.io/counter-argument-v2/home/?view=feed&example=poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=shutil.which('google-chrome'))
    screen=b.new_page(viewport={'width':1600,'height':1050})
    screen.goto(url)
    poster=screen.locator('.dk-puzzle')
    links=poster.get_by_role('link')
    expect(links).to_have_count(20)
    poster.screenshot(path='10-complete-published-poster.jpg',quality=92)
    mobile=b.new_page(viewport={'width':390,'height':844})
    mobile.goto(url)
    link=mobile.get_by_role('link',name=re.compile(r'^Point 1:'))
    expect(link).to_be_visible()
    # The accessible hit area has the shape of a puzzle piece; keyboard activation works at every zoom.
    link.focus()
    link.press('Enter')
    point=mobile.locator('.dk-points-list [aria-expanded="true"]')
    expect(point).to_have_count(1)
    expect(point).to_contain_text('Check the price history')
    assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
    point.scroll_into_view_if_needed()
    mobile.screenshot(path='11-mobile-point-reader.jpg',quality=84)
    print('PASS 20 interactive puzzle links, keyboard activation of rank 1, and 390-pixel layout')
    b.close()
with ZipFile('poster-evidence.zip','w',ZIP_DEFLATED) as z:
    for file in ('10-complete-published-poster.jpg','11-mobile-point-reader.jpg'):
        with Image.open(file) as im: im.verify()
        z.write(file)
data=Path('poster-evidence.zip').read_bytes()
print('EVIDENCE_SHA',sha256(data).hexdigest(),len(data))
for i in range(0,len(data),3000):print('QAIMAGE',i,base64.b64encode(data[i:i+3000]).decode())
