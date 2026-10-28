package com.assigntask.app

/**
 * The screen registry — one entry per place the app can be.
 *
 * This file is the phone's mirror of the PWA's three navigation surfaces:
 *   • `#section-nav-menu`  -> [BoardSection]  (the 4 sections in the top-bar pill)
 *   • `#view-nav-menu`     -> [TaskView]      (All / Today / Overdue / Completed)
 *   • `#account-menu`      -> [MENU_ITEMS]    (the account menu, in the PWA's exact order)
 *
 * Adding a feature = one entry here. The drawer, the section pill, the account menu and the
 * back-stack all read from this list, so nothing can silently disagree with itself.
 */
enum class BoardSection(val key: String, val label: String, val short: String) {
    TASKS_FOR_ALL("tasksForAll", "Tasks for All", "All Tasks"),
    PERSONAL_TASKS("personalTasks", "My Personal Tasks", "Personal"),
    PROJECTS("projects", "Project Management", "Projects"),
    PERSONAL_PROJECTS("personalProjects", "My Personal Projects", "My Projects");

    companion object {
        fun of(key: String?): BoardSection? = entries.firstOrNull { it.key == key }
    }
}

/** Menu entries that are not one of the four sections (utilities, exactly as the PWA lists them). */
enum class MenuEntry(
    val key: String,
    val label: String,
    val sectionGroup: Int,
    val danger: Boolean = false
) {
    PERSONAL_TASKS("personalTasks", "My Personal Tasks", 0),
    COMPLETED("completedTasks", "Completed Tasks", 0),
    PROFILE("profile", "Edit Profile", 1),
    TEAM_MEMBERS("teamMembers", "Team Members", 1),
    TEAM_SETTINGS("teamSettings", "Team Settings", 1),
    REMINDERS("scheduledReminders", "Reminders", 2),
    GROUP_UPDATES("groupUpdates", "Group Updates", 2),
    NOTIFICATIONS("notifications", "Notifications", 2),
    PLANNER("planner", "Timetable Planner", 2),
    CALL_HISTORY("reminderHistory", "Calls History", 2),
    ADD_SUB_USER("addSubUser", "Add Sub User", 2),
    LOGOUT("logout", "Logout", 3, danger = true);

    companion object {
        /** The PWA's account menu, in its exact order and grouping (separators between groups). */
        val menu: List<MenuEntry> = listOf(
            PERSONAL_TASKS, COMPLETED,
            PROFILE, TEAM_MEMBERS, TEAM_SETTINGS,
            REMINDERS, GROUP_UPDATES, NOTIFICATIONS, PLANNER, CALL_HISTORY,
            ADD_SUB_USER,
            LOGOUT
        )
    }
}

/** Every screen the app knows about, so `when (page)` never has a silent hole. */
object Screens {
    private val titles: Map<String, String> = buildMap {
        BoardSection.entries.forEach { put(it.key, it.label) }
        MenuEntry.entries.forEach { put(it.key, it.label) }
        put("tasksForAll", "Tasks for All")
        put("individualTasks", "Individual Tasks")
        put("completedTasks", "Completed Tasks")
        put("reminderCall", "Reminder Call Ringing")
        put("settings", "Settings")
    }

    fun title(key: String?): String = titles[key] ?: "AlignTasks"

    /** The label shown inside the top-bar section pill. */
    fun pillLabel(key: String?): String =
        BoardSection.of(key)?.label ?: titles[key] ?: "Tasks for All"

    fun isSection(key: String?): Boolean = BoardSection.of(key) != null

    /** Screens that are separate pages but are reached from the account menu, not the pill. */
    val utilities: List<String> = MenuEntry.entries.map { it.key }.filter { it != MenuEntry.LOGOUT.key }
}
