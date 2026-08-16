<#
  decomp.ps1 - decompile game.js back to original source files.
  Usage: .\decomp.ps1  (run from the comp/ folder)
#>
$ErrorActionPreference = "Stop"

$marker = [regex]"^;/\*([^*]+)\*/"
$src = Get-Content game.js -Raw
$mappings = Get-Content mappings.txt
$idx = 0
$splits = $src -split "(?=;/\*)"

foreach ($chunk in $splits) {
    if ($idx -ge $mappings.Count) { break }
    $name = $mappings[$idx] -replace '^/', ''
    $m = $marker.Match($chunk)
    if ($m.Success) {
        $body = $chunk.Substring($m.Value.Length)
        if ($name -eq "<INLINE_PLUGINS>") {
            Write-Host "<INLINE_PLUGINS> (embedded in game.js)"
        }
        else {
            $dir = Split-Path $name
            if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
            $body | Out-File -Encoding utf8 -FilePath $name
            Write-Host "$name  ($($body.Length) bytes)"
        }
    }
    $idx++
}

Write-Host ""
Write-Host "Decompiled $idx files from game.js."
