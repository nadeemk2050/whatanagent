package com.assigntask.app

import android.app.Application
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID

private const val WEB_APP_ID = "1:410197132578:web:97cfc3ae33f39ed3df917b"
private const val BASE = "/artifacts/$WEB_APP_ID/public/data"
const val ADMIN_ACTION_PASSWORD = "abcd"

sealed class AuthState {
    object Loading : AuthState()
    object LoggedOut : AuthState()
    data class LoggedIn(val user: FirebaseUser, val profile: UserProfile) : AuthState()
}

class AppViewModel(application: Application) : AndroidViewModel(application) {

    private val auth = Firebase.auth
    private val db = Firebase.firestore

    private val _authState = MutableStateFlow<AuthState>(AuthState.Loading)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _tasks = MutableStateFlow<List<Task>>(emptyList())
    val tasks: StateFlow<List<Task>> = _tasks.asStateFlow()

    private val _tasksForAll = MutableStateFlow<List<Task>>(emptyList())
    val tasksForAll: StateFlow<List<Task>> = _tasksForAll.asStateFlow()

    private val _projects = MutableStateFlow<List<Project>>(emptyList())
    val projects: StateFlow<List<Project>> = _projects.asStateFlow()

    private val _staff = MutableStateFlow<List<Staff>>(emptyList())
    val staff: StateFlow<List<Staff>> = _staff.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _selfRegistrationAllowed = MutableStateFlow<Boolean?>(null)
    val selfRegistrationAllowed: StateFlow<Boolean?> = _selfRegistrationAllowed.asStateFlow()

    private val _projectTasks = MutableStateFlow<Map<String, List<Task>>>(emptyMap())
    val projectTasks: StateFlow<Map<String, List<Task>>> = _projectTasks.asStateFlow()

    private val dataListeners = mutableListOf<ListenerRegistration>()
    private val projectTaskListeners = mutableMapOf<String, ListenerRegistration>()

    init {
        db.collection("$BASE/users")
            .whereEqualTo("role", "admin")
            .limit(1)
            .addSnapshotListener { snap, _ ->
                _selfRegistrationAllowed.value = snap?.isEmpty != false
            }

        auth.addAuthStateListener { firebaseAuth ->
            val user = firebaseAuth.currentUser
            if (user == null) {
                clearDataListeners()
                _authState.value = AuthState.LoggedOut
            } else {
                setupForUser(user)
            }
        }
    }

    private fun setupForUser(user: FirebaseUser) {
        clearDataListeners()
        _authState.value = AuthState.Loading
        viewModelScope.launch {
            val profile = resolveUserProfile(user)
            if (profile == null) {
                _authState.value = AuthState.LoggedOut
                return@launch
            }
            _authState.value = AuthState.LoggedIn(user, profile)
            setupFirestoreListeners(user, profile)
        }
    }

    private suspend fun resolveUserProfile(user: FirebaseUser): UserProfile? {
        return try {
            val doc = db.collection("$BASE/users").document(user.uid).get().await()
            if (doc.exists()) {
                val active = doc.getBoolean("active") ?: true
                if (!active) {
                    _errorMessage.value = "This account has been disabled by the admin."
                    auth.signOut()
                    return null
                }
                val email = doc.getString("email") ?: user.email ?: ""
                val role = doc.getString("role") ?: "user"
                var ownerAdminUid = doc.getString("ownerAdminUid").orEmpty()
                var ownerAdminEmail = (doc.getString("ownerAdminEmail")
                    ?: doc.getString("createdBy")
                    ?: if (role == "admin") email else "").lowercase()

                if (role == "admin") {
                    ownerAdminUid = user.uid
                    ownerAdminEmail = email.lowercase()
                    if (doc.getString("ownerAdminUid") != user.uid || doc.getString("ownerAdminEmail") != ownerAdminEmail) {
                        db.collection("$BASE/users").document(user.uid).update(
                            mapOf(
                                "ownerAdminUid" to user.uid,
                                "ownerAdminEmail" to ownerAdminEmail
                            )
                        ).await()
                    }
                } else if (ownerAdminUid.isBlank() && ownerAdminEmail.isNotBlank()) {
                    val ownerDoc = db.collection("$BASE/users")
                        .whereEqualTo("role", "admin")
                        .whereEqualTo("email", ownerAdminEmail)
                        .limit(1)
                        .get()
                        .await()
                        .documents
                        .firstOrNull()
                    ownerAdminUid = ownerDoc?.id.orEmpty()
                    if (ownerAdminUid.isNotBlank()) {
                        db.collection("$BASE/users").document(user.uid).update(
                            mapOf(
                                "ownerAdminUid" to ownerAdminUid,
                                "ownerAdminEmail" to ownerAdminEmail
                            )
                        ).await()
                    }
                }

                UserProfile(
                    name = doc.getString("name") ?: "",
                    email = email,
                    role = role,
                    active = active,
                    ownerAdminUid = ownerAdminUid,
                    ownerAdminEmail = ownerAdminEmail
                )
            } else {
                val profile = UserProfile(
                    name = user.email?.substringBefore('@') ?: "Admin",
                    email = user.email ?: "",
                    role = "admin",
                    active = true,
                    ownerAdminUid = user.uid,
                    ownerAdminEmail = (user.email ?: "").lowercase()
                )
                db.collection("$BASE/users").document(user.uid).set(
                    mapOf(
                        "name" to profile.name,
                        "email" to profile.email,
                        "role" to profile.role,
                        "active" to profile.active,
                        "ownerAdminUid" to profile.ownerAdminUid,
                        "ownerAdminEmail" to profile.ownerAdminEmail,
                        "createdAt" to FieldValue.serverTimestamp()
                    )
                ).await()
                profile
            }
        } catch (e: Exception) {
            _errorMessage.value = "Error loading profile: ${e.message}"
            auth.signOut()
            null
        }
    }

