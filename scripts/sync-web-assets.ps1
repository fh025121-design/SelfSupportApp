$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$wwwDir = Join-Path $projectRoot 'www'
$androidPublicDir = Join-Path $projectRoot 'android/app/src/main/assets/public'

if (-not (Test-Path $wwwDir)) {
    New-Item -ItemType Directory -Path $wwwDir | Out-Null
}

if (-not (Test-Path $androidPublicDir)) {
    New-Item -ItemType Directory -Path $androidPublicDir -Force | Out-Null
}

$filesToCopy = @(
    'index.html',
    'app.js',
    'style.css'
)

foreach ($name in $filesToCopy) {
    $sourcePath = Join-Path $projectRoot $name
    $targetPath = Join-Path $wwwDir $name
    $androidTargetPath = Join-Path $androidPublicDir $name

    if (-not (Test-Path $sourcePath)) {
        if (Test-Path $targetPath) {
            Remove-Item $targetPath -Force
        }
        if (Test-Path $androidTargetPath) {
            Remove-Item $androidTargetPath -Force
        }
        continue
    }

    Copy-Item $sourcePath $targetPath -Force
    Copy-Item $sourcePath $androidTargetPath -Force
}