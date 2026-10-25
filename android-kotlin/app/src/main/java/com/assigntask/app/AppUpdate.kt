package com.assigntask.app

import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.widget.Toast
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
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

/** Live state of a DownloadManager job, used to show progress in the update dialog. */
data class DownloadState(val status: Int, val done: Long, val total: Long) {
    val finished: Boolean get() = status == DownloadManager.STATUS_SUCCESSFUL
    val failed: Boolean get() = status == DownloadManager.STATUS_FAILED
    val running: Boolean get() = status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PENDING
    val percent: Int get() = if (total > 0) ((done * 100) / total).toInt() else 0
}

object AppUpdate {
    const val VERSION_URL = "https://whatanagent-a1e59.web.app/downloads/version.json"
    private const val CHANNEL_ID = "app_updates"
    private const val PREFS = "align_prefs"
    private const val KEY_LAST_CHECK = "lastUpdateCheck"
    private const val KEY_PENDING_ID = "pendingDownloadId"
    private const val KEY_PENDING_VER = "pendingDownloadVersion"
    private const val NOTIF_ID = 9911

    /** Foreground re-checks are throttled to this; the loop inside the app still runs every 4 hours. */
    const val FOREGROUND_CHECK_MINUTES = 15L

    /**
     * Master switch for the in-app updater.
     *
     * Turned OFF on request (2026-10-25): builds are installed manually from the download link, so
     * the app must never show an update dialog or download anything by itself. Set it back to true
     * to re-enable checking, prefetch and the dialog.
     */
    const val ENABLED = false

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

    /** Throttled check gate (force = true bypasses it). */
    fun shouldCheck(context: Context, force: Boolean, minMinutes: Long = 60L): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val last = prefs.getLong(KEY_LAST_CHECK, 0L)
        if (!force && System.currentTimeMillis() - last < minMinutes * 60_000L) return false
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

    fun pendingId(context: Context): Long =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_PENDING_ID, -1L)

    fun clearPending(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(KEY_PENDING_ID).remove(KEY_PENDING_VER).apply()
    }

    /** True on Wi-Fi and other unmetered links — safe for a silent prefetch of the next APK. */
    fun onUnmetered(context: Context): Boolean = try {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork
        val caps = if (net == null) null else cm.getNetworkCapabilities(net)
        caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    } catch (_: Exception) {
        false
    }

    /**
     * Starts (or resumes) the APK download and remembers its id, so a finished download can still be
     * installed after the app was killed. allowMetered = false keeps the quiet prefetch on Wi-Fi.
     */
    fun ensureDownload(context: Context, info: UpdateInfo, allowMetered: Boolean): Long? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val known = prefs.getLong(KEY_PENDING_ID, -1L)
        if (known > 0 && prefs.getString(KEY_PENDING_VER, "") == info.versionName) {
            val st = describe(context, known)
            if (st != null && (st.running || st.finished)) return known
        }
        return try {
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val req = DownloadManager.Request(Uri.parse(info.apkUrl))
                .setTitle("AlignTasks " + info.versionName)
                .setDescription("Downloading update…")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverMetered(allowMetered)
                .setAllowedOverRoaming(false)
                .setDestinationInExternalFilesDir(
                    context, Environment.DIRECTORY_DOWNLOADS, "aligntasks-" + info.versionName + ".apk"
                )
            val id = dm.enqueue(req)
            prefs.edit().putLong(KEY_PENDING_ID, id).putString(KEY_PENDING_VER, info.versionName).apply()
            id
        } catch (_: Exception) {
            null
        }
    }

    fun describe(context: Context, id: Long): DownloadState? {
        if (id <= 0) return null
        return try {
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.query(DownloadManager.Query().setFilterById(id)).use { c ->
                if (!c.moveToFirst()) return null
                DownloadState(
                    status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)),
                    done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
                    total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Where the prefetched APK lands (also used by the silent device-owner install). */
    fun apkPath(context: Context, versionName: String): File =
        File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "aligntasks-" + versionName + ".apk")

    /** Package name + version check, so a truncated or foreign APK never reaches the installer. */
    fun verifyDownloaded(context: Context, versionName: String): Boolean {
        val apk = apkPath(context, versionName)
        if (!apk.exists() || apk.length() < 100_000L) return false
        return try {
            val pi = context.packageManager.getPackageArchiveInfo(apk.absolutePath, 0) ?: return false
            pi.packageName == context.packageName && versionCodeOf(pi) > BuildConfig.VERSION_CODE
        } catch (_: Exception) {
            false
        }
    }

    /** Device-owner only: installs the downloaded APK with no dialog and no tap. */
    fun installSilently(context: Context, versionName: String): Boolean =
        DeviceOwner.installSilently(context, apkPath(context, versionName), versionName)

    @Suppress("DEPRECATION")
    private fun versionCodeOf(pi: android.content.pm.PackageInfo): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) pi.longVersionCode.toInt() else pi.versionCode

    /** Hands the finished download to the system installer (Android shows its own confirm screen). */
    fun install(context: Context, id: Long): Boolean = try {
        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val uri = dm.getUriForDownloadedFile(id)
        if (uri == null) {
            Toast.makeText(context, "Open Downloads and tap the AlignTasks APK.", Toast.LENGTH_LONG).show()
            false
        } else {
            context.startActivity(
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            true
        }
    } catch (_: Exception) {
        Toast.makeText(context, "Open Downloads and tap the AlignTasks APK.", Toast.LENGTH_LONG).show()
        false
    }

    /** Install whatever download is currently pending (used as the fallback after a blocked silent install). */
    fun installPending(context: Context, versionName: String) {
        val id = pendingId(context)
        if (id <= 0 || !verifyDownloaded(context, versionName)) return
        install(context, id)
    }
}

