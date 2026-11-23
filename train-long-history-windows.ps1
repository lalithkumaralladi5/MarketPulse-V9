# Private 10-15yr Upstox DAILY equity training. The token is masked and never saved.
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
& python -c 'import requests,pandas,sklearn,joblib'
if ($LASTEXITCODE -ne 0) { throw 'First run setup-ml-windows.bat to install Python dependencies.' }
Write-Host 'MarketPulse DAILY 10-15 year study (NOT intraday options)' -ForegroundColor Cyan
$years=Read-Host 'Years: 10, 12 or 15 [15]'
if ([string]::IsNullOrWhiteSpace($years)) { $years='15' }
if ($years -notin @('10','12','15')) { throw 'Choose 10, 12 or 15 years.' }
$raw=Read-Host 'Paste 2-20 real NSE_EQ|... / BSE_EQ|... instrument keys, comma separated'
$keys=@($raw.Split(',') | ForEach-Object { $_.Trim() } | Where-Object {$_})
if ($keys.Count -lt 2 -or $keys.Count -gt 20) { throw 'Provide 2-20 exact provider equity keys.' }
if (@($keys | Where-Object { $_ -notmatch '^(NSE|BSE)_EQ\|[A-Za-z0-9._ -]{3,78}$' }).Count -gt 0) {
  throw 'Only actual NSE_EQ and BSE_EQ instrument keys are supported.'
}
$secure=Read-Host 'NEW Upstox Analytics Token (masked)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $value=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($value)) { throw 'Replacement Analytics Token required.' }
try {
  $env:UPSTOX_ACCESS_TOKEN=$value
  $value=$null
  & python -m ml.collect_long_history --keys @keys --years ([int]$years) --out data/upstox_daily_long.csv
  if ($LASTEXITCODE -ne 0) { throw 'Provider history collection failed. No fake training substituted.' }
} finally {
  Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
& python -m ml.train_long_history --csv data/upstox_daily_long.csv --source UPSTOX_DAILY_HISTORY --require-years ([int]$years)
if ($LASTEXITCODE -ne 0) { throw 'Long-term model training failed. Inspect coverage and data quality.' }
Write-Host 'Model and accuracy report saved locally: ml/models/marketpulse_daily.json' -ForegroundColor Green
Write-Host 'Intraday ML and public Render demo were not overwritten.' -ForegroundColor Yellow
