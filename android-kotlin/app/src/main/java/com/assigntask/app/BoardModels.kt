package com.assigntask.app

import com.google.firebase.Timestamp
import java.util.Date

/**
 * Board models beyond the team task that already exists in TaskItem.kt.
 *
 * Each one documents the Firestore path the PWA uses, so a document written on the phone is
 * byte-for-byte the same shape the browser writes.
 */

/** The web appId — the same document tree the browser and this app share. */
const val BOARD_APP_ID = "1:410197132578:web:97cfc3ae33f39ed3df917b"

/** `/artifacts/{appId}/public/data` — the PWA's `BOARD_BASE`. */
const val BOARD_BASE_PATH = "/artifacts/$BOARD_APP_ID/public/data"

/** Firestore timestamps arrive as Timestamp, Date, Number or {seconds,_seconds} — the web's `tsMsLocal`. */fun tsMs(v: Any?): Long = when (v) {
    null -> 0L
    is Timestamp -> v.toDate().time
    is Date -> v.time
    is Number -> v.toLong()
    is Map<*, *> -> {
        val secs = (v["seconds"] as? Number) ?: (v["_seconds"] as? Number)
        (secs?.toLong() ?: 0L) * 1000L
    }
    else -> {
        // Last resort for a type we cannot name here (keeps this file free of per-type code paths).
        val asDate = runCatching { v.javaClass.getMethod("toDate").invoke(v) as? Date }.getOrNull()
        asDate?.time ?: 0L
    }
}

private fun Map<String, Any?>.str(key: String): String = (this[key] as? String).orEmpty()
private fun Map<String, Any?>.bool(key: String): Boolean = (this[key] as? Boolean) ?: false
private fun Map<String, Any?>.num(key: String): Int = (this[key] as? Number)?.toInt() ?: 0

/**
 * A private task: `/artifacts/{appId}/public/data/users/{uid}/personal_tasks/{id}`
 * Fields mirror the PWA's personal-task form (description, category, priority, dueDate, notes, repeat).
 */
data class PersonalTask(
    val id: String = "",
    override val description: String = "",
    val category: String = "",
    val priority: String = "",
    override val status: String = "To Do",
    override val dueDate: String? = null,
    val notes: String = "",
    val repeat: String = "none",
    val createdAtRaw: Any? = null,
    val completedAtRaw: Any? = null,
    val completedBy: String = ""
) : TaskLike {
    override val assigneeEmail: String = ""     // personal tasks are never assigned
    override val createdAtMs: Long get() = tsMs(createdAtRaw)
    val isUrgent: Boolean get() = !isDone() && (parseDueMs(dueDate) ?: Long.MAX_VALUE) <= endOfDayMs(System.currentTimeMillis())

    companion object {
        fun from(id: String, d: Map<String, Any?>): PersonalTask = PersonalTask(
            id = id,
            description = d.str("description"),
            category = d.str("category"),
            priority = d.str("priority"),
            status = d.str("status").ifBlank { "To Do" },
            dueDate = (d["dueDate"] as? String)?.takeIf { it.isNotBlank() },
            notes = d.str("notes"),
            // the server stores repeat as { type: "daily" }; older docs may hold a plain string
            repeat = (d["repeat"] as? Map<*, *>)?.get("type") as? String
                ?: d.str("repeat").ifBlank { "none" },
            createdAtRaw = d["createdAt"],
            completedAtRaw = d["completedAt"],
            completedBy = d.str("completedByName").ifBlank { d.str("completedBy") }
        )
    }
}

/** `/users/{uid}/personal_projects/{id}` */
data class PersonalProject(
    val id: String = "",
    val name: String = "",
    val dueDate: String? = null,
    val createdAtRaw: Any? = null
) {
    val createdAtMs: Long get() = tsMs(createdAtRaw)

    companion object {
        fun from(id: String, d: Map<String, Any?>): PersonalProject = PersonalProject(
            id = id,
            name = d.str("name"),
            dueDate = d["dueDate"] as? String,
            createdAtRaw = d["createdAt"]
        )
    }
}

