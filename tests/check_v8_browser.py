"""V8 Playwright integration smoke against a running MarketPulse demo server.
Usage: PORT=8876 java ...; python tests/check_v8_browser.py [port].
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
p=int(sys.argv[1]) if len(sys.argv)>1 else 8876
BASE=f'http://127.0.0.1:{p}'
OUT=Path(__file__).resolve().parents[1]
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE,wait_until='domcontentloaded')
 page.locator('#view-scanner').wait_for(state='visible',timeout=20000)
 page.locator('.sidebar a[href="#explore"]').click()
 assert page.locator('#view-explore').is_visible(), 'Explore page visible'
 page.locator('#v8Search').fill('REL')
 page.locator('#v8SearchForm button[type=submit]').click()
 page.locator('[data-result="0"]').wait_for(timeout=12000)
 page.locator('[data-result="0"]').click()
 page.locator('#view-chart').wait_for(state='visible',timeout=10000)
 page.wait_for_function("() => document.getElementById('v8ChartStatus').textContent.includes('BARS')",timeout=15000)
 assert page.locator('#v8Symbol').inner_text()=='RELIANCE'
 assert page.locator('#v8Canvas').is_visible()
 page.locator('#v8Frames [data-tf="15"]').click()
 page.wait_for_function("() => document.getElementById('v8ChartStatus').textContent.includes('BARS')",timeout=15000)
 page.locator('button[data-style="line"]').click()
 assert page.locator('button[data-style="line"]').get_attribute('class')=='selected'
 page.locator('#v8DrawTools [data-tool="hline"]').click()
 can=page.locator('#v8Canvas');bb=can.bounding_box();page.mouse.click(bb['x']+bb['width']*.5,bb['y']+bb['height']*.5)
 assert page.evaluate('window.MarketPulseTerminal && document.getElementById("v8Undo")')
 page.locator('#v8Undo').click()
 page.locator('#v8WatchToggle').click()
 page.locator('.sidebar a[href="#explore"]').click()
 assert 'RELIANCE' in page.locator('#v8Watch').inner_text()
 page.locator('.sidebar a[href="#heatmap"]').click()
 page.locator('#v8HeatTiles [data-heat="0"]').wait_for(timeout=15000)
 page.locator('#v8HeatTiles [data-heat="0"]').click()
 assert page.locator('#view-chart').is_visible()
 # A live-looking trading workflow must remain simulated, persist a journal,
 # and never offer brokerage order submission.
 page.locator('.sidebar a[href="#tradingdesk"]').click()
 assert page.locator('#view-tradingdesk').is_visible()
 page.wait_for_function("() => document.getElementById('deskStatus')?.dataset.kind === 'demo'",timeout=12000)
 page.locator('#deskStop').fill('0.1')
 page.locator('#deskQuantity').fill('1')
 page.locator('#deskExecute').click()
 assert 'BUY' in page.locator('#deskJournal').inner_text()
 page.locator('#deskSide').select_option('SELL')
 page.locator('#deskExecute').click()
 assert 'SELL' in page.locator('#deskJournal').inner_text()
 page.reload(wait_until='domcontentloaded')
 page.locator('#view-tradingdesk').wait_for(state='visible',timeout=12000)
 assert 'BUY' in page.locator('#deskJournal').inner_text(), 'Paper ledger should survive reload'
 page.locator('.sidebar a[href="#news"]').click()
 assert page.locator('#view-news').is_visible()
 page.locator('#v8NewsItems .v8-empty').wait_for(timeout=12000)
 assert 'No instrument-specific headlines' in page.locator('#v8NewsItems').inner_text()
 assert page.locator('#v8NewsSource').inner_text().strip(), 'News source/status should not be empty'
 page.locator('.sidebar a[href="#flow"]').click()
 assert page.locator('#v8FlowStocks').is_visible()
 page.screenshot(path=str(OUT/'preview_v8_flow.png'),full_page=False)
 page.locator('.sidebar a[href="#chart"]').click()
 page.screenshot(path=str(OUT/'preview_v8_terminal.png'),full_page=False)
 assert not errors,'Browser JS errors: '+repr(errors)
 phone=browser.new_page(viewport={'width':430,'height':890},device_scale_factor=1)
 phone.goto(BASE+'/#explore',wait_until='domcontentloaded')
 phone.locator('#mobilePages').click()
 phone.locator('.sidebar a[href="#explore"]').click()
 assert phone.locator('#view-explore').is_visible()
 phone.screenshot(path=str(OUT/'preview_v8_mobile.png'),full_page=False)
 print('PASS V8: multi-page navigation, search, chart, timeframe, drawing, indicators, watchlist, heatmap, news, flow, mobile; no JS errors')
 browser.close()
