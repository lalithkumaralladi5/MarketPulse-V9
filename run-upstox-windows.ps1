# Private read-only Upstox charts, with optional localhost Python ML service.
# Never paste credentials into GitHub or websites; token is a masked local prompt.
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$ml=$null
try {
    $existing=Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
    if ($existing) {throw 'Port 8765 is already occupied. Close the previous MarketPulse server (Ctrl+C) before starting Upstox LIVE mode; otherwise your browser may show the OLD demo server.'}
    # Start local ML service BEFORE token entry, so it cannot inherit the broker credential.
    Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
    $python=Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        & python -c 'import fastapi,sklearn,pandas,uvicorn'
        if ($LASTEXITCODE -eq 0) {
            if (Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue) {
                throw 'Port 8766 is already running an ML service. Close the old ML server first to avoid stale model results.'
            }
            $ml=Start-Process -FilePath $python.Source -WorkingDirectory $PSScriptRoot -ArgumentList @('-m','uvicorn','ml.service:app','--host','127.0.0.1','--port','8766') -PassThru -WindowStyle Hidden
            Write-Host 'Local ML service started; reports NOT TRAINED until genuine historical training succeeds.' -ForegroundColor Cyan
        } else {Write-Warning 'Python ML dependencies missing: run setup-ml-windows.bat. Java live charts still start.'}
    } else {Write-Warning 'Python not found: ML Lab unavailable; Java live charts still start.'}
    $secure=Read-Host 'Paste a NEW Upstox Analytics Token locally (masked; never saved to disk)' -AsSecureString
    $ptr=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {$env:UPSTOX_ACCESS_TOKEN=[System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
    finally {[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
    if ([string]::IsNullOrWhiteSpace($env:UPSTOX_ACCESS_TOKEN)) {throw 'No token entered. Upstox launcher stopped to avoid falling back to demo mode.'}
    Write-Host 'Launching MarketPulse with private, read-only Upstox market snapshots. No broker orders enabled.' -ForegroundColor Green
    & "$PSScriptRoot\run-windows.bat"
} finally {
    Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
    if ($ml) {Stop-Process -Id $ml.Id -Force -ErrorAction SilentlyContinue}
}
