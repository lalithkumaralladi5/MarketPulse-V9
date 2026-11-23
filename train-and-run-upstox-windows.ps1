# MarketPulse private LIVE training + launch. Never saves or prints tokens.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$port = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if ($port) { throw 'Port 8765 already in use. Close the old MarketPulse window (Ctrl+C) and retry.' }

$python = Get-Command python -ErrorAction Stop
& python -c 'import pandas, sklearn, fastapi, uvicorn, requests, joblib'
if ($LASTEXITCODE -ne 0) { throw 'Install ML requirements first: double-click setup-ml-windows.bat' }
Write-Host 'MarketPulse: PRIVATE Upstox historical-data training + LIVE launch' -ForegroundColor Cyan
Write-Host 'Find exact exchange instrument keys in Markets & Search; do not use guessed symbols.' -ForegroundColor Gray
$raw = Read-Host 'Enter 2 to 8 real NSE_EQ|... or BSE_EQ|... keys, comma-separated'
$keys = @($raw.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($keys.Count -lt 2 -or $keys.Count -gt 8 -or @($keys | Where-Object { $_ -notmatch '^(NSE|BSE)_EQ\|[A-Za-z0-9._ -]{3,78}$' }).Count -gt 0) {
    throw 'Provide 2–8 genuine NSE/BSE EQUITY instrument keys.'
}
$secure = Read-Host 'NEW Upstox Analytics Token (masked; never committed)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($value)) { throw 'Token required: never fall back to synthetic data.' }
$ml = $null
try {
    $env:UPSTOX_ACCESS_TOKEN = $value
    $value = $null
    Write-Host 'Collecting provider history into ignored local data/ folder...' -ForegroundColor Cyan
    & python -m ml.collect_upstox --keys @keys --days 100 --interval 15 --out data/upstox_15m.csv
    if ($LASTEXITCODE -ne 0) { throw 'Upstox collection failed; existing trained model unchanged.' }
    Write-Host 'Training ML and evaluating chronologically held-out candles...' -ForegroundColor Cyan
    & python -m ml.train --csv data/upstox_15m.csv --source UPSTOX_HISTORY --interval 15
    if ($LASTEXITCODE -ne 0) { throw 'Training failed. Inspect sample sizes; no demo model substituted.' }
    # ML inference process does not require or receive broker credentials.
    $token = $env:UPSTOX_ACCESS_TOKEN
    Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
    $ml = Start-Process -FilePath $python.Source -ArgumentList @('-m','uvicorn','ml.service:app','--host','127.0.0.1','--port','8766') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    $env:UPSTOX_ACCESS_TOKEN = $token
    $token = $null
    Write-Host 'Starting LIVE read-only Java terminal; no order execution is possible.' -ForegroundColor Green
    & "$PSScriptRoot\run-windows.bat"
} finally {
    Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
    if ($null -ne $ml) { Stop-Process -Id $ml.Id -Force -ErrorAction SilentlyContinue }
}
