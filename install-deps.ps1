# KickFix — install all dependencies
# Run from project root: .\install-deps.ps1

Set-Location $PSScriptRoot

Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed. Make sure Node.js is installed and in PATH." -ForegroundColor Red
    exit 1
}

Write-Host "`nInstalling iOS pods (if on macOS or have CocoaPods)..." -ForegroundColor Cyan
if (Test-Path "ios\Podfile") {
    Push-Location ios
    pod install
    Pop-Location
}

Write-Host "`nDone. Run: npm start (then in another terminal: npm run android or npm run ios)" -ForegroundColor Green
