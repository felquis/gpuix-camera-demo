$ErrorActionPreference = "Stop"

$version = (Get-Content package.json | ConvertFrom-Json).version
$BINARY_NAME = "gpuix-camera-demo"
$FILES_DIR = "packaging\files"
$OUTPUT_DIR = "packaging\output"

New-Item -ItemType Directory -Force -Path $FILES_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null

bun build --compile --minify --define 'process.env.NODE_ENV="production"' app.tsx --outfile "$FILES_DIR\$BINARY_NAME.exe"

$FFMPEG_BIN = $null
foreach ($candidate in @("ffmpeg", "C:\ProgramData\chocolatey\bin\ffmpeg.exe", "C:\ffmpeg\bin\ffmpeg.exe")) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $FFMPEG_BIN = (Get-Command $candidate).Source
        break
    } elseif (Test-Path $candidate) {
        $FFMPEG_BIN = $candidate
        break
    }
}
if ($FFMPEG_BIN) {
    Copy-Item $FFMPEG_BIN "$FILES_DIR\ffmpeg.exe"
    Write-Host "  bundled ffmpeg from $FFMPEG_BIN"
} else {
    Write-Host "  warning: ffmpeg not found, skipping bundle"
}

makensis /DVERSION=$version packaging\installer.nsi

Write-Host "v $OUTPUT_DIR\$BINARY_NAME-$version-setup.exe"
