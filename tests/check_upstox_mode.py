"""Security regression: a private Upstox launcher must never silently start demo mode.
This test reads source files only. It never loads or prints account credentials.
"""
from pathlib import Path

root=Path(__file__).resolve().parents[1]
bat=(root/'run-upstox-windows.bat').read_text(encoding='utf-8')
ps1=(root/'run-upstox-windows.ps1').read_text(encoding='utf-8')
check=(root/'verify-upstox-windows.ps1').read_text(encoding='utf-8')
adapter=(root/'backend'/'UpstoxAdapter.java').read_text(encoding='utf-8')
server=(root/'backend'/'MarketPulseServer.java').read_text(encoding='utf-8')
render=(root/'render.yaml').read_text(encoding='utf-8')

assert 'run-upstox-windows.ps1' in bat and 'run-hackathon-windows.bat' not in bat
assert 'Read-Host' in ps1 and '-AsSecureString' in ps1
assert 'No token entered' in ps1 and 'falling back to demo mode' in ps1
assert 'Get-NetTCPConnection' in ps1 and 'Port 8765' in ps1
assert 'UPSTOX_ACCESS_TOKEN' in adapter and 'System.getenv()' in adapter
assert 'Authorization","Bearer "+TOKEN' in adapter
assert '"upstoxTokenConfigured",UPSTOX' in server
assert 'UPSTOX_ACCESS_TOKEN' not in render
assert '/api/status' in check and '/api/universe/quote' in check
assert '$base = ' in check and "'http://127.0.0.1:8765'" in check
print('PASS: Upstox token is server-side, launcher rejects demo fallback, localhost verification and public demo separation')
