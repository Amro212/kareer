Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot '../docs/store-assets/chrome'
foreach ($asset in @(
    @{ Name = 'promo-small'; Width = 440; Height = 280 },
    @{ Name = 'promo-marquee'; Width = 1400; Height = 560 }
)) {
    $source = [System.Drawing.Image]::FromFile((Join-Path $assetDir "$($asset.Name)-master.png"))
    $bitmap = New-Object System.Drawing.Bitmap($asset.Width, $asset.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb))
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($source, 0, 0, $asset.Width, $asset.Height)
        $target = Join-Path $assetDir "$($asset.Name).png"
        $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
        $source.Dispose()
    }
    $check = [System.Drawing.Image]::FromFile($target)
    try {
        if ($check.Width -ne $asset.Width -or $check.Height -ne $asset.Height -or $check.PixelFormat -ne [System.Drawing.Imaging.PixelFormat]::Format24bppRgb) {
            throw "Invalid store image: $target"
        }
        Write-Output "$($asset.Name): $($check.Width)x$($check.Height), RGB, no alpha"
    } finally { $check.Dispose() }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../src/targets/extension/icons/icon-128.png') -Destination (Join-Path $assetDir 'store-icon.png')
