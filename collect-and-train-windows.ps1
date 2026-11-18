# Explicitly collects REAL candles from Upstox and trains a local model.
# Never enter credentials into a webpage or commit the resulting files.
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Get instrument keys from MarketPulse Markets & Search; use NSE_EQ|... or BSE_EQ|...' -ForegroundColor Cyan
$keysText=Read-Host 'Enter 2 to 8 exact provider instrument keys separated by commas'
$keys=@($keysText.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
if ($keys.Count -lt 2 -or $keys.Count -gt 8) { throw 'Provide 2 to 8 exact instrument keys.' }
$secure=Read-Host 'Upstox Analytics Token (masked; not persisted)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {$env:UPSTOX_ACCESS_TOKEN=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
try {
  if ([string]::IsNullOrWhiteSpace($env:UPSTOX_ACCESS_TOKEN)) {throw 'Token missing'}
  & python -m ml.collect_upstox --keys @keys --days 100 --interval 15 --out data/upstox_15m.csv
  if ($LASTEXITCODE -ne 0) {throw 'History collection failed; model not changed.'}
  & python -m ml.train --csv data/upstox_15m.csv --source UPSTOX_HISTORY --interval 15
  if ($LASTEXITCODE -ne 0) {throw 'Training failed; inspect sample size.'}
  Write-Host 'Model trained. Restart launcher if needed, open ML Prediction Lab, and inspect held-out metrics.' -ForegroundColor Green
} finally {Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue}
