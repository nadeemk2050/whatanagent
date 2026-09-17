package com.assigntask.app

data class Task(
    val id: String = "",
    val description: String = "",
    val assigneeEmail: String = "",
    val ownerAdminUid: String = "",
    val status: String = "To Do",
    val dueDate: String? = null,
    @Suppress("UNCHECKED_CAST")
    val comments: List<Map<String, Any>> = emptyList(),
    val createdBy: String = "",
    val createdAt: Any? = null,
    val completedBy: String? = null,
    val completedAt: Any? = null,
    val lastUpdatedBy: String? = null,
    val lastUpdatedAt: Any? = null,
    val repeat: Map<String, Any>? = null,
    val allDay: Boolean = false,
    val alarmEnabled: Boolean = false,
    val notifyBeforeMinutes: Int? = null,
    val alarmRingtoneUri: String? = null,
    val alarmRingtoneTitle: String? = null
) {
    val isDone: Boolean get() = status == "Done"
    val repeatType: String get() = repeat?.get("type") as? String ?: "none"
    val repeatRemaining: Int? get() = (repeat?.get("remaining") as? Long)?.toInt()
    val notifyFiveMinutesBefore: Boolean get() = notifyBeforeMinutes == 5
}

data class Project(
    val id: String = "",
    val name: String = "",
    val ownerAdminUid: String = "",
    val members: List<String> = emptyList()
)

data class Staff(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val uid: String = "",
    val ownerAdminUid: String = ""
)

data class UserProfile(
    val name: String = "",
    val email: String = "",
    val role: String = "user",
    val active: Boolean = true,
    val ownerAdminUid: String = "",
    val ownerAdminEmail: String = ""
) {
    val isAdmin: Boolean get() = role == "admin"
    val hasAdminPowers: Boolean get() = role == "admin" || role == "user"
    val displayName: String get() = name.ifBlank { email.substringBefore('@') }
}

