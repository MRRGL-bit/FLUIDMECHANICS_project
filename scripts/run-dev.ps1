$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Get-NodeMajor([string]$nodePath) {
  if (-not (Test-Path $nodePath)) { return 0 }
  $version = & $nodePath -v 2>$null
  if (-not $version) { return 0 }
  return [int](($version -replace "^v", "").Split(".")[0])
}

$programFilesNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
$cursorNode = Join-Path $env:LOCALAPPDATA "Programs\cursor\resources\app\resources\helpers\node.exe"
$viteBin = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"

if (-not (Test-Path $viteBin)) {
  Write-Host "vite가 없습니다. 먼저 npm install 을 실행하세요." -ForegroundColor Red
  exit 1
}

$node = $programFilesNode
$pfMajor = Get-NodeMajor $programFilesNode

if ($pfMajor -lt 18) {
  $cursorMajor = Get-NodeMajor $cursorNode
  if ($cursorMajor -ge 18) {
    Write-Host "Program Files의 Node가 v$pfMajor 입니다. Cursor 내장 Node(v$cursorMajor)로 서버를 시작합니다." -ForegroundColor Yellow
    Write-Host "권장: https://nodejs.org 에서 LTS를 설치해 시스템 Node를 업데이트하세요." -ForegroundColor Yellow
    $node = $cursorNode
  } else {
    Write-Host "Node 18 이상이 필요합니다. https://nodejs.org 에서 LTS를 설치하세요." -ForegroundColor Red
    exit 1
  }
}

Write-Host "Starting Vite with: $node"
& $node $viteBin
