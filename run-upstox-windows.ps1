# Run only on your own PC. Never paste a token into a chat or webpage.
Set-Location -LiteralPath $PSScriptRoot
$existing = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if ($existing) { throw "Port 8765 is already occupied. Close the previous MarketPulse server (Ctrl+C) before starting Upstox LIVE mode; otherwise your browser may show the OLD demo server." }
$secure = Read-Host 'Paste your Upstox Analytics Token locally (masked; never saved to disk)' -AsSecureString
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:UPSTOX_ACCESS_TOKEN = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
try {
    if ([string]::IsNullOrWhiteSpace($env:UPSTOX_ACCESS_TOKEN)) { throw "No token entered. Upstox launcher stopped to avoid falling back to demo mode." }
    Write-Host 'Launching MarketPulse with read-only Upstox market snapshots. No orders enabled.' -ForegroundColor Cyan
    & "$PSScriptRoot\run-windows.bat"
} finally {
    Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
