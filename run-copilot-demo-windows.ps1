# Optional OpenAI-powered Copilot demo. Reads key in a masked console, never writes it to disk.
Set-Location -LiteralPath $PSScriptRoot
$secure = Read-Host 'Your OpenAI API key for optional cloud Copilot (masked; separate paid API access)' -AsSecureString
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:OPENAI_API_KEY = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
try {
    if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) { throw 'No OpenAI API key entered. Use run-windows.bat for the free local Copilot.' }
    Write-Host 'Cloud Copilot is now available on this local PC. Market data remains SYNTHETIC until Upstox is configured.' -ForegroundColor Cyan
    & "$PSScriptRoot\run-windows.bat"
} finally { Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue }
