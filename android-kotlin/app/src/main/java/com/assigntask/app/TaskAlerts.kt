package com.assigntask.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import java.text.SimpleDateFormat
import java.util.*

/**
 * On-device task alerts (Phase 5a).
 *
 * FCM push needs google-services.json — until that file is added, the phone raises the same
 * alerts itself: due-soon / overdue tasks, a morning plan and an evening wrap-up, with the same
 * rules as the server ladder (quiet hours 21:00–08:00, max 5 alerts per day, no repeats).
 * The channels and payload shape match what FCM will use, so switching over is trivial.
 */
object TaskAlerts {
    private const val CH_TASK = "task_alerts"
    private const val CH_DIGEST = "task_digest"
    private const val PREFS = "task_alerts"
    private const val MAX_PER_DAY = 5
    private const val QUIET_FROM = 21
    private const val QUIET_TO = 8
    private val HOURS = SimpleDateFormat("yyyy-MM-dd HH", Locale.US)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun hour(): Int = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    private fun quietNow(): Boolean = hour() >= QUIET_FROM || hour() < QUIET_TO
    private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    private fun budgetLeft(ctx: Context): Boolean {
        val p = prefs(ctx)
        val day = p.getString("day", "") ?: ""
        var used = if (day == today()) p.getInt("used", 0) else 0
        if (used >= MAX_PER_DAY) return false
        used += 1
        p.edit().putString("day", today()).putInt("used", used).apply()
        return true
    }

    private fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CH_TASK) == null) {
            nm.createNotificationChannel(NotificationChannel(CH_TASK, "Task alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "A task is due now or soon"
            })
        }
        if (nm.getNotificationChannel(CH_DIGEST) == null) {
            nm.createNotificationChannel(NotificationChannel(CH_DIGEST, "Daily plan", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Morning plan and evening wrap-up"
            })
        }
    }

    private fun show(ctx: Context, id: Int, channel: String, title: String, body: String) {
        ensureChannels(ctx)
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id, n) } catch (e: Exception) { /* ignore */ }
    }

    private fun dueMs(raw: Any?): Long = when (raw) {
        null -> 0L
        is String -> {
            val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US)
            runCatching { f.parse(raw.substring(0, 16))?.time ?: 0L }.getOrDefault(0L)
        }
        is com.google.firebase.Timestamp -> raw.toDate().time
        is Date -> raw.time
        is Long -> raw
        else -> 0L
    }

    /** Called periodically while the app runs. Reads the team board and raises alerts. */
    fun check(ctx: Context, myEmail: String) {
        if (quietNow()) return
        Firebase.firestore.collection("$BASE_FOR_ALERTS/tasks_for_all").limit(300).get()
            .addOnSuccessListener { snap ->
                val now = System.currentTimeMillis()
                val p = prefs(ctx)
                val sdf = SimpleDateFormat("dd MMM, h:mm a", Locale.getDefault())
                val pending = snap.documents.mapNotNull { d ->
                    val v = d.data ?: return@mapNotNull null
                    if ((v["status"] as? String) == "Done") return@mapNotNull null
                    val me = (v["assigneeEmail"] as? String)?.lowercase() ?: ""
                    if (myEmail.isNotBlank() && me.isNotBlank() && me != myEmail.lowercase()) return@mapNotNull null
                    val due = dueMs(v["dueDate"])
                    Triple(d.id, (v["description"] as? String) ?: "Task", due)
                }
                // due-soon / overdue alerts (one per task per kind)
                pending.forEach { (id, desc, due) ->
                    if (due <= 0L) return@forEach
                    val overdue = due < now
                    val soon = due in now..(now + 60 * 60 * 1000)
                    if (!overdue && !soon) return@forEach
                    val key = id + if (overdue) "_over" else "_soon"
                    if (p.getBoolean(key, false)) return@forEach
                    if (!budgetLeft(ctx)) return@forEach
                    p.edit().putBoolean(key, true).apply()
                    if (overdue) show(ctx, id.hashCode(), CH_TASK, "⏰ Overdue: " + desc.take(60), "Due " + sdf.format(Date(due)) + " — reply DONE on WhatsApp when finished.")
                    else show(ctx, id.hashCode(), CH_TASK, "⏳ Due in " + ((due - now) / 60000) + " min", desc.take(90))
                }
                // morning plan / evening wrap-up (once per window per day)
                val h = hour()
                val stage = when {
                    h in 8..9 -> "morning"
                    h in 18..19 -> "evening"
                    else -> ""
                }
                if (stage.isNotBlank() && pending.isNotEmpty()) {
                    val dayKey = "digest_" + stage + "_" + today()
                    if (!p.getBoolean(dayKey, false) && budgetLeft(ctx)) {
                        p.edit().putBoolean(dayKey, true).apply()
                        val head = if (stage == "morning") "🌅 Your plan for today" else "🌙 Still pending today"
                        val body = pending.sortedBy { it.third }.take(6)
                            .joinToString("\n") { "• " + it.second.take(60) + if (it.third > 0) " — " + sdf.format(Date(it.third)) else "" }
                        show(ctx, 9000 + stage.hashCode(), CH_DIGEST, head, pending.size.toString() + " pending\n" + body)
                    }
                }
            }
    }

    private const val BASE_FOR_ALERTS = "artifacts/1:410197132578:web:97cfc3ae33f39ed3df917b/public/data"
}
