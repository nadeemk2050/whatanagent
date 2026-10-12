package com.assigntask.app

import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.widget.Toast
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * AlignTasks 2.0 — in-app updater.
 *
 * The app checks a tiny version manifest on our own hosting:
 *     https://whatanagent-a1e59.web.app/downloads/version.json
 * If its `versionCode` is higher than the installed build, the user gets a notification plus a
 * dialog. "Update now" downloads the new APK with DownloadManager and opens the system installer
 * (Android always shows that final confirmation — silent installs are only possible through
 * Google Play or an MDM device-owner).
 *
 * PUBLISHING A NEW VERSION = build the APK, copy it to public/downloads/, bump version.json.
 * See scripts/release-android.ps1 (one command).
 */
data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val notes: String,
    val mandatory: Boolean
)

object AppUpdate {
    const val VERSION_URL = "https://whatanagent-a1e59.web.app/downloads/version.json"
    private const val CHANNEL_ID = "app_updates"
    private const val PREFS = "align_prefs"
    private const val KEY_LAST_CHECK = "lastUpdateCheck"
    private const val NOTIF_ID = 9911

    /** Reads the published version manifest. Returns null when offline / manifest missing. */
    suspend fun fetch(): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val conn = (URL(VERSION_URL).openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                setRequestProperty("Cache-Control", "no-cache")
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val j = JSONObject(body)
            UpdateInfo(
                versionCode = j.optInt("versionCode", 0),
                versionName = j.optString("versionName", ""),
                apkUrl = j.optString("apkUrl", ""),
                notes = j.optString("notes", ""),
                mandatory = j.optBoolean("mandatory", false)
            )
        } catch (e: Exception) {
            null
        }
    }

    fun isNewer(info: UpdateInfo?): Boolean = info != null && info.versionCode > BuildConfig.VERSION_CODE

    /** At most one automatic check per hour (force = true bypasses the throttle). */
    fun shouldCheck(context: Context, force: Boolean): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val last = prefs.getLong(KEY_LAST_CHECK, 0L)
        if (!force && System.currentTimeMillis() - last < 60L * 60L * 1000L) return false
        prefs.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()
        return true
    }

    fun notifyAvailable(context: Context, info: UpdateInfo) {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                        description = "New AlignTasks versions"
                    }
                )
            }
            val open = PendingIntent.getActivity(
                context, NOTIF_ID,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val n = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("AlignTasks " + info.versionName + " is ready")
                .setContentText(if (info.notes.isNotBlank()) info.notes.take(140) else "Tap to open the app and update")
                .setAutoCancel(true)
                .setContentIntent(open)
                .build()
            nm.notify(NOTIF_ID, n)
        } catch (_: Exception) { }
    }

    /** Downloads the APK and opens the installer as soon as it is complete. */
    fun downloadAndInstall(context: Context, info: UpdateInfo) {
        try {
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val req = DownloadManager.Request(Uri.parse(info.apkUrl))
                .setTitle("AlignTasks " + info.versionName)
                .setDescription("Downloading update…")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(
                    context, Environment.DIRECTORY_DOWNLOADS, "aligntasks-" + info.versionName + ".apk"
                )
            val id = dm.enqueue(req)
            Toast.makeText(context, "Downloading AlignTasks ${info.versionName}…", Toast.LENGTH_LONG).show()

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    if (intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != id) return
                    try { ctx?.unregisterReceiver(this) } catch (_: Exception) { }
                    installDownloaded(context, dm, id)
                }
            }
            val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            if (Build.VERSION.SDK_INT >= 33) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receiver, filter)
            }
        } catch (e: Exception) {
            // fallback — let the browser handle the download
            try {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse(info.apkUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (_: Exception) { }
        }
    }

    private fun installDownloaded(context: Context, dm: DownloadManager, id: Long) {
        val uri = dm.getUriForDownloadedFile(id) ?: return
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Open the downloaded file to finish installing.", Toast.LENGTH_LONG).show()
        }
    }
}

/** Drop this once at the root of the UI: it checks for updates and shows the dialog. */
@Composable
fun AppUpdateGate(force: Boolean = false) {
    val context = LocalContext.current
    var info by remember { mutableStateOf<UpdateInfo?>(null) }
    var dismissed by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (!AppUpdate.shouldCheck(context, force)) return@LaunchedEffect
        val fetched = AppUpdate.fetch()
        if (AppUpdate.isNewer(fetched)) {
            info = fetched
            fetched?.let { AppUpdate.notifyAvailable(context, it) }
        }
    }

    val current = info
    if (current != null && (!dismissed || current.mandatory)) {
        AlertDialog(
            onDismissRequest = { if (!current.mandatory) dismissed = true },
            title = { Text("Update available — " + current.versionName) },
            text = {
                Text(
                    if (current.notes.isNotBlank()) current.notes
                    else "A newer version of AlignTasks is ready to install."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    AppUpdate.downloadAndInstall(context, current)
                    dismissed = true
                }) { Text("⬇️ Update now") }
            },
            dismissButton = if (!current.mandatory) {
                { TextButton(onClick = { dismissed = true }) { Text("Later") } }
            } else null
        )
    }
}
