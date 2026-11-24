"""Browser smoke test for the exchange-timed, explicitly simulated Live Terminal."""
import sys
from playwright.sync_api import sync_playwright
port=int(sys.argv[1]) if len(sys.argv)>1 else 8876
base='http://127.0.0.1:'+str(port)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox'])
 page=b.new_context(bypass_csp=True,viewport={'width':1440,'height':960}).new_page()
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/#live',wait_until='domcontentloaded')
 page.locator('#view-live').wait_for(state='visible',timeout=14000)
 page.wait_for_function("window.MarketPulseLive?.state?.bars?.length>30",timeout=14000)
 page.wait_for_function("window.MarketPulseLive?.state?.last>0",timeout=14000)
 assert 'SYNTHETIC' in page.locator('#ltBanner').inner_text()
 assert 'DEMO' in page.locator('#ltConn').inner_text()
 assert page.locator('#ltLast').inner_text().startswith('₹')
 assert page.locator('#ltCanvas').is_visible()
 page.locator('#ltTf [data-i="5"]').click()
 page.wait_for_function("window.MarketPulseLive?.state?.interval===5&&window.MarketPulseLive?.state?.bars?.length>30",timeout=15000)
 page.locator('a.nav[href="#scanner"]').click()
 assert page.evaluate("window.MarketPulseLive.state.es===null"),'Navigating away must stop SSE'
 page.locator('a.nav[href="#live"]').click()
 page.wait_for_function("window.MarketPulseLive.state.es!==null",timeout=14000)
 assert not errors,errors
 # Release the desktop SSE before opening the mobile session; closing a browser
 # tab may take one provider poll for Java to observe the disconnected socket.
 page.evaluate('window.MarketPulseLive.stop()')
 page.close()
 import time;time.sleep(3.5)
 phone=b.new_context(bypass_csp=True,viewport={'width':430,'height':880}).new_page()
 phone.goto(base+'/#live',wait_until='domcontentloaded')
 phone.locator('#view-live').wait_for(state='visible',timeout=14000)
 phone.wait_for_function("window.MarketPulseLive?.state?.bars?.length>30",timeout=14000)
 assert phone.evaluate("document.documentElement.scrollWidth<=window.innerWidth+3"),'Mobile overflow'
 print('PASS: live terminal loads, demo clearly labeled, SSE lifecycle, interval changes, mobile')
 b.close()
