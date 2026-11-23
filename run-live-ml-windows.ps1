# ONE-CLICK PRIVATE UPSTOX ML: collect genuine candles, train locally, then launch.
# The credential is prompted locally, never saved, echoed, or uploaded to GitHub.
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$ml=$null
try {
  foreach ($port in @(8765,8766)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
      throw "Port $port already in use. Close older MarketPulse/ML windows first."
    }
  }
  $python=Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) {throw 'Python 3.11+ not found. Install it and run setup-ml-windows.bat.'}
  & python -c 'import fastapi,sklearn,pandas,uvicorn,requests,joblib'
  if ($LASTEXITCODE -ne 0) {throw 'ML dependencies missing. Run setup-ml-windows.bat once.'}
  $secure=Read-Host 'Enter your NEW Upstox Analytics Token locally (masked)' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {$env:UPSTOX_ACCESS_TOKEN=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
  finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  if ([string]::IsNullOrWhiteSpace($env:UPSTOX_ACCESS_TOKEN)) {throw 'A fresh Analytics Token is required; no demo fallback.'}
  Write-Host 'Resolving actual NSE equity keys, collecting private 15m history, and training model...' -ForegroundColor Cyan
  & python -m ml.live_bootstrap --days 100 --out data/upstox_15m.csv
  if ($LASTEXITCODE -ne 0) {throw 'Real-data collection or training failed. No synthetic model will be substituted.'}
  # Start ML without the broker token in its environment; ONLY Java needs it.
  $tokenCopy=$env:UPSTOX_ACCESS_TOKEN
  Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
  try {
    $ml=Start-Process -FilePath $python.Source -WorkingDirectory $PSScriptRoot -ArgumentList @('-m','uvicorn','ml.service:app','--host','127.0.0.1','--port','8766') -PassThru -WindowStyle Hidden
  } finally {$env:UPSTOX_ACCESS_TOKEN=$tokenCopy;$tokenCopy=$null}
  Write-Host 'Training complete. Starting private read-only Upstox charts + ML Lab at localhost:8765.' -ForegroundColor Green
  & "$PSScriptRoot\run-windows.bat"
} finally {
  if ($ml) {Stop-Process -Id $ml.Id -Force -ErrorAction SilentlyContinue}
  Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