    private fun setupFirestoreListeners(user: FirebaseUser, profile: UserProfile) {
        val teamOwnerUid = if (profile.role == "admin") user.uid else profile.ownerAdminUid.ifBlank { user.uid }
        val teamOwnerEmail = if (profile.role == "admin") {
            (user.email ?: profile.email).lowercase()
        } else {
            profile.ownerAdminEmail.ifBlank { profile.email.lowercase() }
        }

        if (profile.hasAdminPowers) {
            var ownedEmails = setOf(teamOwnerEmail)
            var rawTasksForAll = emptyList<Task>()
            var rawTasks = emptyList<Task>()
            var rawStaff = emptyList<Staff>()
            var rawProjects = emptyList<Project>()

            fun publishAdminScopedData() {
                _tasksForAll.value = sortTasksDescending(rawTasksForAll.filter { task ->
                    task.ownerAdminUid == teamOwnerUid ||
                        (task.ownerAdminUid.isBlank() && task.createdBy.equals(teamOwnerEmail, ignoreCase = true))
                })

                _tasks.value = sortTasksDescending(rawTasks.filter { task ->
                    task.ownerAdminUid == teamOwnerUid ||
                        (task.ownerAdminUid.isBlank() && (
                            task.createdBy.equals(teamOwnerEmail, ignoreCase = true) ||
                                ownedEmails.contains(task.assigneeEmail.lowercase())
                            ))
                })

                _staff.value = rawStaff.filter { staff ->
                    staff.ownerAdminUid == teamOwnerUid ||
                        (staff.ownerAdminUid.isBlank() && ownedEmails.contains(staff.email.lowercase()))
                }.sortedBy { it.name.lowercase() }

                _projects.value = rawProjects.filter { project ->
                    project.ownerAdminUid == teamOwnerUid ||
                        (project.ownerAdminUid.isBlank() && project.members.any { member ->
                            ownedEmails.contains(member.lowercase())
                        })
                }
            }

            dataListeners += db.collection("$BASE/users")
                .addSnapshotListener { snap, _ ->
                    ownedEmails = (snap?.documents?.mapNotNull { doc ->
                        val email = doc.getString("email")?.lowercase() ?: return@mapNotNull null
                        val role = doc.getString("role") ?: "user"
                        val ownerUid = doc.getString("ownerAdminUid").orEmpty()
                        val ownerEmail = (doc.getString("ownerAdminEmail")
                            ?: doc.getString("createdBy")
                            ?: "").lowercase()
                        val belongsToAdmin = doc.id == user.uid ||
                            ownerUid == teamOwnerUid ||
                            (role != "admin" && ownerEmail == teamOwnerEmail)
                        if (belongsToAdmin) email else null
                    }?.toSet() ?: emptySet()) + teamOwnerEmail
                    publishAdminScopedData()
                }

            dataListeners += db.collection("$BASE/tasks_for_all")
                .addSnapshotListener { snap, _ ->
                    rawTasksForAll = snap?.documents?.map { doc ->
                        docToTask(doc.id, doc.data ?: emptyMap())
                    } ?: emptyList()
                    publishAdminScopedData()
                }

            dataListeners += db.collection("$BASE/tasks")
                .addSnapshotListener { snap, _ ->
                    rawTasks = snap?.documents?.map { doc ->
                        docToTask(doc.id, doc.data ?: emptyMap())
                    } ?: emptyList()
                    publishAdminScopedData()
                }

            dataListeners += db.collection("$BASE/staff")
                .addSnapshotListener { snap, _ ->
                    rawStaff = snap?.documents?.map { doc ->
                        Staff(
                            id = doc.id,
                            name = doc.getString("name") ?: "",
                            email = doc.getString("email") ?: "",
                            uid = doc.getString("uid") ?: "",
                            ownerAdminUid = doc.getString("ownerAdminUid") ?: ""
                        )
                    } ?: emptyList()
                    publishAdminScopedData()
                }

            dataListeners += db.collection("$BASE/projects")
                .addSnapshotListener { snap, _ ->
                    rawProjects = snap?.documents?.map { doc ->
                        @Suppress("UNCHECKED_CAST")
                        Project(
                            id = doc.id,
                            name = doc.getString("name") ?: "",
                            ownerAdminUid = doc.getString("ownerAdminUid") ?: "",
                            members = (doc.get("members") as? List<*>)?.filterIsInstance<String>() ?: emptyList()
                        )
                    } ?: emptyList()
                    publishAdminScopedData()
                }
            return
        }

        dataListeners += db.collection("$BASE/tasks_for_all")
            .addSnapshotListener { snap, _ ->
                _tasksForAll.value = sortTasksDescending((snap?.documents?.map { doc ->
                    docToTask(doc.id, doc.data ?: emptyMap())
                } ?: emptyList()).filter { task ->
                    task.ownerAdminUid == teamOwnerUid ||
                        (task.ownerAdminUid.isBlank() && task.createdBy.equals(teamOwnerEmail, ignoreCase = true))
                })
            }

        dataListeners += db.collection("$BASE/tasks")
            .whereEqualTo("assigneeEmail", user.email)
            .addSnapshotListener { snap, _ ->
                _tasks.value = sortTasksDescending((snap?.documents?.map { doc ->
                    docToTask(doc.id, doc.data ?: emptyMap())
                } ?: emptyList()).filter { task ->
                    task.ownerAdminUid.isBlank() || task.ownerAdminUid == teamOwnerUid
                })
            }

        dataListeners += db.collection("$BASE/projects")
            .whereArrayContains("members", user.email ?: "")
            .addSnapshotListener { snap, _ ->
                @Suppress("UNCHECKED_CAST")
                _projects.value = (snap?.documents?.map { doc ->
                    Project(
                        id = doc.id,
                        name = doc.getString("name") ?: "",
                        ownerAdminUid = doc.getString("ownerAdminUid") ?: "",
                        members = (doc.get("members") as? List<*>)?.filterIsInstance<String>() ?: emptyList()
                    )
                } ?: emptyList()).filter { project ->
                    project.ownerAdminUid.isBlank() || project.ownerAdminUid == teamOwnerUid
                }
            }
    }

