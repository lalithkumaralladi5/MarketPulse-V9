"""Browser regression for MarketPulse's chart-first terminal and research markers.
Uses synthetic data only. Never reads private brokerage credentials.
"""
import sys
from playwright.sync_api import sync_playwright

port=int(sys.argv[1]) if len(sys.argv)>1 else 8876
base=f'http://127.0.0.1:{port}'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1600,'height':920})
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.goto(base+'/#explore',wait_until='domcontentloaded')
    page.locator('#v8Search').fill('REL')
    page.locator('#v8SearchForm button[type=submit]').click()
    page.locator('[data-result="0"]').wait_for(timeout=20000)
    page.locator('[data-result="0"]').click()
    page.locator('#v10Sidebar').wait_for(timeout=12000)
    page.wait_for_function("() => document.getElementById('v8ChartStatus')?.textContent.includes('BARS')",timeout=20000)
    assert page.locator('#v10Signals').is_checked()
    assert page.locator('#v10Rsi').is_checked()
    signal=page.evaluate('window.MarketPulseTerminal.getSignals()')
    assert signal['closedCount']>=35,signal
    assert all(m['type'] in ('BUY','SELL','EXIT') and m['index']<signal['closedCount'] for m in signal['markers'])
    assert signal['markers'],'Expected an illustrative historical signal in the deterministic demo series'
    assert page.locator('#v8Feed').inner_text()=='SYNTHETIC DATA'
    assert 'no live entry signal' in page.locator('#v10LiveGate').inner_text()
    page.locator('#v10Signals').uncheck();page.locator('#v10Signals').check()
    page.locator('#v10Rsi').uncheck();page.locator('#v10Rsi').check()
    page.locator('[data-side="depth"]').click()
    assert page.locator('[data-pane="depth"]').is_visible()
    page.locator('[data-side="watchlist"]').click()
    page.locator('#v8WatchToggle').click()
    assert 'RELIANCE' in page.locator('#v10WatchItems').inner_text()
    page.locator('[data-side="news"]').click()
    page.locator('#v10RefreshNews').click()
    page.locator('[data-side="overview"]').click()
    page.locator('#v8ZoomIn').click();page.locator('#v8ZoomOut').click()
    page.locator('#v8Fit').click()
    assert not errors,errors
    page.screenshot(path='preview_v10_chart.png',full_page=False)
    phone=browser.new_page(viewport={'width':430,'height':900})
    phone_errors=[];phone.on('pageerror',lambda err:phone_errors.append(str(err)))
    phone.goto(base+'/#chart',wait_until='domcontentloaded')
    phone.locator('#v10Sidebar').wait_for(timeout=10000)
    assert phone.locator('#v10Signals').is_visible()
    assert not phone_errors,phone_errors
    phone.screenshot(path='preview_v10_mobile.png',full_page=False)
    browser.close()
print('PASS: chart-first layout, closed-candle markers, toggles, watchlist, depth, news, zoom, and mobile')