/**
 * Checks the published manifest and, on Wi-Fi, prefetches the APK quietly so the only thing left
 * for the user is the Install tap. Returns the update info when a newer build exists.
 */
private suspend fun checkAndPrefetch(context: Context, bypassThrottle: Boolean): UpdateInfo? {
    if (!bypassThrottle && !AppUpdate.shouldCheck(context, false, AppUpdate.FOREGROUND_CHECK_MINUTES)) return null
    val fetched = AppUpdate.fetch()
    if (!AppUpdate.isNewer(fetched) || fetched == null) return null
    AppUpdate.notifyAvailable(context, fetched)
    if (AppUpdate.onUnmetered(context)) AppUpdate.ensureDownload(context, fetched, allowMetered = false)
    return fetched
}

/**
 * Drop this once at the root of the UI: keeps the app on the newest published build.
 *
 * Without Play Store or an MDM, Android always shows its own Install confirmation, so the goal is
 * to reduce the whole update to ONE tap — the APK is prefetched and verified, then the dialog only
 * offers "Install now".
 */
@Composable
fun AppUpdateGate(force: Boolean = false) {
    if (!AppUpdate.ENABLED) return

    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var info by remember { mutableStateOf<UpdateInfo?>(null) }
    var downloadId by remember { mutableStateOf(-1L) }
    var state by remember { mutableStateOf<DownloadState?>(null) }
    var ready by remember { mutableStateOf(false) }
    var silent by remember { mutableStateOf(false) }
    var dismissed by remember { mutableStateOf(false) }
    var resumes by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        val found = checkAndPrefetch(context, force)
        if (found != null) {
            info = found
            val pending = AppUpdate.pendingId(context)
            if (pending > 0) downloadId = pending
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) resumes++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Every return to the foreground (throttled) …
    LaunchedEffect(resumes) {
        if (resumes == 0) return@LaunchedEffect
        val found = checkAndPrefetch(context, false)
        if (found != null) {
            info = found
            val pending = AppUpdate.pendingId(context)
            if (pending > 0) downloadId = pending
        }
    }

    // … and the 4-hour loop while the app stays open, so long-running sessions still update.
    LaunchedEffect(Unit) {
        while (true) {
            delay(4 * 60 * 60 * 1000L)
            val found = checkAndPrefetch(context, true)
            if (found != null) {
                info = found
                val pending = AppUpdate.pendingId(context)
                if (pending > 0) downloadId = pending
            }
        }
    }

    LaunchedEffect(downloadId) {
        if (downloadId <= 0) return@LaunchedEffect
        while (true) {
            val st = AppUpdate.describe(context, downloadId)
            state = st
            if (st == null || st.finished || st.failed) break
            delay(1200)
        }
        val landed = AppUpdate.describe(context, downloadId)
        state = landed
        if (landed != null && landed.finished) {
            val versionName = info?.versionName ?: ""
            ready = AppUpdate.verifyDownloaded(context, versionName)
            // Enrolled device-owner phones update themselves with no dialog and no tap at all.
            if (ready && DeviceOwner.isDeviceOwner(context)) {
                if (AppUpdate.installSilently(context, versionName)) silent = true
            }
        }
        if (landed != null && landed.failed) AppUpdate.clearPending(context)
    }

    val current = info
    if (current == null || silent || (dismissed && !current.mandatory)) return

    val st = state
    AlertDialog(
        onDismissRequest = { if (!current.mandatory) dismissed = true },
        title = { Text((if (ready) "Ready to install — " else "Update available — ") + current.versionName) },        text = {
            Column {
                Text(
                    if (current.notes.isNotBlank()) current.notes
                    else "A newer version of AlignTasks is ready to install."
                )
                Spacer(Modifier.height(12.dp))
                when {
                    ready -> Text("Downloaded and verified. Tap Install now — Android asks once to confirm.")
                    st != null && st.failed -> Text("The download failed. Tap Retry to try again.")
                    st != null && st.running -> {
                        LinearProgressIndicator(
                            progress = { if (st.total > 0) st.done.toFloat() / st.total else 0f },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            if (st.total > 0) "Downloading… " + st.percent + "%"
                            else "Downloading… " + (st.done / 1048576L) + " MB"
                        )
                    }
                    else -> Text("Tap Download to fetch the update, then Install.")
                }
            }
        },
        confirmButton = {
            when {
                ready -> TextButton(onClick = {
                    AppUpdate.install(context, downloadId)
                    if (!current.mandatory) dismissed = true
                }) { Text("Install now") }
                st != null && st.running -> TextButton(onClick = { }, enabled = false) { Text("Downloading…") }
                else -> TextButton(onClick = {
                    AppUpdate.ensureDownload(context, current, allowMetered = true)?.let { downloadId = it }
                }) { Text(if (st != null && st.failed) "Retry download" else "⬇️ Download") }
            }
        },
        dismissButton = if (!current.mandatory) {
            { TextButton(onClick = { dismissed = true }) { Text("Later") } }
        } else null
    )
}