    fun listenProjectTasks(projectId: String, userEmail: String?, isAdmin: Boolean) {
        if (projectTaskListeners.containsKey(projectId)) return
        val baseQuery = db.collection("$BASE/projects/$projectId/tasks")
        val query: Query = if (!isAdmin && userEmail != null) {
            baseQuery.whereEqualTo("assigneeEmail", userEmail)
                .orderBy("createdAt", Query.Direction.DESCENDING)
        } else {
            baseQuery.orderBy("createdAt", Query.Direction.DESCENDING)
        }
        projectTaskListeners[projectId] = query.addSnapshotListener { snap, _ ->
            val current = _projectTasks.value.toMutableMap()
            current[projectId] = snap?.documents?.map { doc ->
                docToTask(doc.id, doc.data ?: emptyMap())
            } ?: emptyList()
            _projectTasks.value = current
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun docToTask(id: String, data: Map<String, Any>): Task = Task(
        id = id,
        description = data["description"] as? String ?: "",
        assigneeEmail = data["assigneeEmail"] as? String ?: "",
        ownerAdminUid = data["ownerAdminUid"] as? String ?: "",
        status = data["status"] as? String ?: "To Do",
        dueDate = data["dueDate"] as? String,
        comments = (data["comments"] as? List<*>)?.filterIsInstance<Map<String, Any>>() ?: emptyList(),
        createdBy = data["createdBy"] as? String ?: "",
        createdAt = data["createdAt"],
        completedBy = data["completedBy"] as? String,
        completedAt = data["completedAt"],
        repeat = data["repeat"] as? Map<String, Any>,
        allDay = data["allDay"] as? Boolean ?: false,
        alarmEnabled = data["alarmEnabled"] as? Boolean ?: false,
        notifyBeforeMinutes = (data["notifyBeforeMinutes"] as? Long)?.toInt(),
        alarmRingtoneUri = data["alarmRingtoneUri"] as? String,
        alarmRingtoneTitle = data["alarmRingtoneTitle"] as? String
    )

    private fun sortTasksDescending(tasks: List<Task>): List<Task> = tasks.sortedByDescending { taskTimestampValue(it.createdAt) }

    private fun taskTimestampValue(value: Any?): Long = when (value) {
        is Timestamp -> value.toDate().time
        is Date -> value.time
        is Long -> value
        else -> 0L
    }

    private fun currentOwnerAdminUid(): String {
        val state = _authState.value as? AuthState.LoggedIn
        return when {
            state == null -> auth.currentUser?.uid.orEmpty()
            state.profile.isAdmin -> state.user.uid
            else -> state.profile.ownerAdminUid.ifBlank { state.user.uid }
        }
    }

    private fun currentOwnerAdminEmail(): String {
        val state = _authState.value as? AuthState.LoggedIn
        return when {
            state == null -> auth.currentUser?.email?.lowercase().orEmpty()
            state.profile.isAdmin -> (state.user.email ?: state.profile.email).lowercase()
            else -> state.profile.ownerAdminEmail.ifBlank { state.profile.email.lowercase() }
        }
    }

    fun signIn(email: String, password: String, onError: (String) -> Unit) {
        viewModelScope.launch {
            try { auth.signInWithEmailAndPassword(email, password).await() }
            catch (e: Exception) { onError(e.message ?: "Sign in failed") }
        }
    }

    fun signUp(email: String, password: String, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                auth.createUserWithEmailAndPassword(email.trim(), password).await()
            }
            catch (e: Exception) { onError(e.message ?: "Sign up failed") }
        }
    }

