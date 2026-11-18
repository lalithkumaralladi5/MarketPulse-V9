# Two masked local inputs, only if you want BOTH Upstox snapshot polling and optional paid AI.
Set-Location -LiteralPath $PSScriptRoot
function Read-Secret([string] $label) {
    $secure = Read-Host $label -AsSecureString
    $p = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}
$env:UPSTOX_ACCESS_TOKEN = Read-Secret 'Upstox Analytics Token (read-only; masked)'
$env:OPENAI_API_KEY = Read-Secret 'OpenAI API key (optional paid AI; masked)'
try {
    if ([string]::IsNullOrWhiteSpace($env:UPSTOX_ACCESS_TOKEN) -or [string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) { throw 'Both credentials are required in this launcher. For free local Copilot, use run-upstox-windows.bat instead.' }
    & "$PSScriptRoot\run-windows.bat"
} finally {
    Remove-Item Env:UPSTOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
}
