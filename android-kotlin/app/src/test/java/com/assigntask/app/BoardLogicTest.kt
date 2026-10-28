package com.assigntask.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * The web app is the source of truth. These tests assert the Kotlin port behaves like the
 * JavaScript it replaced (`taskMatches`, `calculateNextDueDate`, `toE164`, `projectCounts`), so a
 * change on either side shows up here instead of in a user's hands.
 */
class BoardLogicTest {

    private data class T(
        override val description: String = "",
        override val assigneeEmail: String = "",
        override val status: String = "To Do",
        override val dueDate: String? = null,
        override val createdAtMs: Long = 0L
    ) : TaskLike

    private fun at(y: Int, m: Int, d: Int, h: Int = 12): Long = Calendar.getInstance().apply {
        set(y, m - 1, d, h, 0, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    private val now = at(2026, 10, 28, 12)

    // ---- taskMatches ------------------------------------------------------

    @Test
    fun search_matches_description_and_assignee_case_insensitively() {
        val t = T(description = "Call the supplier", assigneeEmail = "Bilal@Team.com")
        assertTrue(taskMatches(t, TaskFilter(query = "SUPPLIER"), false, now))
        assertTrue(taskMatches(t, TaskFilter(query = "bilal@team"), false, now))
        assertFalse(taskMatches(t, TaskFilter(query = "invoice"), false, now))
    }

    @Test
    fun assignee_filter_is_case_insensitive_and_exact() {
        val t = T(assigneeEmail = "Bilal@Team.com")
        assertTrue(taskMatches(t, TaskFilter(assignee = "bilal@team.com"), false, now))
        assertFalse(taskMatches(t, TaskFilter(assignee = "bilal"), false, now))
    }

    @Test
    fun today_view_keeps_open_tasks_due_by_end_of_today() {
        val dueToday = T(dueDate = "2026-10-28", status = "To Do")
        val dueTomorrow = T(dueDate = "2026-10-29", status = "To Do")
        val doneToday = T(dueDate = "2026-10-28", status = "Done")
        assertTrue(taskMatches(dueToday, TaskFilter(view = TaskView.TODAY), false, now))
        assertFalse(taskMatches(dueTomorrow, TaskFilter(view = TaskView.TODAY), false, now))
        assertFalse(taskMatches(doneToday, TaskFilter(view = TaskView.TODAY), false, now))
        assertFalse(taskMatches(T(), TaskFilter(view = TaskView.TODAY), false, now))
    }

    @Test
    fun overdue_view_keeps_open_tasks_whose_date_passed() {
        val yesterday = T(dueDate = "2026-10-27")
        assertTrue(taskMatches(yesterday, TaskFilter(view = TaskView.OVERDUE), false, now))
        assertFalse(taskMatches(T(dueDate = "2026-10-29"), TaskFilter(view = TaskView.OVERDUE), false, now))
        assertFalse(taskMatches(T(dueDate = "2026-10-27", status = "Done"), TaskFilter(view = TaskView.OVERDUE), false, now))
    }

    @Test
    fun unassigned_view_differs_for_general_and_individual_lists() {
        val unassigned = T(assigneeEmail = "")
        val assigned = T(assigneeEmail = "a@b.com")
        // general list ("Tasks for All"): every open task counts, assigned or not
        assertTrue(taskMatches(assigned, TaskFilter(view = TaskView.UNASSIGNED), isGeneral = true, now))
        // individual list: only the ones nobody owns
        assertTrue(taskMatches(unassigned, TaskFilter(view = TaskView.UNASSIGNED), isGeneral = false, now))
        assertFalse(taskMatches(assigned, TaskFilter(view = TaskView.UNASSIGNED), isGeneral = false, now))
    }

    @Test
    fun done_view_only_shows_finished_tasks() {
        assertTrue(taskMatches(T(status = "Done"), TaskFilter(view = TaskView.DONE), false, now))
        assertFalse(taskMatches(T(status = "To Do"), TaskFilter(view = TaskView.DONE), false, now))
    }

    @Test
    fun all_view_never_filters() {
        assertTrue(taskMatches(T(), TaskFilter(view = TaskView.ALL), false, now))
    }

    // ---- nextDueDate ------------------------------------------------------

    @Test
    fun repeat_advances_the_due_date_like_the_web() {
        assertEquals("2026-10-29T09:30", nextDueDate("2026-10-28T09:30", "daily"))
        assertEquals("2026-11-04T09:30", nextDueDate("2026-10-28T09:30", "weekly"))
        assertEquals("2026-11-28T09:30", nextDueDate("2026-10-28T09:30", "monthly"))
        assertEquals("2027-10-28T09:30", nextDueDate("2026-10-28T09:30", "annually"))
        assertNull(nextDueDate("2026-10-28T09:30", "none"))
        assertNull(nextDueDate(null, "daily"))
    }

    // ---- personal stats ---------------------------------------------------

    @Test
    fun personal_stats_count_total_todo_done_and_urgent() {
        val tasks = listOf(
            T(status = "Done", dueDate = "2026-01-01"),
            T(status = "To Do", dueDate = "2026-10-28"),
            T(status = "To Do", dueDate = "2026-12-31"),
            T(status = "To Do")
        )
        val s = personalStats(tasks, now)
        assertEquals(4, s.total)
        assertEquals(3, s.todo)
        assertEquals(1, s.done)
        assertEquals(1, s.urgent)
    }

    // ---- misc -------------------------------------------------------------

    @Test
    fun project_counts_report_done_and_total() {
        val counts = projectCounts(listOf(T(status = "Done"), T(), T()))
        assertEquals(1, counts.first)
        assertEquals(3, counts.second)
    }

    @Test
    fun whatsapp_numbers_become_e164() {
        assertEquals("923001234567", toE164("0300 1234567"))
        assertEquals("923001234567", toE164("00923001234567"))
        assertEquals("971501234567", toE164("+971 50 123 4567"))
        assertEquals("", toE164("not a number"))
    }

    @Test
    fun invite_codes_are_eight_unambiguous_characters() {
        repeat(50) {
            val code = makeInviteCode()
            assertEquals(8, code.length)
            assertTrue(code.all { ch -> ch in "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" })
        }
    }

    @Test
    fun sorting_is_newest_first() {
        val a = T(description = "old", createdAtMs = 1_000)
        val b = T(description = "new", createdAtMs = 9_000)
        assertEquals(listOf("new", "old"), sortByCreatedDesc(listOf(a, b)).map { it.description })
    }

    @Test
    fun due_dates_parse_in_every_format_the_web_writes() {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US)
        assertNotNull(parseDueMs("2026-10-28T09:30"))
        assertEquals(fmt.parse("2026-10-28T09:30")!!.time, parseDueMs("2026-10-28T09:30"))
        assertNotNull(parseDueMs("2026-10-28"))
        assertNull(parseDueMs(""))
        assertNull(parseDueMs(null))
    }
}
