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
    $sourcePath = Join-Path $projectRoot $name
    $targetPath = Join-Path $wwwDir $name

    if (-not (Test-Path $sourcePath)) {
        if (Test-Path $targetPath) {
            Remove-Item $targetPath -Force
        }
        continue
    }

    Copy-Item $sourcePath $targetPath -Force
}