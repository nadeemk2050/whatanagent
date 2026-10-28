package com.assigntask.app

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Board logic — a deliberate port of the AlignTasks PWA's JavaScript.
 *
 * Everything in this file is pure (no Android, no Firebase) so it can be unit-tested on the JVM and
 * so the phone behaves exactly like the browser. Each function names the web function it mirrors;
 * if the web changes, the test in BoardLogicTest tells us.
 */

/** The four views of the PWA's view filter (`#view-nav-menu`). */
enum class TaskView(val key: String, val label: String) {
    ALL("all", "All"),
    TODAY("today", "Today's Tasks"),
    OVERDUE("overdue", "Overdue"),
    UNASSIGNED("unassigned", "Unassigned"),
    DONE("done", "Completed");

    companion object {
        /** The four shown in the pill (Unassigned is used by the tasks list only). */
        val menu: List<TaskView> = listOf(ALL, TODAY, OVERDUE, DONE)
        fun of(key: String?): TaskView = entries.firstOrNull { it.key == key } ?: ALL
    }
}

/** Anything the board can filter: a team task or a private personal task. */
interface TaskLike {
    val description: String
    val assigneeEmail: String
    val status: String
    val dueDate: String?
    val createdAtMs: Long
}

fun TaskLike.isDone(): Boolean = status.equals("Done", ignoreCase = true)

/** The whole filter state of the top bar (search box + assignee + view pill). Mirrors the globals
 *  `taskSearch`, `taskAssigneeFilter` and `taskView` in the web app. */
data class TaskFilter(
    val query: String = "",
    val assignee: String = "",
    val view: TaskView = TaskView.ALL
) {
    val isEmpty: Boolean get() = query.isBlank() && assignee.isBlank() && view == TaskView.ALL
}

// ---------------------------------------------------------------------------
// Dates — the web stores due dates as "yyyy-MM-dd" or "yyyy-MM-dd'T'HH:mm" strings.
// ---------------------------------------------------------------------------
private val DUE_PATTERNS = listOf(
    "yyyy-MM-dd'T'HH:mm:ss",
    "yyyy-MM-dd'T'HH:mm",
    "yyyy-MM-dd HH:mm",
    "yyyy-MM-dd",
    "yyyy/MM/dd",
    "dd/MM/yyyy"
)

/** `new Date(t.dueDate)` — returns null when there is no parseable date. */
fun parseDueMs(raw: String?): Long? {
    val s = raw?.trim().orEmpty()
    if (s.isEmpty()) return null
    if (s.all { it.isDigit() } && s.length >= 10) return s.toLongOrNull()
    for (pattern in DUE_PATTERNS) {
        val fmt = SimpleDateFormat(pattern, Locale.US).apply { isLenient = true }
        val parsed: Date? = runCatching { fmt.parse(s) }.getOrNull()
        if (parsed != null) return parsed.time
    }
    return null
}

/** Midnight at the start of the day containing [nowMs] (device time zone). */
fun startOfDayMs(nowMs: Long): Long = Calendar.getInstance().apply {
    timeInMillis = nowMs
    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
}.timeInMillis

/** 23:59:59.999 of the day containing [nowMs] — the web's `endOfToday`. */
fun endOfDayMs(nowMs: Long): Long = Calendar.getInstance().apply {
    timeInMillis = nowMs
    set(Calendar.HOUR_OF_DAY, 23); set(Calendar.MINUTE, 59); set(Calendar.SECOND, 59); set(Calendar.MILLISECOND, 999)
}.timeInMillis

/** The web's `calculateNextDueDate()`. Returns "yyyy-MM-dd'T'HH:mm" (device time), or null. */
fun nextDueDate(currentDueDate: String?, repeatType: String?): String? {
    val base = parseDueMs(currentDueDate) ?: return null
    val cal = Calendar.getInstance().apply { timeInMillis = base }
    when (repeatType?.lowercase(Locale.US)) {
        "daily" -> cal.add(Calendar.DAY_OF_MONTH, 1)
        "weekly" -> cal.add(Calendar.DAY_OF_MONTH, 7)
        "monthly" -> cal.add(Calendar.MONTH, 1)
        "annually", "yearly" -> cal.add(Calendar.YEAR, 1)
        else -> return null
    }
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US).format(Date(cal.timeInMillis))
}

