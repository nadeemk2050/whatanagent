$ErrorActionPreference = 'Stop'
$root = Resolve-Path .
$dist = Join-Path $root 'alqaryan-site\dist'
$tempDir = Join-Path $dist 'temp_pkg'
$targetDir = Join-Path $tempDir 'alqaryan-scrap-market'
$zipPath = Join-Path $dist 'alqaryan-scrap-market-0.3.9.zip'

if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

Copy-Item -Path (Join-Path $root 'alqaryan-site\scrap-market\*') -Destination $targetDir -Recurse

if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path $targetDir -DestinationPath $zipPath

Remove-Item -Recurse -Force $tempDir
Get-Item $zipPath | Select-Object Name, Length, LastWriteTime
