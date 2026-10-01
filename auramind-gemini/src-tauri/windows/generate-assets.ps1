# Renders the Windows-only brand assets from icons/icon.png.
# Run from auramind-gemini/src-tauri:  powershell -ExecutionPolicy Bypass -File windows/generate-assets.ps1
# Outputs are committed; rerun only when the mark or palette changes.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$mark = [System.Drawing.Image]::FromFile((Join-Path $root 'icons/icon.png'))
$navy = [System.Drawing.ColorTranslator]::FromHtml('#060a16')
$violet = [System.Drawing.ColorTranslator]::FromHtml('#7C3AED')
$violetLight = [System.Drawing.ColorTranslator]::FromHtml('#8B5CF6')
$pink = [System.Drawing.ColorTranslator]::FromHtml('#FF9ACD')

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'
  return @($bmp, $g)
}

# Tray icons (32x32): the mark, and the mark with a "due" dot.
foreach ($variant in 'tray', 'tray-due') {
  $bmp, $g = New-Canvas 32 32
  $g.DrawImage($mark, 0, 0, 32, 32)
  if ($variant -eq 'tray-due') {
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $navy), 19, 19, 13, 13)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $violetLight), 21, 21, 9, 9)
  }
  $bmp.Save((Join-Path $root "icons/$variant.png"), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

# Taskbar overlay badges (32x32; Windows draws them at 16x16 logical).
New-Item -ItemType Directory -Force (Join-Path $root 'icons/badges') | Out-Null
$labels = @('1','2','3','4','5','6','7','8','9','9+')
foreach ($label in $labels) {
  $bmp, $g = New-Canvas 32 32
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $violet), 0, 0, 31, 31)
  $size = if ($label.Length -gt 1) { 13 } else { 18 }
  $font = New-Object System.Drawing.Font 'Segoe UI Semibold', $size, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString($label, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 1, 32, 32), $fmt)
  $file = if ($label -eq '9+') { '9plus' } else { $label }
  $bmp.Save((Join-Path $root "icons/badges/$file.png"), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

# NSIS installer art (24-bit BMP): header 150x57, sidebar 164x314.
function Save-Aurora([int]$w, [int]$h, [string]$name, [int]$markSize, [bool]$withWordmark) {
  $bmp, $g = New-Canvas $w $h
  $g.Clear($navy)
  foreach ($glow in @(@($violet, 0.55, 0.30, 0.9), @($pink, 0.20, 0.85, 0.6))) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $cx = $w * $glow[1]; $cy = $h * $glow[2]; $r = [Math]::Max($w, $h) * $glow[3]
    $path.AddEllipse($cx - $r / 2, $cy - $r / 2, $r, $r)
    $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
    $brush.CenterColor = [System.Drawing.Color]::FromArgb(110, $glow[0]); $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $glow[0]))
    $g.FillPath($brush, $path)
  }
  $x = if ($withWordmark) { ($w - $markSize) / 2 } else { $w - $markSize - 8 }
  $y = if ($withWordmark) { $h * 0.30 } else { ($h - $markSize) / 2 }
  $g.DrawImage($mark, [int]$x, [int]$y, $markSize, $markSize)
  if ($withWordmark) {
    $font = New-Object System.Drawing.Font 'Segoe UI Semilight', 20, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'
    $g.DrawString('AuraMind', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, ($y + $markSize + 10), $w, 30), $fmt)
  }
  $flat = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $fg = [System.Drawing.Graphics]::FromImage($flat); $fg.DrawImage($bmp, 0, 0, $w, $h); $fg.Dispose()
  $flat.Save((Join-Path $root "windows/$name"), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $flat.Dispose(); $g.Dispose(); $bmp.Dispose()
}
Save-Aurora 150 57 'nsis-header.bmp' 40 $false
Save-Aurora 164 314 'nsis-sidebar.bmp' 72 $true
$mark.Dispose()
Write-Host 'Generated tray, badge and installer assets.'
