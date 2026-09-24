<#
  Assemble src\index.html en un fichier HTML unique et autonome (sans Node.js).
  Usage :  powershell -ExecutionPolicy Bypass -File .\build.ps1
  Sortie : dist\Mapping_NAV_BC.html
#>
$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$src    = Join-Path $root 'src\index.html'
$srcDir = Split-Path -Parent $src
$outDir = Join-Path $root 'dist'
$out    = Join-Path $outDir 'Mapping_NAV_BC.html'
$utf8   = New-Object System.Text.UTF8Encoding($false)

function Read-Rel([string]$rel) {
  $p = [System.IO.Path]::GetFullPath((Join-Path $srcDir $rel))
  if (-not (Test-Path $p)) { throw "Fichier introuvable : $p" }
  return [System.IO.File]::ReadAllText($p, $utf8)
}

$html = [System.IO.File]::ReadAllText($src, $utf8)

$html = [regex]::Replace($html, '<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', {
  param($m)
  $css = (Read-Rel $m.Groups[1].Value) -replace '(?i)</style', '<\/style'
  return "<style>`n$css`n</style>"
})

$html = [regex]::Replace($html, '<script\s+src="([^"]+)"\s*></script>', {
  param($m)
  $js = (Read-Rel $m.Groups[1].Value) -replace '(?i)</script', '<\/script'
  return "<script>`n$js`n</script>"
})

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
[System.IO.File]::WriteAllText($out, $html, $utf8)
$kb = [math]::Round((Get-Item $out).Length / 1KB)
Write-Host "OK : $out ($kb Ko)"