// ---------------------------------------------------------------------------
// Filtering — the web's `taskMatches()`
// ---------------------------------------------------------------------------
fun taskMatches(t: TaskLike, filter: TaskFilter, isGeneral: Boolean, nowMs: Long): Boolean {
    val q = filter.query.trim().lowercase(Locale.US)
    if (q.isNotEmpty()) {
        val hay = (t.description + " " + t.assigneeEmail).lowercase(Locale.US)
        if (!hay.contains(q)) return false
    }
    if (filter.assignee.isNotBlank() &&
        t.assigneeEmail.lowercase(Locale.US) != filter.assignee.lowercase(Locale.US)
    ) return false

    val due = parseDueMs(t.dueDate)
    val done = t.isDone()
    return when (filter.view) {
        TaskView.TODAY -> !done && due != null && due <= endOfDayMs(nowMs)
        TaskView.OVERDUE -> !done && due != null && due < nowMs
        TaskView.UNASSIGNED -> if (isGeneral) !done else (t.assigneeEmail.isBlank() && !done)
        TaskView.DONE -> done
        TaskView.ALL -> true
    }
}

fun <T : TaskLike> filterTasks(
    tasks: List<T>,
    filter: TaskFilter,
    isGeneral: Boolean,
    nowMs: Long = System.currentTimeMillis()
): List<T> = tasks.filter { taskMatches(it, filter, isGeneral, nowMs) }

/** Newest first — the web's `sortByCreatedDesc()`. */
fun <T : TaskLike> sortByCreatedDesc(tasks: List<T>): List<T> =
    tasks.sortedByDescending { it.createdAtMs }

/** How many of these are finished — the web's `projectCounts()`. */
fun projectCounts(tasks: List<TaskLike>): Pair<Int, Int> {
    val done = tasks.count { it.isDone() }
    return done to tasks.size
}

// ---------------------------------------------------------------------------
// Personal task counters — the PWA's four stat chips
// ---------------------------------------------------------------------------
data class PersonalStats(val total: Int, val todo: Int, val done: Int, val urgent: Int)

/**
 * [urgent] = still open and due by the end of today, which is what the "Urgent" chip means in the
 * PWA (`personal-stat-urgent`).
 */
fun personalStats(tasks: List<TaskLike>, nowMs: Long = System.currentTimeMillis()): PersonalStats {
    val eod = endOfDayMs(nowMs)
    var todo = 0; var done = 0; var urgent = 0
    for (t in tasks) {
        if (t.isDone()) { done++; continue }
        todo++
        val due = parseDueMs(t.dueDate)
        if (due != null && due <= eod) urgent++
    }
    return PersonalStats(tasks.size, todo, done, urgent)
}

// ---------------------------------------------------------------------------
// WhatsApp helpers — `normalizeWaNumberClient` / `toE164`
// ---------------------------------------------------------------------------
fun waDigits(raw: String?): String = (raw ?: "").filter { it.isDigit() }

/**
 * Best-effort E.164 for a hand-off link. `00` is an international prefix, a single leading `0` is a
 * national trunk prefix (replaced by [defaultCountry]).
 */
fun toE164(raw: String?, defaultCountry: String = "92"): String {
    var d = waDigits(raw)
    if (d.isEmpty()) return ""
    if (d.startsWith("00")) d = d.substring(2)
    if (d.startsWith("0")) d = defaultCountry + d.substring(1)
    return d
}

/** The web's `makeInviteCode()`: 8 characters, no look-alike letters. */
fun makeInviteCode(random: java.util.Random = java.util.Random()): String {
    val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return (1..8).map { chars[random.nextInt(chars.length)] }.joinToString("")
}