    fun createSubUser(name: String, email: String, password: String, adminEmail: String, whatsappNumber: String = "", onResult: (String?) -> Unit) {
        viewModelScope.launch {
            val normalizedEmail = email.trim().lowercase()
            val trimmedName = name.trim()
            val ownerAdminUid = currentOwnerAdminUid()
            val ownerAdminEmail = currentOwnerAdminEmail()
            if (trimmedName.isBlank() || normalizedEmail.isBlank()) {
                onResult("Name and email are required")
                return@launch
            }
            if (password.length < 6) {
                onResult("Password must be at least 6 characters")
                return@launch
            }

            var secondaryApp: FirebaseApp? = null
            try {
                val options = FirebaseApp.getInstance().options
                val secondaryOptions = FirebaseOptions.Builder()
                    .setApiKey(options.apiKey)
                    .setApplicationId(options.applicationId)
                    .setProjectId(options.projectId)
                    .setStorageBucket(options.storageBucket)
                    .setGcmSenderId(options.gcmSenderId)
                    .build()
                secondaryApp = FirebaseApp.initializeApp(
                    getApplication(),
                    secondaryOptions,
                    "subuser-${UUID.randomUUID()}"
                )
                val secondaryAuth = FirebaseAuth.getInstance(secondaryApp!!)
                val newUser = secondaryAuth.createUserWithEmailAndPassword(normalizedEmail, password).await().user
                    ?: throw IllegalStateException("Firebase did not return a new user")

                db.collection("$BASE/users").document(newUser.uid).set(
                    mapOf(
                        "name" to trimmedName,
                        "email" to normalizedEmail,
                        "role" to "user",
                        "active" to true,
                        "ownerAdminUid" to ownerAdminUid,
                        "ownerAdminEmail" to ownerAdminEmail,
                        "createdBy" to adminEmail,
                        "createdAt" to FieldValue.serverTimestamp()
                    )
                ).await()

                upsertStaffRecord(trimmedName, normalizedEmail, newUser.uid, whatsappNumber)
                secondaryAuth.signOut()
                secondaryApp?.delete()
                onResult(null)
            } catch (e: Exception) {
                secondaryApp?.delete()
                onResult(e.message ?: "Failed to create sub user")
            }
        }
    }

    fun updateCurrentProfile(name: String, onResult: (String?) -> Unit) {
        val currentUser = auth.currentUser
        if (currentUser == null) {
            onResult("No active user")
            return
        }
        val trimmedName = name.trim()
        if (trimmedName.isBlank()) {
            onResult("Name is required")
            return
        }

        viewModelScope.launch {
            try {
                db.collection("$BASE/users").document(currentUser.uid)
                    .update(
                        mapOf(
                            "name" to trimmedName,
                            "updatedAt" to FieldValue.serverTimestamp()
                        )
                    )
                    .await()

                val state = _authState.value
                if (state is AuthState.LoggedIn) {
                    if (!state.profile.isAdmin) {
                        currentUser.email?.trim()?.lowercase()?.let { upsertStaffRecord(trimmedName, it, currentUser.uid) }
                    }
                    _authState.value = state.copy(profile = state.profile.copy(name = trimmedName))
                }
                onResult(null)
            } catch (e: Exception) {
                onResult(e.message ?: "Failed to update profile")
            }
        }
    }

    private suspend fun upsertStaffRecord(name: String, email: String, uid: String, whatsappNumber: String = "") {
        val existing = db.collection("$BASE/staff")
            .whereEqualTo("email", email)
            .limit(1)
            .get()
            .await()

        val data = mutableMapOf<String, Any>(
            "name" to name,
            "email" to email,
            "uid" to uid,
            "ownerAdminUid" to currentOwnerAdminUid()
        )
        val digits = normalizeWaDigits(whatsappNumber)
        if (digits.isNotBlank()) data["whatsappNumber"] = digits
        if (existing.documents.isEmpty()) {
            db.collection("$BASE/staff").add(data).await()
        } else {
            db.collection("$BASE/staff").document(existing.documents.first().id).update(data).await()
        }
        saveStaffToContactBook(name, email, digits)
    }

