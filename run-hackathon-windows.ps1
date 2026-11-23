# Run locally. The token is never written to disk or exposed in the web browser.
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host "`nMARKETPULSE V9 - HACKATHON TERMINAL" -ForegroundColor Cyan
Write-Host "You can run live with your Upstox Analytics Token, or press Enter for labelled synthetic demo mode." -ForegroundColor Gray
$secure=Read-Host 'Upstox Analytics Token (masked; blank for DEMO)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $value=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($value)) { Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue; Write-Host 'MODE: SYNTHETIC DEMO' -ForegroundColor Yellow }
else { $env:UPSTOX_ACCESS_TOKEN=$value; Write-Host 'MODE: UPSTOX READ-ONLY LIVE DATA (provider connection checked on request)' -ForegroundColor Green }
$value=$null
$ml=$null
try {
  $python=Get-Command python -ErrorAction SilentlyContinue
  if ($null -ne $python) {
    & python -c "import fastapi, sklearn, pandas, uvicorn" 2>$null
    if ($LASTEXITCODE -eq 0) {
      # ML service never needs or inherits the broker credential.
      $tokenForJava=$env:UPSTOX_ACCESS_TOKEN
      Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
      try {
        $ml=Start-Process -FilePath $python.Source -WorkingDirectory $PSScriptRoot -ArgumentList @('-m','uvicorn','ml.service:app','--host','127.0.0.1','--port','8766') -PassThru -WindowStyle Hidden
      } finally {
        if (-not [string]::IsNullOrWhiteSpace($tokenForJava)) {$env:UPSTOX_ACCESS_TOKEN=$tokenForJava}
        $tokenForJava=$null
      }
      Write-Host 'Local ML service started. The model stays UNTRAINED until you train with actual historical data.' -ForegroundColor Cyan
    } else { Write-Warning 'ML dependencies not installed: run setup-ml-windows.bat once. The Java dashboard can still start.' }
  } else { Write-Warning 'Python missing. Install Python 3.11+ then run setup-ml-windows.bat.' }
  & "$PSScriptRoot\run-windows.bat"
} finally {
  if ($ml) { Stop-Process -Id $ml.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
