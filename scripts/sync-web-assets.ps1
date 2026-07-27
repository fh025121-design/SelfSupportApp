$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$wwwDir = Join-Path $projectRoot 'www'

if (-not (Test-Path $wwwDir)) {
    New-Item -ItemType Directory -Path $wwwDir | Out-Null
}

$filesToCopy = @(
    'index.html',
    'app.js',
    'style.css'
)

foreach ($name in $filesToCopy) {
    Copy-Item (Join-Path $projectRoot $name) (Join-Path $wwwDir $name) -Force
}