    // "+971 50 123..." / "050..." / "00971..." -> "9715..." for WhatsApp sending
    private fun normalizeWaDigits(raw: String?): String {
        var d = (raw ?: "").filter { it.isDigit() }
        if (d.startsWith("00")) d = d.substring(2)
        if (d.startsWith("0")) d = "971" + d.substring(1)
        return d
    }

    // Save the member into the UNIVERSAL CONTACT BOOK so every AI (and the boss bot) can WhatsApp them by name
    private fun saveStaffToContactBook(name: String, email: String, digits: String) {
        if (digits.isBlank()) return
        db.collection("contactBook").document(digits).set(
            mapOf(
                "name" to name.ifBlank { email.substringBefore('@') },
                "phone" to digits,
                "company" to "AlignTasks Team",
                "source" to "aligntasks-android",
                "updatedAt" to System.currentTimeMillis()
            ),
            SetOptions.merge()
        )
    }

    fun signOut() {
        clearDataListeners()
        auth.signOut()
    }

    private fun refreshTaskWidgets() {
        val context = getApplication<Application>()
        fun refreshProvider(providerClass: Class<out AppWidgetProvider>) {
            val component = ComponentName(context, providerClass)
            val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(component)
            if (ids.isEmpty()) return
            AppWidgetManager.getInstance(context).notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
            val updateIntent = Intent(context, providerClass).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            }
            context.sendBroadcast(updateIntent)
        }

