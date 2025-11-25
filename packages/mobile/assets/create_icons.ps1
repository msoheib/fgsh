# Create valid PNG placeholder assets for Expo app
Add-Type -AssemblyName System.Drawing

$purple = [System.Drawing.Color]::FromArgb(26, 9, 51)  # #1a0933
$violet = [System.Drawing.Color]::FromArgb(139, 92, 246)  # #8b5cf6

# Function to create a solid color PNG
function Create-SolidPNG {
    param(
        [string]$Path,
        [int]$Width,
        [int]$Height,
        [System.Drawing.Color]$BackColor,
        [string]$Text = "",
        [int]$FontSize = 400
    )

    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear($BackColor)

    if ($Text) {
        $brush = New-Object System.Drawing.SolidBrush($violet)
        $font = New-Object System.Drawing.Font('Arial', $FontSize, [System.Drawing.FontStyle]::Bold)
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $format.LineAlignment = [System.Drawing.StringAlignment]::Center
        $rect = New-Object System.Drawing.RectangleF(0, 0, $Width, $Height)
        $graphics.DrawString($Text, $font, $brush, $rect, $format)
        $font.Dispose()
        $brush.Dispose()
    }

    $graphics.Dispose()
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()

    Write-Host "Created $Path ($Width x $Height)"
}

# Create all required assets
Create-SolidPNG -Path "icon.png" -Width 1024 -Height 1024 -BackColor $purple -Text "F" -FontSize 600
Create-SolidPNG -Path "splash.png" -Width 2048 -Height 2048 -BackColor $purple -Text "فقش" -FontSize 400
Create-SolidPNG -Path "adaptive-icon.png" -Width 1024 -Height 1024 -BackColor $purple -Text "F" -FontSize 600
Create-SolidPNG -Path "favicon.png" -Width 48 -Height 48 -BackColor $purple

Write-Host "`n✅ All placeholder assets created successfully!"
