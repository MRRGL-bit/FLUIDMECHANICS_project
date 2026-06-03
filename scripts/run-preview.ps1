$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$programFilesNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
$cursorNode = Join-Path $env:LOCALAPPDATA "Programs\cursor\resources\app\resources\helpers\node.exe"

function Get-NodeMajor([string]$nodePath) {
  if (-not (Test-Path $nodePath)) { return 0 }
  $version = & $nodePath -v 2>$null
  if (-not $version) { return 0 }
  return [int](($version -replace "^v", "").Split(".")[0])
}

$node = $programFilesNode
if ((Get-NodeMajor $programFilesNode) -lt 18 -and (Get-NodeMajor $cursorNode) -ge 18) {
  $node = $cursorNode
}

& $node (Join-Path $ProjectRoot "node_modules\vite\bin\vite.js") preview
