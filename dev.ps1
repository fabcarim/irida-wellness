# Avvia un server statico locale per testare l'app sul PC.
# Service Worker e IndexedDB richiedono HTTP, non file://
$ErrorActionPreference = "Stop"
$port = 8000
Write-Host "Irida Wellness — server di sviluppo su http://localhost:$port" -ForegroundColor Cyan
Write-Host "Premi Ctrl+C per fermare." -ForegroundColor DarkGray
python -m http.server $port
