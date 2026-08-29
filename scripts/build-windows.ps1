$ErrorActionPreference = "Stop"

$APP_NAME = "GPUIX Camera Demo"
$BINARY_NAME = "gpuix-camera-demo"
$DIST = "dist"

New-Item -ItemType Directory -Force -Path $DIST | Out-Null

# Compile standalone binary
bun build --compile --minify --define 'process.env.NODE_ENV="production"' app.tsx --outfile "$DIST\$BINARY_NAME.exe"

# Bundle ffmpeg if available
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

$ZIP_DIR = "$DIST\$BINARY_NAME-windows"
Remove-Item -Recurse -Force $ZIP_DIR -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $ZIP_DIR | Out-Null

Copy-Item "$DIST\$BINARY_NAME.exe" "$ZIP_DIR\"

if ($FFMPEG_BIN) {
    Copy-Item $FFMPEG_BIN "$ZIP_DIR\ffmpeg.exe"
    Write-Host "  bundled ffmpeg from $FFMPEG_BIN"
} else {
    Write-Host "  warning: ffmpeg not found, skipping bundle"
}

Compress-Archive -Path "$ZIP_DIR\*" -DestinationPath "$DIST\$BINARY_NAME-windows.zip" -Force
Remove-Item -Recurse -Force $ZIP_DIR

Write-Host "v dist\$BINARY_NAME-windows.zip"
