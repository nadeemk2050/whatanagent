# Generates the Android device-owner provisioning QR for AlignTasks.
#
# Enrolling a phone this way makes AlignTasks its device owner, which is what allows the app to
# install its own updates with no dialog and no taps (no Play Store, no MDM server needed).
#
# Usage (from the repo root, after the APK is published):
#   powershell -File scripts/mdm-qr.ps1
#   powershell -File scripts/mdm-qr.ps1 -Version 2.9 -Base https://whatanagent-a1e59.web.app
#
# Outputs: public/downloads/mdm-enroll.json and public/downloads/mdm-enroll-qr.png
param(
    [string]$Base = "https://whatanagent.duckdns.org",
    [string]$Version
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $Version) {
    $manifest = Invoke-RestMethod "$Base/downloads/version.json" -TimeoutSec 30
    $Version = $manifest.versionName
    Write-Host "Latest published version: $Version"
}

$apkUrl = "$Base/downloads/aligntasks-$Version.apk"
$tmp = Join-Path $env:TEMP "aligntasks-$Version-enroll.apk"
Write-Host "Downloading $apkUrl"
Invoke-WebRequest -Uri $apkUrl -OutFile $tmp -UseBasicParsing

$sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash([System.IO.File]::ReadAllBytes($tmp))
$checksum = [Convert]::ToBase64String($sha).Replace('+', '-').Replace('/', '_').TrimEnd('=')
Write-Host "sha256 (base64url): $checksum"

$payload = [ordered]@{
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME"          = "com.assigntask.app/com.assigntask.app.AlignDeviceAdminReceiver"
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION" = $apkUrl
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM"        = $checksum
    "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED"        = $true
    "android.app.extra.PROVISIONING_SKIP_ENCRYPTION"                      = $true
} | ConvertTo-Json -Compress

$outDir = Join-Path $root "public\downloads"
$jsonPath = Join-Path $outDir "mdm-enroll.json"
$pngPath = Join-Path $outDir "mdm-enroll-qr.png"
$payload | Set-Content -Path $jsonPath -Encoding utf8
Write-Host "Wrote $jsonPath"

python -c "import qrcode" 2>$null
if (-not $?) {
    Write-Host "Installing python qrcode…"
    python -m pip install --quiet "qrcode[pil]" | Out-Null
}

$env:ALIGN_QR_PAYLOAD = $payload
$env:ALIGN_QR_OUT = $pngPath
python -c "import os, qrcode; qr = qrcode.QRCode(box_size=8, border=3); qr.add_data(os.environ['ALIGN_QR_PAYLOAD']); qr.make(fit=True); qr.make_image(fill_color='black', back_color='white').save(os.environ['ALIGN_QR_OUT'])"
Remove-Item Env:\ALIGN_QR_PAYLOAD, Env:\ALIGN_QR_OUT -ErrorAction SilentlyContinue
Remove-Item $tmp -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "QR image : $pngPath"
Write-Host "QR url   : $Base/downloads/mdm-enroll-qr.png"
Write-Host ""
Write-Host "Enrol a phone (one time, per device):"
Write-Host "  1. Factory reset the phone."
Write-Host "  2. On the welcome screen tap the same spot 6 times -> QR reader opens."
Write-Host "  3. Scan the QR above; the phone downloads AlignTasks, installs it and makes it device owner."
Write-Host "  Alternative with a PC:  adb shell dpm set-device-owner com.assigntask.app/.AlignDeviceAdminReceiver"
Write-Host ""
Write-Host "Afterwards every release installs itself silently on that phone."
