package com.assigntask.app

import android.app.PendingIntent
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.widget.Toast
import java.io.File
import java.io.FileInputStream

/**
 * Self-hosted, zero-touch updates without Play Store and without a separate MDM server.
 *
 * A phone is enrolled ONCE (factory reset + QR scan, or `adb shell dpm set-device-owner`), which
 * makes AlignTasks the device owner. From then on the app installs its own updates silently through
 * PackageInstaller — no dialog, no "Install" tap, nothing for the user to do.
 *
 * Android 14+ restricts silent updates to the "update owner"; if the platform refuses, the call
 * fails and we simply fall back to the normal one-tap installer, so nothing ever breaks.
 */
object DeviceOwner {
    fun adminComponent(context: Context) = ComponentName(context, AlignDeviceAdminReceiver::class.java)

    fun isDeviceOwner(context: Context): Boolean = try {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        dpm.isDeviceOwnerApp(context.packageName)
    } catch (_: Exception) {
        false
    }

    fun isAdminActive(context: Context): Boolean = try {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        dpm.isAdminActive(adminComponent(context))
    } catch (_: Exception) {
        false
    }

    /** Installs the downloaded APK with no user interaction. Only possible as device owner. */
    fun installSilently(context: Context, apk: File, versionName: String): Boolean {
        if (!isDeviceOwner(context) || !apk.exists() || apk.length() < 100_000L) return false
        return try {
            val installer = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val sessionId = installer.createSession(params)
            installer.openSession(sessionId).use { session ->
                FileInputStream(apk).use { input ->
                    session.openWrite("aligntasks.apk", 0, apk.length()).use { out ->
                        input.copyTo(out)
                        session.fsync(out)
                    }
                }
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
                val result = PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    Intent(context, InstallResultReceiver::class.java)
                        .setAction(InstallResultReceiver.ACTION_INSTALL_RESULT)
                        .putExtra(InstallResultReceiver.EXTRA_VERSION, versionName),
                    flags
                )
                session.commit(result.intentSender)
            }
            true
        } catch (e: Exception) {
            Toast.makeText(
                context,
                "Silent update unavailable — falling back to the normal installer.",
                Toast.LENGTH_LONG
            ).show()
            false
        }
    }
}

/** Receives the outcome of a silent install session and falls back to the prompt on failure. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        val versionName = intent.getStringExtra(EXTRA_VERSION) ?: ""
        if (status == PackageInstaller.STATUS_SUCCESS) {
            AppUpdate.clearPending(context)
            Toast.makeText(context, "AlignTasks updated to $versionName.", Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(
                context,
                "Silent update blocked: " + (message ?: "code $status"),
                Toast.LENGTH_LONG
            ).show()
            AppUpdate.installPending(context, versionName)
        }
    }

    companion object {
        const val ACTION_INSTALL_RESULT = "com.assigntask.app.INSTALL_RESULT"
        const val EXTRA_VERSION = "versionName"
    }
}

/** Declares the device-admin component used for device-owner provisioning. */
class AlignDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        Toast.makeText(context, "AlignTasks is device owner — updates install automatically.", Toast.LENGTH_LONG)
            .show()
    }
}
