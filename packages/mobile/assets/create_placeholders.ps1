# Create minimal placeholder PNG files (1x1 pixel purple)
$pngData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mM0YPj/HwADgQF/e8l1AAAAAElFTkSuQmCC'
$pngBytes = [Convert]::FromBase64String($pngData)

# Create all required placeholder files
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'favicon.png'), $pngBytes)
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'icon.png'), $pngBytes)
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'splash.png'), $pngBytes)
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'adaptive-icon.png'), $pngBytes)

Write-Host "Created placeholder PNG files successfully"
