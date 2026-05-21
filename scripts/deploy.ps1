# StockDan — Deploy automático
# Uso: pwsh scripts/deploy.ps1 "mensagem do commit"

param([string]$Message = "chore: update")

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot

Set-Location $ProjectDir

Write-Host "`n[1/4] Build local..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build falhou." -ForegroundColor Red; exit 1 }

Write-Host "`n[2/4] Git commit & push..." -ForegroundColor Cyan
git add -A
git status --short
git commit -m $Message
git push origin master

Write-Host "`n[3/4] Deploy Vercel (prod)..." -ForegroundColor Cyan
vercel --prod --yes

Write-Host "`n✓ Deploy concluído: https://stockdan.vercel.app" -ForegroundColor Green
