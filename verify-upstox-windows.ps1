# Local read-only Upstox connection check. Never asks for or displays credentials.
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8765'
Write-Host 'MarketPulse Upstox connection check (localhost only)' -ForegroundColor Cyan
try {
  $state = Invoke-RestMethod -Uri "$base/api/status" -TimeoutSec 12
} catch {
  Write-Host 'Cannot reach MarketPulse on localhost:8765. Start run-upstox-windows.bat first.' -ForegroundColor Red
  exit 1
}
if ($state.mode -ne 'LIVE' -or $state.provider -ne 'Upstox' -or $state.upstoxTokenConfigured -ne $true) {
  Write-Host 'DEMO: This running Java server has NO Upstox Analytics Token. Close old MarketPulse windows, then run run-upstox-windows.bat and enter your token locally.' -ForegroundColor Yellow
  Write-Host 'The public Render showcase intentionally stays synthetic; running this check does not change Render.' -ForegroundColor Yellow
  exit 2
}
Write-Host 'Token configured on the local Java server. Checking real provider search and quote access...' -ForegroundColor Green
try {
  $results = Invoke-RestMethod -Uri "$base/api/universe/search?query=RELIANCE&exchange=NSE&segment=EQ" -TimeoutSec 25
  $instrument = @($results.instruments) | Where-Object { $_.symbol -eq 'RELIANCE' -and $_.exchange -eq 'NSE' } | Select-Object -First 1
  if ($null -eq $instrument) { throw 'Upstox returned no exact RELIANCE NSE equity match.' }
  $encoded = [uri]::EscapeDataString([string]$instrument.key)
  $quote = Invoke-RestMethod -Uri "$base/api/universe/quote?key=$encoded" -TimeoutSec 25
  if ($quote.mode -ne 'LIVE' -or -not ($quote.ltp -gt 0)) { throw 'Upstox did not supply a valid LIVE quote.' }
  Write-Host ('PASS: Genuine provider quote received for '+$instrument.symbol+'; source '+$quote.source) -ForegroundColor Green
  Write-Host ('LTP: '+$quote.ltp+' | age: '+$quote.ageSeconds+' seconds | fresh: '+$quote.fresh)
  if ($quote.fresh -ne $true) {
    Write-Host 'QUOTE STALE / MARKET CLOSED: Historical charts may load, but actionable signals must stay blocked.' -ForegroundColor Yellow
  } else {
    Write-Host 'Fresh quote observed. Completed-candle momentum annotations remain research-only.' -ForegroundColor Green
  }
} catch {
  Write-Host ('Configured token, but provider verification FAILED: '+$_.Exception.Message) -ForegroundColor Red
  Write-Host 'Check account activation, Analytics Token validity, network, exchange entitlement and API error; never paste your token.' -ForegroundColor Yellow
  exit 3
}