        refreshProvider(TaskOverviewWidgetProvider::class.java)
        refreshProvider(ProjectTasksWidgetProvider::class.java)
        refreshProvider(TodayPlannerWidgetProvider::class.java)
    }

    fun addIndividualTask(
        description: String,
        assigneeEmail: String,
        dueDate: String? = null,
        repeatType: String = "none",
        repeatCount: Int? = null,
        allDay: Boolean = false,
        alarmEnabled: Boolean = false,
        notifyBeforeMinutes: Int? = null,
        alarmRingtoneUri: String? = null,
        alarmRingtoneTitle: String? = null,
        creatorEmail: String
    ) {
        if (description.isBlank()) return
        val data = buildTaskData(
            description = description,
            assigneeEmail = assigneeEmail,
            dueDate = dueDate,
            repeatType = repeatType,
            repeatCount = repeatCount,
            allDay = allDay,
            alarmEnabled = alarmEnabled,
            notifyBeforeMinutes = notifyBeforeMinutes,
            alarmRingtoneUri = alarmRingtoneUri,
            alarmRingtoneTitle = alarmRingtoneTitle,
            creatorEmail = creatorEmail
        )
        db.collection("$BASE/tasks").add(data)
            .addOnSuccessListener { refreshTaskWidgets() }
            .addOnFailureListener { _errorMessage.value = "Failed: ${it.message}" }
    }

    fun addTaskForAll(
        description: String,
        assigneeEmail: String = "",
        dueDate: String? = null,
        repeatType: String = "none",
        repeatCount: Int? = null,
        allDay: Boolean = false,
        alarmEnabled: Boolean = false,
        notifyBeforeMinutes: Int? = null,
        alarmRingtoneUri: String? = null,
        alarmRingtoneTitle: String? = null,
        creatorEmail: String
    ) {
        if (description.isBlank()) return
        val creator = creatorEmail.trim().lowercase()
        val data = buildTaskData(
            description = description,
            assigneeEmail = assigneeEmail,
            dueDate = dueDate,
            repeatType = repeatType,
            repeatCount = repeatCount,
            allDay = allDay,
            alarmEnabled = alarmEnabled,
            notifyBeforeMinutes = notifyBeforeMinutes,
            alarmRingtoneUri = alarmRingtoneUri,
            alarmRingtoneTitle = alarmRingtoneTitle,
            creatorEmail = creator
        )
        db.collection("$BASE/tasks_for_all").add(data)
            .addOnSuccessListener { refreshTaskWidgets() }
            .addOnFailureListener { _errorMessage.value = "Failed: ${it.message}" }
    }

    fun addProjectTask(
        projectId: String,
        description: String,
        assigneeEmail: String,
        dueDate: String? = null,
        repeatType: String = "none",
        repeatCount: Int? = null,
        allDay: Boolean = false,
        alarmEnabled: Boolean = false,
        notifyBeforeMinutes: Int? = null,
        alarmRingtoneUri: String? = null,
        alarmRingtoneTitle: String? = null,
        creatorEmail: String
    ) {
        if (description.isBlank()) return
        val creator = creatorEmail.trim().lowercase()
        val data = buildTaskData(
            description = description,
            assigneeEmail = assigneeEmail,
            dueDate = dueDate,
            repeatType = repeatType,
            repeatCount = repeatCount,
            allDay = allDay,
            alarmEnabled = alarmEnabled,
            notifyBeforeMinutes = notifyBeforeMinutes,
            alarmRingtoneUri = alarmRingtoneUri,
            alarmRingtoneTitle = alarmRingtoneTitle,
            creatorEmail = creator
        )
        db.collection("$BASE/projects/$projectId/tasks").add(data)
            .addOnSuccessListener { refreshTaskWidgets() }
            .addOnFailureListener { _errorMessage.value = "Failed: ${it.message}" }
    }

    private fun buildTaskData(
        description: String,
        assigneeEmail: String,
        dueDate: String?,
        repeatType: String,
        repeatCount: Int?,
        allDay: Boolean,
        alarmEnabled: Boolean,
        notifyBeforeMinutes: Int?,
        alarmRingtoneUri: String?,
        alarmRingtoneTitle: String?,
        creatorEmail: String
    ): Map<String, Any> {
        val data = mutableMapOf<String, Any>(
            "description" to description, "assigneeEmail" to assigneeEmail,
            "status" to "To Do", "comments" to emptyList<Any>(),
            "createdAt" to FieldValue.serverTimestamp(), "createdBy" to creatorEmail,
            "ownerAdminUid" to currentOwnerAdminUid(),
            "ownerAdminEmail" to currentOwnerAdminEmail(),
            "allDay" to allDay,
            "alarmEnabled" to alarmEnabled
        )
        if (!dueDate.isNullOrEmpty()) data["dueDate"] = dueDate
        if (repeatType != "none") {
            val repeatMap = mutableMapOf<String, Any>("type" to repeatType)
            if (repeatCount != null) repeatMap["remaining"] = repeatCount
            data["repeat"] = repeatMap
        }
        if (alarmEnabled) {
            if (notifyBeforeMinutes != null) data["notifyBeforeMinutes"] = notifyBeforeMinutes
            if (!alarmRingtoneUri.isNullOrBlank()) data["alarmRingtoneUri"] = alarmRingtoneUri
            if (!alarmRingtoneTitle.isNullOrBlank()) data["alarmRingtoneTitle"] = alarmRingtoneTitle
        }
        return data
    }

    fun toggleTaskDone(task: Task, taskType: String, projectId: String?,
                       isDone: Boolean, currentUserEmail: String) {
        val collPath = if (taskType == "project" && projectId != null)
            "$BASE/projects/$projectId/tasks" else "$BASE/$taskType"
        val collRef = db.collection(collPath)

        if (isDone && task.repeatType != "none") {
            val remaining = task.repeatRemaining
            if (remaining == null || remaining > 1) {
                val newData = buildTaskData(task.description, task.assigneeEmail,
                    calculateNextDueDate(task.dueDate, task.repeatType),
                    task.repeatType,
                    if (remaining != null) remaining - 1 else null,
                    task.allDay,
                    task.alarmEnabled,
                    task.notifyBeforeMinutes,
                    task.alarmRingtoneUri,
                    task.alarmRingtoneTitle,
                    task.createdBy)
                collRef.add(newData)
                    .addOnSuccessListener { refreshTaskWidgets() }
            }
        }

        val update = mutableMapOf<String, Any>(
            "status" to if (isDone) "Done" else "To Do",
            "lastUpdatedBy" to currentUserEmail,
            "lastUpdatedAt" to FieldValue.serverTimestamp()
        )
        if (isDone) {
            update["completedBy"] = currentUserEmail
            update["completedAt"] = FieldValue.serverTimestamp()
        } else {
            update["completedBy"] = FieldValue.delete()
        }
        collRef.document(task.id).update(update)
            .addOnSuccessListener { refreshTaskWidgets() }
    }

    fun deleteTask(taskId: String, taskType: String, projectId: String?, password: String, onResult: (String?) -> Unit) {
        if (password != ADMIN_ACTION_PASSWORD) {
            onResult("Wrong password")
            return
        }
        val docRef = if (taskType == "project" && projectId != null)
            db.collection("$BASE/projects/$projectId/tasks").document(taskId)
        else db.collection("$BASE/$taskType").document(taskId)
        docRef.delete()
            .addOnSuccessListener {
                refreshTaskWidgets()
                onResult(null)
            }
            .addOnFailureListener { onResult(it.message ?: "Failed to delete task") }
    }

    fun deleteTaskQuick(taskId: String, taskType: String, projectId: String?, onResult: (String?) -> Unit) {
        val docRef = if (taskType == "project" && projectId != null)
            db.collection("$BASE/projects/$projectId/tasks").document(taskId)
        else db.collection("$BASE/$taskType").document(taskId)
        docRef.delete()
            .addOnSuccessListener {
                refreshTaskWidgets()
                onResult(null)
            }
            .addOnFailureListener { onResult(it.message ?: "Failed to delete task") }
    }

    fun editTask(taskId: String, taskType: String, projectId: String?,
                 description: String, dueDate: String?, repeatType: String,
                 repeatCount: Int?, assigneeEmail: String?,
                 allDay: Boolean,
                 alarmEnabled: Boolean,
                 notifyBeforeMinutes: Int?,
                 alarmRingtoneUri: String?,
                 alarmRingtoneTitle: String?,
                 currentUserEmail: String, isAdmin: Boolean) {
        val docRef = if (taskType == "project" && projectId != null)
            db.collection("$BASE/projects/$projectId/tasks").document(taskId)
        else db.collection("$BASE/$taskType").document(taskId)

        val update = mutableMapOf<String, Any>(
            "description" to description,
            "allDay" to allDay,
            "alarmEnabled" to alarmEnabled,
            "lastUpdatedBy" to currentUserEmail,
            "lastUpdatedAt" to FieldValue.serverTimestamp()
        )
        if (!dueDate.isNullOrEmpty()) update["dueDate"] = dueDate!! else update["dueDate"] = FieldValue.delete()
        if (repeatType != "none") {
            val repeatMap = mutableMapOf<String, Any>("type" to repeatType)
            if (repeatCount != null) repeatMap["remaining"] = repeatCount
            update["repeat"] = repeatMap
        } else {
            update["repeat"] = FieldValue.delete()
        }
        if (alarmEnabled) {
            if (notifyBeforeMinutes != null) update["notifyBeforeMinutes"] = notifyBeforeMinutes
            else update["notifyBeforeMinutes"] = FieldValue.delete()
            if (!alarmRingtoneUri.isNullOrEmpty()) update["alarmRingtoneUri"] = alarmRingtoneUri
            else update["alarmRingtoneUri"] = FieldValue.delete()
            if (!alarmRingtoneTitle.isNullOrEmpty()) update["alarmRingtoneTitle"] = alarmRingtoneTitle
            else update["alarmRingtoneTitle"] = FieldValue.delete()
        } else {
            update["notifyBeforeMinutes"] = FieldValue.delete()
            update["alarmRingtoneUri"] = FieldValue.delete()
            update["alarmRingtoneTitle"] = FieldValue.delete()
        }
        if (isAdmin && assigneeEmail != null && taskType != "tasks_for_all") {
            update["assigneeEmail"] = assigneeEmail
        }
        docRef.update(update)
            .addOnSuccessListener { refreshTaskWidgets() }
            .addOnFailureListener { _errorMessage.value = "Failed: ${it.message}" }
    }

    fun addComment(taskId: String, taskType: String, projectId: String?,
                   commentText: String, authorEmail: String) {
        val docRef = if (taskType == "project" && projectId != null)
            db.collection("$BASE/projects/$projectId/tasks").document(taskId)
        else db.collection("$BASE/$taskType").document(taskId)
        val comment = mapOf("text" to commentText, "authorEmail" to authorEmail,
            "createdAt" to Date())
        docRef.update("comments", FieldValue.arrayUnion(comment))
    }

    fun addStaff(name: String, email: String, whatsappNumber: String = "") {
        val digits = normalizeWaDigits(whatsappNumber)
        db.collection("$BASE/staff").add(
            mapOf(
                "name" to name,
                "email" to email.lowercase(),
                "whatsappNumber" to digits,
                "ownerAdminUid" to currentOwnerAdminUid()
            )
        )
        saveStaffToContactBook(name, email.lowercase(), digits)
    }

    fun editStaff(id: String, name: String, email: String, whatsappNumber: String? = null) {
        val update = mutableMapOf<String, Any>("name" to name, "email" to email.lowercase())
        val digits = normalizeWaDigits(whatsappNumber)
        if (whatsappNumber != null) update["whatsappNumber"] = digits
        db.collection("$BASE/staff").document(id).update(update)
            .addOnSuccessListener { saveStaffToContactBook(name, email.lowercase(), digits) }
    }

    fun removeStaff(id: String) {
        db.collection("$BASE/staff").document(id).delete()
    }

    fun createProject(name: String, members: List<String>) {
        db.collection("$BASE/projects").add(
            mapOf(
                "name" to name,
                "members" to members,
                "ownerAdminUid" to currentOwnerAdminUid(),
                "ownerAdminEmail" to currentOwnerAdminEmail(),
                "createdAt" to FieldValue.serverTimestamp()
            )
        )
    }

    fun editSubUser(staff: Staff, newName: String, password: String, onResult: (String?) -> Unit) {
        val trimmedName = newName.trim()
        if (password != ADMIN_ACTION_PASSWORD) {
            onResult("Wrong password")
            return
        }
        if (trimmedName.isBlank()) {
            onResult("Name is required")
            return
        }

        viewModelScope.launch {
            try {
                db.collection("$BASE/staff").document(staff.id)
                    .update("name", trimmedName)
                    .await()
                if (staff.uid.isNotBlank()) {
                    db.collection("$BASE/users").document(staff.uid)
                        .update(
                            mapOf(
                                "name" to trimmedName,
                                "updatedAt" to FieldValue.serverTimestamp()
                            )
                        )
                        .await()
                }
                onResult(null)
            } catch (e: Exception) {
                onResult(e.message ?: "Failed to update sub user")
            }
        }
    }

    fun removeSubUser(staff: Staff, password: String, onResult: (String?) -> Unit) {
        if (password != ADMIN_ACTION_PASSWORD) {
            onResult("Wrong password")
            return
        }

        viewModelScope.launch {
            try {
                if (staff.uid.isNotBlank()) {
                    db.collection("$BASE/users").document(staff.uid)
                        .update(
                            mapOf(
                                "active" to false,
                                "updatedAt" to FieldValue.serverTimestamp()
                            )
                        )
                        .await()
                }
                db.collection("$BASE/staff").document(staff.id).delete().await()
                onResult(null)
            } catch (e: Exception) {
                onResult(e.message ?: "Failed to remove sub user")
            }
        }
    }

    fun editProject(id: String, name: String) {
        db.collection("$BASE/projects").document(id).update("name", name)
    }

    fun deleteProject(id: String, password: String, onResult: (String?) -> Unit) {
        if (password != ADMIN_ACTION_PASSWORD) {
            onResult("Wrong password")
            return
        }
        db.collection("$BASE/projects").document(id).delete()
            .addOnSuccessListener { onResult(null) }
            .addOnFailureListener { onResult(it.message ?: "Failed to delete project") }
    }

    fun sendTaskReminder(
        task: Task,
        taskType: String,
        projectId: String?,
        recipientEmails: List<String>,
        senderEmail: String,
        onResult: (String?, String?) -> Unit
    ) {
        val normalized = recipientEmails.map { it.trim().lowercase() }.filter { it.isNotBlank() }.distinct()
        if (normalized.isEmpty()) {
            onResult("Select at least one member", null)
            return
        }

        viewModelScope.launch {
            try {
                val senderUid = auth.currentUser?.uid.orEmpty()
                if (senderUid.isBlank()) {
                    onResult("You are not authenticated", null)
                    return@launch
                }
                val sender = senderEmail.trim().ifBlank { "Team member" }
                val senderName = sender.substringBefore('@').ifBlank { "Team member" }
                val reminderCallId = UUID.randomUUID().toString()

                db.collection("$BASE/reminder_call_controls")
                    .document(reminderCallId)
                    .set(
                        mapOf(
                            "reminderCallId" to reminderCallId,
                            "taskId" to task.id,
                            "taskDescription" to task.description,
                            "taskType" to taskType,
                            "projectId" to (projectId ?: ""),
                            "senderUid" to senderUid,
                            "senderEmail" to sender,
                            "senderName" to senderName,
                            "ownerAdminUid" to currentOwnerAdminUid(),
                            "ownerAdminEmail" to currentOwnerAdminEmail(),
                            "recipientEmails" to normalized,
                            "stopped" to false,
                            "createdAt" to FieldValue.serverTimestamp()
                        )
                    )
                    .await()
                onResult(null, reminderCallId)
            } catch (e: Exception) {
                onResult(e.message ?: "Failed to send reminder", null)
            }
        }
    }

    fun clearError() { _errorMessage.value = null }

    private fun calculateNextDueDate(currentDueDate: String?, repeatType: String): String? {
        if (currentDueDate.isNullOrEmpty()) return null
        return try {
            val pattern = when {
                currentDueDate.contains('T') -> "yyyy-MM-dd'T'HH:mm"
                currentDueDate.contains(':') && currentDueDate.contains('/') -> "dd/MM/yyyy HH:mm"
                currentDueDate.contains(':') -> "yyyy-MM-dd HH:mm"
                currentDueDate.contains('/') -> "dd/MM/yyyy"
                else -> "yyyy-MM-dd"
            }
            val formatter = SimpleDateFormat(pattern, Locale.getDefault())
            val parsed = formatter.parse(currentDueDate) ?: return null
            val cal = Calendar.getInstance()
            cal.time = parsed
            when (repeatType) {
                "daily" -> cal.add(Calendar.DAY_OF_YEAR, 1)
                "weekly" -> cal.add(Calendar.WEEK_OF_YEAR, 1)
                "monthly" -> cal.add(Calendar.MONTH, 1)
                "annually", "yearly" -> cal.add(Calendar.YEAR, 1)
            }
            SimpleDateFormat(pattern, Locale.getDefault()).format(cal.time)
        } catch (e: Exception) { null }
    }

    private fun clearDataListeners() {
        dataListeners.forEach { it.remove() }
        dataListeners.clear()
        projectTaskListeners.values.forEach { it.remove() }
        projectTaskListeners.clear()
        _tasks.value = emptyList()
        _tasksForAll.value = emptyList()
        _projects.value = emptyList()
        _staff.value = emptyList()
        _projectTasks.value = emptyMap()
    }

    override fun onCleared() {
        super.onCleared()
        clearDataListeners()
    }
}