/** `/users/{uid}/personal_projects/{pid}/tasks/{id}` */
data class PersonalProjectTask(
    val id: String = "",
    override val description: String = "",
    override val status: String = "To Do",
    override val dueDate: String? = null,
    val createdAtRaw: Any? = null
) : TaskLike {
    override val assigneeEmail: String = ""
    override val createdAtMs: Long get() = tsMs(createdAtRaw)

    companion object {
        fun from(id: String, d: Map<String, Any?>): PersonalProjectTask = PersonalProjectTask(
            id = id,
            description = d.str("description"),
            status = d.str("status").ifBlank { "To Do" },
            dueDate = d["dueDate"] as? String,
            createdAtRaw = d["createdAt"]
        )
    }
}

/** `/artifacts/{appId}/public/data/invites/{code}` — what "Team Settings → Invites" creates. */
data class TeamInvite(
    val id: String = "",
    val code: String = "",
    val teamId: String = "",
    val role: String = "member",
    val message: String = "",
    val status: String = "active",
    val expiresAtRaw: Any? = null,
    val createdAtRaw: Any? = null,
    val createdBy: String = ""
) {
    val createdAtMs: Long get() = tsMs(createdAtRaw)
    val expiresMs: Long get() = tsMs(expiresAtRaw)
    val isRevoked: Boolean get() = status.equals("revoked", ignoreCase = true)
    val isExpired: Boolean get() = expiresMs > 0 && expiresMs < System.currentTimeMillis()

    companion object {
        fun from(id: String, d: Map<String, Any?>): TeamInvite = TeamInvite(
            id = id,
            code = d.str("code").ifBlank { id },
            teamId = d.str("teamId"),
            role = d.str("role").ifBlank { "member" },
            message = d.str("message"),
            status = d.str("status").ifBlank { "active" },
            expiresAtRaw = d["expiresAt"],
            createdAtRaw = d["createdAt"],
            createdBy = d.str("createdBy")
        )
    }
}

/** `/alignWaSchedules/{id}` — the "Scheduled Reminders" list. */
data class WaSchedule(
    val id: String = "",
    val title: String = "",
    val message: String = "",
    val groupName: String = "",
    val groupJid: String = "",
    val phone: String = "",
    val repeat: String = "",
    val whenText: String = "",
    val status: String = "",
    val createdAtRaw: Any? = null
) {
    val createdAtMs: Long get() = tsMs(createdAtRaw)
    val isCancelled: Boolean get() = status.equals("cancelled", ignoreCase = true) || status.equals("stopped", ignoreCase = true)

    companion object {
        fun from(id: String, d: Map<String, Any?>): WaSchedule = WaSchedule(
            id = id,
            title = d.str("title").ifBlank { d.str("taskText") },
            message = d.str("message"),
            groupName = d.str("groupName"),
            groupJid = d.str("groupJid").ifBlank { d.str("jid") },
            phone = d.str("phone"),
            repeat = d.str("repeat"),
            whenText = d.str("whenText").ifBlank { d.str("nextRunAt").ifBlank { d.str("sendAt") } },
            status = d.str("status"),
            createdAtRaw = d["createdAt"]
        )
    }
}

/** `appData/alignAnnounceConfig` — the "Group Updates" switches. */
data class AnnounceConfig(
    val groupJid: String = "",
    val groupName: String = "",
    val instant: Boolean = false,
    val weekly: Boolean = false,
    val weeklyDay: Int = 1,
    val weeklyHour: Int = 9
) {
    val isConfigured: Boolean get() = groupJid.isNotBlank()

    companion object {
        fun from(d: Map<String, Any?>): AnnounceConfig = AnnounceConfig(
            groupJid = d.str("groupJid"),
            groupName = d.str("groupName"),
            instant = d.bool("instantEnabled"),
            weekly = d.bool("weeklyEnabled"),
            weeklyDay = if (d["weeklyDay"] != null) d.num("weeklyDay") else 1,
            weeklyHour = if (d["weeklyHour"] != null) d.num("weeklyHour") else 9
        )
    }
}

/** A WhatsApp group/contact offered by `/api/align/wa/groups` and `/wa/contacts`. */
data class WaTarget(val jid: String = "", val name: String = "", val isGroup: Boolean = false)
