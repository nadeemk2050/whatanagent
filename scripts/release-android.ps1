<#
  AlignTasks — ONE-COMMAND Android release ritual
  ===============================================
  WHAT IT DOES
    1. bumps versionCode (+1) and sets versionName in android-kotlin/app/build.gradle.kts
    2. builds the SIGNED release APK (permanent keystore — android-kotlin/keystore.properties)
    3. publishes it to public/downloads/aligntasks-<version>.apk (older APKs are removed)
    4. rewrites public/downloads/version.json  ->  what the in-app updater reads
    5. commits + pushes, then deploys Firebase hosting

  USAGE
    powershell -ExecutionPolicy Bypass -File scripts/release-android.ps1 -VersionName 2.1 -Notes "Fixed task reminders"
    powershell -ExecutionPolicy Bypass -File scripts/release-android.ps1 -VersionName 2.2 -Notes "Critical fix" -Mandatory

  NOTES
    • -Mandatory  forces the update dialog (no "Later" button).
    • -SkipBuild  reuses the last built APK (handy for re-publishing after a text change).
    • The keystore lives OUTSIDE this public repo:  C:\app2026\aligntasks-keystore\aligntasks-release.jks
      Its password is in that folder's KEYSTORE-CREDENTIALS.txt — keep both backed up forever.

  AFTER IT RUNS
    Every installed app offers the update: a notification + "⬇️ Update now" dialog (checked at most
    once an hour, and on every app start). Installing is one tap — Android always shows its own
    confirmation for sideloaded APKs (only Google Play / MDM can update fully silently).
#>
param(
    [Parameter(Mandatory = $true)][string]$VersionName,
    [string]$Notes = "",
    [switch]$Mandatory,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    # 1. bump the version
    $gradle = Join-Path $root 'android-kotlin\app\build.gradle.kts'
    $text = Get-Content $gradle -Raw
    $m = [regex]::Match($text, 'versionCode\s*=\s*(\d+)')
    if (-not $m.Success) { throw 'versionCode not found in android-kotlin/app/build.gradle.kts' }
    $nextCode = [int]$m.Groups[1].Value + 1
    $text = [regex]::Replace($text, 'versionCode\s*=\s*\d+', ('versionCode = ' + $nextCode))
    $text = [regex]::Replace($text, 'versionName\s*=\s*"[^"]*"', ('versionName = "' + $VersionName + '"'))
    Set-Content -Path $gradle -Value $text -NoNewline
    Write-Host "-> version set to $VersionName (versionCode $nextCode)"

    # 2. build the signed release APK
    if (-not $SkipBuild) {
        Push-Location (Join-Path $root 'android-kotlin')
        & .\gradlew.bat assembleRelease --console=plain
        $code = $LASTEXITCODE
        Pop-Location
        if ($code -ne 0) { throw "gradle assembleRelease failed (exit $code)" }
    }

    # 3. publish it
    $apk = Join-Path $root 'android-kotlin\app\build\outputs\apk\release\app-release.apk'
    if (-not (Test-Path $apk)) { throw "APK not found: $apk" }
    $dl = Join-Path $root 'public\downloads'
    New-Item -ItemType Directory -Force -Path $dl | Out-Null
    Get-ChildItem $dl -Filter '*.apk' -ErrorAction SilentlyContinue | Remove-Item -Force
    $target = Join-Path $dl ("aligntasks-$VersionName.apk")
    Copy-Item $apk $target -Force
    Write-Host ("-> published aligntasks-$VersionName.apk (" + [math]::Round((Get-Item $target).Length / 1MB, 2) + " MB)")

    # 4. update the manifest the app reads
    $manifest = [ordered]@{
        versionCode = $nextCode
        versionName = $VersionName
        apkUrl      = "https://whatanagent-a1e59.web.app/downloads/aligntasks-$VersionName.apk"
        notes       = $Notes
        mandatory   = [bool]$Mandatory
        publishedAt = (Get-Date -Format 'yyyy-MM-dd')
    } | ConvertTo-Json
    Set-Content -Path (Join-Path $dl 'version.json') -Value $manifest -Encoding UTF8
    Write-Host '-> version.json updated'

    # 5. ship it
    git add -A
    git commit -m "Android release $VersionName (versionCode $nextCode)"
    git push origin master
    npx firebase deploy --only hosting --project whatanagent-a1e59

    Write-Host ''
    Write-Host "DONE - AlignTasks $VersionName is live:"
    Write-Host '   https://whatanagent-a1e59.web.app/downloads/'
    Write-Host '   Devices will offer the update automatically (notification + one tap).'
}
finally {
    Pop-Location
}
