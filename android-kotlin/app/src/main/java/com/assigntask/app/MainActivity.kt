@file:OptIn(ExperimentalMaterial3Api::class)
@file:Suppress("DEPRECATION", "EXPOSED_FROM_PACKAGE_PRIVATE", "UNCHECKED_CAST", "UNUSED_VARIABLE", "UNUSED_PARAMETER", "UNNECESSARY_SAFE_CALL", "UNREACHABLE_CODE", "CLASS_NAME_SHADOWING", "CONFLICTING_OVERLOADS", "DUPLICATE_PARAMETER_NAME_IN_FUNCTION_TYPE", "DUPLICATE_LABEL_IN_WHEN", "INVALID_LABEL", "INACCESSIBLE_TYPE", "SERIALIZER_TYPE_INCOMPATIBLE", "UNINITIALIZED_VARIABLE", "NULLABILITY_MISMATCH_BASED_ON_DEFAULT_ARGS", "TYPEALIAS_EXPANSION_DEPRECATED_IN_FUNCTION_RETURN_TYPE", "TYPEALIAS_EXPANSION_DEPRECATED_IN_CONTEXT_PARAMETER_ANNOTATION", "WRONG_ANNOTATION_TARGET", "OPT_IN_USAGE", "OPT_IN_USAGE_ERROR")

package com.assigntask.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Build
import android.net.Uri
import android.media.RingtoneManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentChange
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.absoluteValue
import kotlin.math.roundToInt

private const val WEB_APP_ID = "1:410197132578:web:97cfc3ae33f39ed3df917b"
private const val REMINDER_BASE = "/artifacts/$WEB_APP_ID/public/data"
private const val REMINDER_CHANNEL_ID = "task_reminder_calls"
private const val REMINDER_RESPONSE_COLLECTION = "$REMINDER_BASE/reminder_call_responses"
private const val REMINDER_CONTROL_COLLECTION = "$REMINDER_BASE/reminder_call_controls"
private const val INCOMING_REMINDER_NOTIFICATION_ID = 91123
private const val ACTION_STOP_INCOMING_REMINDER = "com.assigntask.app.STOP_INCOMING_REMINDER"
private const val EXTRA_REMINDER_NOTIFICATION_ID = "extra_reminder_notification_id"
private const val EXTRA_REMINDER_CALL_ID = "extra_reminder_call_id"
private const val EXTRA_RECIPIENT_UID = "extra_recipient_uid"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val initialPage = intent?.getStringExtra(EXTRA_OPEN_PAGE) ?: "tasksForAll"
        enableEdgeToEdge()
        setContent {
            MaterialTheme {
                AppRoot(initialPage = initialPage)
            }
        }
    }

    companion object {
        const val EXTRA_OPEN_PAGE = "open_page"
    }
}

@Composable
fun AppRoot(initialPage: String = "tasksForAll", vm: AppViewModel = viewModel()) {
    val authState by vm.authState.collectAsState()
    val error by vm.errorMessage.collectAsState()

    when (val state = authState) {
        is AuthState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        is AuthState.LoggedOut -> AuthScreen(vm)
        is AuthState.LoggedIn -> MainAppScreen(vm, state.user, state.profile, initialPage)
    }
}

@Composable
fun MainAppScreen(vm: AppViewModel, user: FirebaseUser, profile: UserProfile, initialPage: String = "tasksForAll") {
    var currentPage by remember { mutableStateOf(initialPage) }
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val tasksForAll by vm.tasksForAll.collectAsState()
    var tasksForAllSection by remember { mutableStateOf(TasksForAllSection.TasksForAll) }
    var scheduledFilterMode by remember { mutableStateOf(ScheduledTaskFilterMode.AllDatesTasks) }
    var selectedScheduledDate by remember {
        mutableStateOf(SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date()))
    }
    var showTodayOptionsMenu by remember { mutableStateOf(false) }
    var addTaskRequestToken by remember { mutableIntStateOf(0) }
    val activeTeamReminderCalls = remember { mutableStateListOf<TeamReminderCallItem>() }
    var lastIncomingRingingCallId by remember { mutableStateOf<String?>(null) }
    val ownerAdminUid = remember(profile, user.uid) {
        if (profile.isAdmin) user.uid else profile.ownerAdminUid.ifBlank { user.uid }
    }
    val dateFormat = remember { SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()) }
    val todayDateText = remember { dateFormat.format(Date()) }

    val startOfToday = remember {
        Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.time
    }
    val overdueCount = remember(tasksForAll, startOfToday) {
        tasksForAll.count { task ->
            if (task.isDone) return@count false
            val due = parseDueDateToDate(task.dueDate) ?: return@count false
            due.before(startOfToday)
        }
    }
    val tasksForAllCount = remember(tasksForAll) {
        tasksForAll.count { task -> !task.isDone && task.dueDate.isNullOrBlank() }
    }
    val scheduledPendingTasks = remember(tasksForAll) {
        tasksForAll.filter { task -> !task.isDone && !task.dueDate.isNullOrBlank() }
    }
    val todaysTaskCount = remember(scheduledPendingTasks, todayDateText) {
        scheduledPendingTasks.count { task ->
            val due = parseDueDateToDate(task.dueDate) ?: return@count false
            dateFormat.format(due) == todayDateText
        }
    }
    val selectedDateTaskCount = remember(scheduledPendingTasks, selectedScheduledDate) {
        scheduledPendingTasks.count { task ->
            val due = parseDueDateToDate(task.dueDate) ?: return@count false
            dateFormat.format(due) == selectedScheduledDate
        }
    }
    val todaysSectionCount = when (scheduledFilterMode) {
        ScheduledTaskFilterMode.TodayTasks -> todaysTaskCount
        ScheduledTaskFilterMode.AllDatesTasks -> scheduledPendingTasks.size
        ScheduledTaskFilterMode.OtherDateTasks -> selectedDateTaskCount
    }
    val selectedModeHeading = when (scheduledFilterMode) {
        ScheduledTaskFilterMode.AllDatesTasks -> "All Dates"
        ScheduledTaskFilterMode.TodayTasks -> "Today"
        ScheduledTaskFilterMode.OtherDateTasks -> "Other Date ($selectedScheduledDate)"
    }

    fun selectScheduledMode(mode: ScheduledTaskFilterMode) {
        scheduledFilterMode = mode
        tasksForAllSection = TasksForAllSection.TodaysTask
        if (mode == ScheduledTaskFilterMode.OtherDateTasks) {
            val cal = parseDateToCalendar(selectedScheduledDate)
            DatePickerDialog(
                context,
                { _, year, month, dayOfMonth ->
                    selectedScheduledDate = String.format("%02d/%02d/%04d", dayOfMonth, month + 1, year)
                },
                cal.get(Calendar.YEAR),
                cal.get(Calendar.MONTH),
                cal.get(Calendar.DAY_OF_MONTH)
            ).show()
        }
    }

    DisposableEffect(user.uid, ownerAdminUid, user.email) {
        val db = Firebase.firestore
        val reminderPath = "$REMINDER_BASE/users/${user.uid}/notifications"
        val selfEmail = user.email?.trim()?.lowercase().orEmpty()
        var sentDocs = emptyList<com.google.firebase.firestore.DocumentSnapshot>()
        var receivedDocs = emptyList<com.google.firebase.firestore.DocumentSnapshot>()

        fun publishLiveCalls() {
            val merged = (sentDocs + receivedDocs)
                .associateBy { it.id }
                .values
                .map { doc ->
                    val recipients = (doc.get("recipientEmails") as? List<*>)
                        ?.mapNotNull { it as? String }
                        ?.map { it.trim().lowercase() }
                        ?.filter { it.isNotBlank() }
                        ?: emptyList()
                    TeamReminderCallItem(
                        reminderCallId = doc.id,
                        taskDescription = doc.getString("taskDescription").orEmpty(),
                        senderUid = doc.getString("senderUid").orEmpty(),
                        senderEmail = doc.getString("senderEmail").orEmpty(),
                        senderName = doc.getString("senderName").orEmpty(),
                        recipients = recipients,
                        createdAtMillis = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0L,
                        createdAtLabel = formatTimestamp(doc.getTimestamp("createdAt")),
                        stopped = doc.getBoolean("stopped") == true,
                        stoppedAtLabel = formatTimestamp(doc.getTimestamp("stoppedAt")),
                        stoppedByEmail = doc.getString("stoppedByEmail").orEmpty(),
                        ownerAdminUid = doc.getString("ownerAdminUid").orEmpty()
                    )
                }
                .filter { !it.stopped }
                .sortedByDescending { it.createdAtMillis }

            activeTeamReminderCalls.clear()
            activeTeamReminderCalls.addAll(merged)

            val activeIncoming = merged.firstOrNull { it.senderUid != user.uid }
            if (activeIncoming != null) {
                if (lastIncomingRingingCallId != activeIncoming.reminderCallId && AppSettingsStore.isReminderRingtoneEnabled(context)) {
                    playReminderRingtone(context)
                    lastIncomingRingingCallId = activeIncoming.reminderCallId
                }
            } else {
                ReminderTonePlayer.stop()
                lastIncomingRingingCallId = null
            }

            if (merged.isNotEmpty()) {
                currentPage = "reminderCall"
            } else if (currentPage == "reminderCall") {
                currentPage = "tasksForAll"
            }
        }

        db.collection(reminderPath)
            .whereEqualTo("handled", false)
            .whereEqualTo("type", "task_reminder_call")
            .get()
            .addOnSuccessListener { snap ->
                snap.documents.forEach { doc ->
                    db.collection(reminderPath).document(doc.id).update(
                        mapOf(
                            "handled" to true,
                            "handledAt" to FieldValue.serverTimestamp(),
                            "responseStatus" to "migrated_to_call_page",
                            "responseMessage" to "Notification-style reminder call is disabled"
                        )
                    )
                }
            }

        val sentReg = db.collection(REMINDER_CONTROL_COLLECTION)
            .whereEqualTo("senderUid", user.uid)
            .whereEqualTo("stopped", false)
            .addSnapshotListener { snap, _ ->
                sentDocs = snap?.documents.orEmpty()
                publishLiveCalls()
            }

        val receivedReg = if (selfEmail.isBlank()) {
            null
        } else {
            db.collection(REMINDER_CONTROL_COLLECTION)
                .whereArrayContains("recipientEmails", selfEmail)
                .whereEqualTo("stopped", false)
                .addSnapshotListener { snap, _ ->
                    receivedDocs = snap?.documents.orEmpty()
                    publishLiveCalls()
                }
        }

        onDispose {
            sentReg.remove()
            receivedReg?.remove()
            ReminderTonePlayer.stop()
        }
    }

    ModalNavigationDrawer(
        drawerContent = {
            NavigationDrawerContent(
                currentPage = currentPage,
                onPageSelect = { page ->
                    currentPage = page
                    scope.launch { drawerState.close() }
                },
                profile = profile,
                vm = vm,
                user = user,
                onLogout = { vm.signOut() }
            )
        },
        drawerState = drawerState,
        scrimColor = Color.Black.copy(alpha = 0.32f)
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        if (currentPage == "tasksForAll") {
                            TasksForAllTopTabs(
                                section = tasksForAllSection,
                                tasksForAllCount = tasksForAllCount,
                                todaysTaskCount = todaysSectionCount,
                                selectedModeLabel = selectedModeHeading,
                                overdueCount = overdueCount,
                                onTasksForAllClick = {
                                    tasksForAllSection = TasksForAllSection.TasksForAll
                                },
                                onTodaysTaskClick = {
                                    showTodayOptionsMenu = true
                                    tasksForAllSection = TasksForAllSection.TodaysTask
                                },
                                onOverdueClick = {
                                    tasksForAllSection = TasksForAllSection.Overdue
                                },
                                showTodayOptionsMenu = showTodayOptionsMenu,
                                onDismissTodayOptions = { showTodayOptionsMenu = false },
                                onSelectScheduledMode = { mode ->
                                    showTodayOptionsMenu = false
                                    selectScheduledMode(mode)
                                }
                            )
                        } else {
                            Text(pageTitle(currentPage))
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = {
                            scope.launch {
                                if (drawerState.isOpen) drawerState.close() else drawerState.open()
                            }
                        }) {
                            Icon(Icons.Default.Menu, "Menu")
                        }
                    },
                    actions = {
                        IconButton(onClick = { currentPage = "completedTasks" }) {
                            Icon(Icons.Default.CheckCircle, "Completed Tasks")
                        }
                        IconButton(onClick = { currentPage = "reminderHistory" }) {
                            Icon(Icons.Default.History, "Reminder Calls History")
                        }
                        if (currentPage == "tasksForAll") {
                            IconButton(onClick = { addTaskRequestToken++ }) {
                                Icon(Icons.Default.Add, "Add Task")
                            }
                        }
                    }
                )
            },
            modifier = Modifier.fillMaxSize()
        ) { padding ->
            Box(modifier = Modifier.fillMaxSize().padding(padding)) {
                when (currentPage) {
                    "tasksForAll" -> TasksForAllPage(
                        vm = vm,
                        user = user,
                        profile = profile,
                        section = tasksForAllSection,
                        scheduledFilterMode = scheduledFilterMode,
                        selectedScheduledDate = selectedScheduledDate,
                        addTaskRequestToken = addTaskRequestToken
                    )
                    "individualTasks" -> IndividualTasksPage(vm, user, profile)
                    "completedTasks" -> CompletedTasksPage(vm, user, profile)
                    "projects" -> ProjectsPage(vm, user, profile)
                    "addSubUser" -> AddSubUserDialog(vm, user) { currentPage = "tasksForAll" }
                    "teamMembers" -> TeamMembersPage(vm, user, profile)
                    "planner" -> TimetablePlannerPage(vm, user, profile)
                    "reminderHistory" -> ReminderCallsHistoryPage(user = user, profile = profile)
                    "reminderCall" -> ReminderCallLivePage(
                        activeCall = activeTeamReminderCalls.firstOrNull(),
                        user = user,
                        onHangup = { callId ->
                            stopReminderCall(
                                reminderCallId = callId,
                                actorUid = user.uid,
                                actorEmail = user.email.orEmpty()
                            )
                        },
                        onBack = {
                            currentPage = if (activeTeamReminderCalls.isNotEmpty()) "reminderCall" else "tasksForAll"
                        }
                    )
                    "settings" -> SettingsPage(vm)
                    "profile" -> UserProfilePage(profile, vm, onBack = { currentPage = "tasksForAll" })
                }
            }
        }
    }
}

@Composable
fun NavigationDrawerContent(
    currentPage: String,
    onPageSelect: (String) -> Unit,
    profile: UserProfile,
    vm: AppViewModel,
    user: FirebaseUser,
    onLogout: () -> Unit
) {
    ModalDrawerSheet {
        Spacer(Modifier.height(16.dp))
        Text(
            text = "ALIGNTASK v1.3",
            style = MaterialTheme.typography.titleLarge.copy(
                brush = Brush.horizontalGradient(
                    colors = listOf(Color(0xFF0D47A1), Color(0xFF111111))
                )
            ),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(16.dp)
        )
        HorizontalDivider()
        
        NavigationDrawerItem(
            label = { Text("Tasks For All") },
            icon = { Icon(Icons.Default.ListAlt, null) },
            selected = currentPage == "tasksForAll",
            onClick = { onPageSelect("tasksForAll") }
        )
        
        NavigationDrawerItem(
            label = { Text("Individual Tasks") },
            icon = { Icon(Icons.Default.Assignment, null) },
            selected = currentPage == "individualTasks",
            onClick = { onPageSelect("individualTasks") }
        )

        NavigationDrawerItem(
            label = { Text("Completed Tasks") },
            icon = { Icon(Icons.Default.CheckCircle, null) },
            selected = currentPage == "completedTasks",
            onClick = { onPageSelect("completedTasks") }
        )

        NavigationDrawerItem(
            label = { Text("Calls History") },
            icon = { Icon(Icons.Default.History, null) },
            selected = currentPage == "reminderHistory",
            onClick = { onPageSelect("reminderHistory") }
        )
        
        NavigationDrawerItem(
            label = { Text("Projects") },
            icon = { Icon(Icons.Default.Folder, null) },
            selected = currentPage == "projects",
            onClick = { onPageSelect("projects") }
        )

        NavigationDrawerItem(
            label = { Text("Add Sub User") },
            icon = { Icon(Icons.Default.PersonAdd, null) },
            selected = currentPage == "addSubUser",
            onClick = { onPageSelect("addSubUser") }
        )

        NavigationDrawerItem(
            label = { Text("Team Members") },
            icon = { Icon(Icons.Default.Groups, null) },
            selected = currentPage == "teamMembers",
            onClick = { onPageSelect("teamMembers") }
        )

        NavigationDrawerItem(
            label = { Text("Timetable Planner") },
            icon = { Icon(Icons.Default.CalendarMonth, null) },
            selected = currentPage == "planner",
            onClick = { onPageSelect("planner") }
        )

        NavigationDrawerItem(
            label = { Text("Settings") },
            icon = { Icon(Icons.Default.Settings, null) },
            selected = currentPage == "settings",
            onClick = { onPageSelect("settings") }
        )
        
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        
        NavigationDrawerItem(
            label = { Text("User Profile") },
            icon = { Icon(Icons.Default.Person, null) },
            selected = currentPage == "profile",
            onClick = { onPageSelect("profile") }
        )
        
        Spacer(Modifier.weight(1f))
        HorizontalDivider()
        
        NavigationDrawerItem(
            label = { Text("Sign Out") },
            icon = { Icon(Icons.AutoMirrored.Filled.Logout, null) },
            selected = false,
            onClick = onLogout
        )
        Spacer(Modifier.height(16.dp))
    }
}

fun pageTitle(page: String): String = when (page) {
    "tasksForAll" -> "Tasks For All"
    "individualTasks" -> "Individual Tasks"
    "completedTasks" -> "Completed Tasks"
    "projects" -> "Projects"
    "addSubUser" -> "Add Sub User"
    "teamMembers" -> "Team Members"
    "planner" -> "Timetable Planner"
    "reminderHistory" -> "Reminder Calls History"
    "reminderCall" -> "Reminder Call Ringing"
    "settings" -> "Settings"
    "profile" -> "User Profile"
    else -> "ALIGNTASK"
}

@Composable
fun ReminderCallsHistoryPage(user: FirebaseUser, profile: UserProfile) {
    val teamCalls = remember { mutableStateListOf<TeamReminderCallItem>() }
    val ownerAdminUid = remember(profile, user.uid) {
        if (profile.isAdmin) user.uid else profile.ownerAdminUid.ifBlank { user.uid }
    }

    DisposableEffect(user.uid, ownerAdminUid) {
        val db = Firebase.firestore
        val teamCallReg = db.collection(REMINDER_CONTROL_COLLECTION)
            .whereEqualTo("ownerAdminUid", ownerAdminUid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(100)
            .addSnapshotListener { snap, _ ->
                val mapped = snap?.documents.orEmpty().map { doc ->
                    val recipients = (doc.get("recipientEmails") as? List<*>)
                        ?.mapNotNull { it as? String }
                        ?.map { it.trim().lowercase() }
                        ?.filter { it.isNotBlank() }
                        ?: emptyList()
                    TeamReminderCallItem(
                        reminderCallId = doc.id,
                        taskDescription = doc.getString("taskDescription").orEmpty(),
                        senderUid = doc.getString("senderUid").orEmpty(),
                        senderEmail = doc.getString("senderEmail").orEmpty(),
                        senderName = doc.getString("senderName").orEmpty(),
                        createdAtMillis = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0L,
                        createdAtLabel = formatTimestamp(doc.getTimestamp("createdAt")),
                        stopped = doc.getBoolean("stopped") == true,
                        stoppedAtLabel = formatTimestamp(doc.getTimestamp("stoppedAt")),
                        recipients = recipients,
                        stoppedByEmail = doc.getString("stoppedByEmail").orEmpty(),
                        ownerAdminUid = doc.getString("ownerAdminUid").orEmpty()
                    )
                }
                teamCalls.clear()
                teamCalls.addAll(mapped)
            }

        onDispose {
            teamCallReg.remove()
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Text("Team Reminder Calls", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
        if (teamCalls.isEmpty()) {
            item {
                Text("No reminder calls yet", color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
            }
        } else {
            items(teamCalls, key = { it.reminderCallId }) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(item.taskDescription.ifBlank { "Task reminder" }, fontWeight = FontWeight.SemiBold)
                        Text(
                            "From: ${item.senderName.ifBlank { item.senderEmail.substringBefore('@') }}",
                            style = MaterialTheme.typography.labelSmall
                        )
                        Text("Sent: ${item.createdAtLabel.ifBlank { "-" }}", style = MaterialTheme.typography.labelSmall)
                        Text("Recipients: ${item.recipients.joinToString { it.substringBefore('@') }}", style = MaterialTheme.typography.labelSmall)
                        Text(
                            text = if (item.stopped) "Stopped" else "Active",
                            color = if (item.stopped) MaterialTheme.colorScheme.error else Color(0xFF0A8754),
                            fontWeight = FontWeight.Medium
                        )
                        if (item.stopped && item.stoppedAtLabel.isNotBlank()) {
                            Text("Stopped At: ${item.stoppedAtLabel}", style = MaterialTheme.typography.labelSmall)
                            if (item.stoppedByEmail.isNotBlank()) {
                                Text("Stopped By: ${item.stoppedByEmail.substringBefore('@')}", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        if (!item.stopped) {
                            Button(
                                onClick = {
                                    stopReminderCall(
                                        reminderCallId = item.reminderCallId,
                                        actorUid = user.uid,
                                        actorEmail = user.email.orEmpty()
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB00020))
                            ) {
                                Text("Hangup Active Reminder Call")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ReminderCallLivePage(
    activeCall: TeamReminderCallItem?,
    user: FirebaseUser,
    onHangup: (String) -> Unit,
    onBack: () -> Unit
) {
    if (activeCall == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("No active reminder call", style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = onBack) { Text("Back to Tasks") }
            }
        }
        return
    }

    val callerLabel = activeCall.senderName.ifBlank { activeCall.senderEmail.substringBefore('@') }
    val recipientsLabel = activeCall.recipients.joinToString { it.substringBefore('@') }
    val amCaller = activeCall.senderUid == user.uid

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF132A3A))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Reminder Call Ringing", style = MaterialTheme.typography.headlineSmall, color = Color.White, fontWeight = FontWeight.Bold)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Task", fontWeight = FontWeight.SemiBold)
                Text(activeCall.taskDescription.ifBlank { "Task reminder" })
                Text("Calling: $callerLabel", style = MaterialTheme.typography.bodySmall)
                Text("To: ${recipientsLabel.ifBlank { "-" }}", style = MaterialTheme.typography.bodySmall)
                Text("Started: ${activeCall.createdAtLabel.ifBlank { "-" }}", style = MaterialTheme.typography.bodySmall)
                Text(
                    if (amCaller) "You started this reminder call." else "You are part of this reminder call.",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }

        Button(
            onClick = { onHangup(activeCall.reminderCallId) },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB00020))
        ) {
            Text("Hangup Reminder Call")
        }

        TextButton(onClick = onBack, modifier = Modifier.align(Alignment.End)) {
            Text("Back")
        }
    }
}

fun prettyReminderStatus(status: String): String = when (status) {
    "confirmed" -> "Confirmed"
    "declined" -> "Rejected / Hangup"
    "stopped_by_sender" -> "Stopped By Sender"
    "expired" -> "Expired"
    "pending" -> "Pending"
    else -> status.replace('_', ' ').replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
}

enum class TasksForAllSection {
    TasksForAll,
    TodaysTask,
    Overdue
}

enum class ScheduledTaskFilterMode(val label: String) {
    AllDatesTasks("All Dates"),
    TodayTasks("Today"),
    OtherDateTasks("Other Date")
}

data class IncomingReminderCall(
    val notificationId: String,
    val reminderCallId: String,
    val recipientUid: String,
    val senderUid: String,
    val senderEmail: String,
    val senderName: String,
    val taskId: String,
    val taskDescription: String,
    val taskType: String,
    val projectId: String,
    val title: String,
    val message: String,
    val notificationCode: Int
)

data class ReminderResponse(
    val id: String,
    val responderName: String,
    val responderEmail: String,
    val status: String,
    val createdAtMillis: Long,
    val createdAtLabel: String
)

data class OutgoingReminderHistoryItem(
    val reminderCallId: String,
    val taskDescription: String,
    val senderName: String,
    val createdAtLabel: String,
    val stopped: Boolean,
    val stoppedAtLabel: String,
    val recipients: List<String>
)

data class TeamReminderCallItem(
    val reminderCallId: String,
    val senderUid: String,
    val senderEmail: String,
    val senderName: String,
    val taskDescription: String,
    val createdAtMillis: Long,
    val createdAtLabel: String,
    val stopped: Boolean,
    val stoppedAtLabel: String,
    val recipients: List<String>,
    val stoppedByEmail: String,
    val ownerAdminUid: String
)

@Composable
fun TasksForAllTopTabs(
    section: TasksForAllSection,
    tasksForAllCount: Int,
    todaysTaskCount: Int,
    selectedModeLabel: String,
    overdueCount: Int,
    onTasksForAllClick: () -> Unit,
    onTodaysTaskClick: () -> Unit,
    onOverdueClick: () -> Unit,
    showTodayOptionsMenu: Boolean,
    onDismissTodayOptions: () -> Unit,
    onSelectScheduledMode: (ScheduledTaskFilterMode) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        TextButton(onClick = onTasksForAllClick) {
            Text(
                text = "All Tasks ($tasksForAllCount)",
                color = if (section == TasksForAllSection.TasksForAll) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                fontWeight = if (section == TasksForAllSection.TasksForAll) FontWeight.Bold else FontWeight.Normal
            )
        }

        Box {
            TextButton(onClick = onTodaysTaskClick) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "$selectedModeLabel ($todaysTaskCount)",
                        color = if (section == TasksForAllSection.TodaysTask) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                        fontWeight = if (section == TasksForAllSection.TodaysTask) FontWeight.Bold else FontWeight.Normal
                    )
                    Icon(Icons.Default.ArrowDropDown, "Task Mode")
                }
            }

            DropdownMenu(expanded = showTodayOptionsMenu, onDismissRequest = onDismissTodayOptions) {
                ScheduledTaskFilterMode.values().forEach { mode ->
                    DropdownMenuItem(
                        text = { Text(mode.label) },
                        onClick = { onSelectScheduledMode(mode) }
                    )
                }
            }
        }

        TextButton(onClick = onOverdueClick) {
            Text(
                text = "Overdue ($overdueCount)",
                color = if (section == TasksForAllSection.Overdue) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                fontWeight = if (section == TasksForAllSection.Overdue) FontWeight.Bold else FontWeight.Normal
            )
        }
    }
}

@Composable
fun TasksForAllPage(
    vm: AppViewModel,
    user: FirebaseUser,
    profile: UserProfile,
    section: TasksForAllSection,
    scheduledFilterMode: ScheduledTaskFilterMode,
    selectedScheduledDate: String,
    addTaskRequestToken: Int
) {
    val tasksForAll by vm.tasksForAll.collectAsState()
    val staff by vm.staff.collectAsState()
    val reminderTargets = remember(staff, user.email) { buildReminderTargets(staff, user.email) }
    var showAddDialog by remember { mutableStateOf(false) }
    var showComments by remember { mutableStateOf<Task?>(null) }
    var showEditTask by remember { mutableStateOf<Pair<Task, String>?>(null) }

    LaunchedEffect(addTaskRequestToken) {
        if (addTaskRequestToken > 0) showAddDialog = true
    }

    val dateFormat = remember { SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()) }
    val todayDateText = remember { SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date()) }
    val todayStart = remember {
        Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.time
    }

    val pendingTasks = remember(tasksForAll) { tasksForAll.filter { !it.isDone } }
    val tasksForAllWithoutDate = remember(pendingTasks) { pendingTasks.filter { it.dueDate.isNullOrBlank() } }
    val scheduledPendingTasks = remember(pendingTasks) { pendingTasks.filter { !it.dueDate.isNullOrBlank() } }
    val todaysScheduledTasks = remember(scheduledPendingTasks, todayDateText) {
        scheduledPendingTasks
            .filter { task ->
                val due = parseDueDateToDate(task.dueDate) ?: return@filter false
                dateFormat.format(due) == todayDateText
            }
            .sortedByDescending { parseDueDateToDate(it.dueDate)?.time ?: Long.MIN_VALUE }
    }
    val selectedDateScheduledTasks = remember(scheduledPendingTasks, selectedScheduledDate) {
        scheduledPendingTasks
            .filter { task ->
                val due = parseDueDateToDate(task.dueDate) ?: return@filter false
                dateFormat.format(due) == selectedScheduledDate
            }
            .sortedByDescending { parseDueDateToDate(it.dueDate)?.time ?: Long.MIN_VALUE }
    }
    val allDatesScheduledTasks = remember(scheduledPendingTasks) {
        scheduledPendingTasks.sortedByDescending { parseDueDateToDate(it.dueDate)?.time ?: Long.MIN_VALUE }
    }
    val overduePendingTasks = remember(scheduledPendingTasks) {
        scheduledPendingTasks
            .filter { task ->
                val due = parseDueDateToDate(task.dueDate) ?: return@filter false
                due.before(todayStart)
            }
            .sortedByDescending { parseDueDateToDate(it.dueDate)?.time ?: Long.MIN_VALUE }
    }

    val visibleTasks = when (section) {
        TasksForAllSection.TasksForAll -> tasksForAllWithoutDate
        TasksForAllSection.TodaysTask -> when (scheduledFilterMode) {
            ScheduledTaskFilterMode.TodayTasks -> todaysScheduledTasks
            ScheduledTaskFilterMode.AllDatesTasks -> allDatesScheduledTasks
            ScheduledTaskFilterMode.OtherDateTasks -> selectedDateScheduledTasks
        }
        TasksForAllSection.Overdue -> overduePendingTasks
    }

    val emptyMessage = when (section) {
        TasksForAllSection.TasksForAll -> "No Tasks For All items"
        TasksForAllSection.TodaysTask -> when (scheduledFilterMode) {
            ScheduledTaskFilterMode.TodayTasks -> "No tasks for today"
            ScheduledTaskFilterMode.AllDatesTasks -> "No dated tasks"
            ScheduledTaskFilterMode.OtherDateTasks -> "No tasks for $selectedScheduledDate"
        }
        TasksForAllSection.Overdue -> "No overdue tasks"
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (visibleTasks.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(emptyMessage, color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(visibleTasks, key = { it.id }) { task ->
                    TaskRow(
                        task,
                        "tasks_for_all",
                        null,
                        user,
                        profile.hasAdminPowers,
                        vm,
                        onShowComments = { showComments = it },
                        onEditTask = { t, type -> showEditTask = t to type },
                        reminderTargets = reminderTargets,
                        onRemindTask = { t, selected, onCallId ->
                            vm.sendTaskReminder(
                                task = t,
                                taskType = "tasks_for_all",
                                projectId = null,
                                recipientEmails = selected,
                                senderEmail = user.email ?: ""
                            ) { err, callId ->
                                if (err != null) vm.clearError()
                                else onCallId(callId)
                            }
                        }
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        AddTaskForAllDialog(vm, user, staff) { showAddDialog = false }
    }

    showComments?.let { task ->
        CommentsDialog(task, "tasks_for_all", null, user.email ?: "", vm) { showComments = null }
    }

    showEditTask?.let { (task, taskType) ->
        EditTaskDialog(task, taskType, null, user, profile.hasAdminPowers, vm, staff) { showEditTask = null }
    }
}

@Composable
fun AddTaskForAllDialog(vm: AppViewModel, user: FirebaseUser, staff: List<Staff>, onDismiss: () -> Unit) {
    var desc by remember { mutableStateOf("") }
    var date by remember { mutableStateOf("") }
    var time by remember { mutableStateOf("09:00") }
    var allDay by remember { mutableStateOf(false) }
    var repeatType by remember { mutableStateOf("none") }
    var repeatCountText by remember { mutableStateOf("") }
    var alarmEnabled by remember { mutableStateOf(false) }
    var notifyFiveMinutes by remember { mutableStateOf(true) }
    var selectedAssignee by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val defaultRingtone = remember { AppSettingsStore.getDefaultAlarmRingtone(context) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Task For All") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = desc,
                    onValueChange = { desc = it; error = null },
                    label = { Text("Task Description") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
                Spacer(Modifier.height(8.dp))
                MemberDropdown(
                    label = "Assign To (optional)",
                    selectedEmail = selectedAssignee,
                    users = (staff.map { it.email } + listOf(user.email ?: "")).filter { it.isNotBlank() }.distinct(),
                    onSelect = { selectedAssignee = it }
                )
                Spacer(Modifier.height(8.dp))
                TaskScheduleFields(
                    date = date,
                    onDateChange = { date = it },
                    time = time,
                    onTimeChange = { time = it },
                    allDay = allDay,
                    onAllDayChange = { allDay = it },
                    repeatType = repeatType,
                    onRepeatTypeChange = { repeatType = it },
                    repeatCountText = repeatCountText,
                    onRepeatCountTextChange = { repeatCountText = it },
                    alarmEnabled = alarmEnabled,
                    onAlarmEnabledChange = { alarmEnabled = it },
                    notifyFiveMinutes = notifyFiveMinutes,
                    onNotifyFiveMinutesChange = { notifyFiveMinutes = it },
                    ringtoneLabel = defaultRingtone.second
                )
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val dueDate = buildDueDate(date, time, allDay)
                val repeatCount = repeatCountText.toIntOrNull()
                when {
                    desc.isBlank() -> error = "Description is required"
                    date.isNotBlank() && dueDate == null -> error = "Use date as dd/MM/yyyy and time as HH:mm"
                    repeatType != "none" && repeatCountText.isNotBlank() && repeatCount == null ->
                        error = "Repeat count must be a number"
                    else -> {
                        vm.addTaskForAll(
                            description = desc,
                            assigneeEmail = selectedAssignee,
                            dueDate = dueDate,
                            repeatType = repeatType,
                            repeatCount = repeatCount,
                            allDay = allDay,
                            alarmEnabled = alarmEnabled,
                            notifyBeforeMinutes = if (alarmEnabled && notifyFiveMinutes) 5 else null,
                            alarmRingtoneUri = if (alarmEnabled) defaultRingtone.first else null,
                            alarmRingtoneTitle = if (alarmEnabled) defaultRingtone.second else null,
                            creatorEmail = user.email ?: ""
                        )
                        onDismiss()
                    }
                }
            }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun IndividualTasksPage(vm: AppViewModel, user: FirebaseUser, profile: UserProfile) {
    val tasks by vm.tasks.collectAsState()
    val staff by vm.staff.collectAsState()
    val reminderTargets = remember(staff, user.email) { buildReminderTargets(staff, user.email) }
    var showAddDialog by remember { mutableStateOf(false) }
    var showComments by remember { mutableStateOf<Task?>(null) }
    var showEditTask by remember { mutableStateOf<Pair<Task, String>?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Individual Tasks", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            IconButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, "Add Task", tint = MaterialTheme.colorScheme.primary)
            }
        }

        if (tasks.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No individual tasks", color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
            }
        } else {
            val assigneeLabelMap = remember(staff, user.email) {
                buildMap {
                    staff.forEach { put(it.email.lowercase(), it.name.ifBlank { it.email.substringBefore('@') }) }
                    val selfEmail = user.email.orEmpty()
                    if (selfEmail.isNotBlank() && !containsKey(selfEmail.lowercase())) {
                        put(selfEmail.lowercase(), selfEmail.substringBefore('@'))
                    }
                }
            }
            val expandedGroups = remember { mutableStateMapOf<String, Boolean>() }
            fun displayNameForAssignee(email: String): String {
                if (email.isBlank()) return "Unassigned"
                return assigneeLabelMap[email.lowercase()] ?: email.substringBefore('@')
            }

            val groupedTasks = tasks
                .groupBy { it.assigneeEmail.trim().lowercase() }
                .toList()
                .sortedBy { (assigneeEmail, _) -> displayNameForAssignee(assigneeEmail).lowercase() }

            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                groupedTasks.forEach { (assigneeEmail, assigneeTasks) ->
                    val groupKey = assigneeEmail.ifBlank { "__unassigned__" }
                    val displayName = displayNameForAssignee(assigneeEmail)
                    val totalCount = assigneeTasks.size
                    val doneCount = assigneeTasks.count { it.isDone }
                    val pendingTasks = assigneeTasks.filter { !it.isDone }
                    val doneTasks = assigneeTasks.filter { it.isDone }
                    val expanded = expandedGroups[groupKey] ?: true

                    item(key = "group_header_$groupKey") {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { expandedGroups[groupKey] = !expanded }
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = displayName,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    if (assigneeEmail.isNotBlank()) {
                                        Text(
                                            text = assigneeEmail,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface.copy(0.65f)
                                        )
                                    }
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = "$doneCount/$totalCount",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Icon(
                                        imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                        contentDescription = if (expanded) "Collapse" else "Expand"
                                    )
                                }
                            }
                        }
                    }

                    if (expanded) {
                        items(pendingTasks, key = { it.id }) { task ->
                            TaskRow(task, "tasks", null, user, profile.hasAdminPowers, vm,
                                onShowComments = { showComments = it },
                                onEditTask = { t, type -> showEditTask = t to type },
                                reminderTargets = reminderTargets,
                                onRemindTask = { t, selected, onCallId ->
                                    vm.sendTaskReminder(
                                        task = t,
                                        taskType = "tasks",
                                        projectId = null,
                                        recipientEmails = selected,
                                        senderEmail = user.email ?: ""
                                    ) { _, callId -> onCallId(callId) }
                                })
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddIndividualTaskDialog(vm, user) { showAddDialog = false }
    }

    showComments?.let { task ->
        CommentsDialog(task, "tasks", null, user.email ?: "", vm) { showComments = null }
    }

    showEditTask?.let { (task, taskType) ->
        EditTaskDialog(task, taskType, null, user, profile.hasAdminPowers, vm, staff) { showEditTask = null }
    }
}

// ✅ Every completed task lives here - General + Individual - with all the same features
// (WhatsApp remind, reminder calls, comments, edit, delete, and untick to restore).
@Composable
fun CompletedTasksPage(vm: AppViewModel, user: FirebaseUser, profile: UserProfile) {
    val allForAll by vm.tasksForAll.collectAsState()
    val allTasks by vm.tasks.collectAsState()
    val staff by vm.staff.collectAsState()
    val reminderTargets = remember(staff, user.email) { buildReminderTargets(staff, user.email) }
    var showComments by remember { mutableStateOf<Task?>(null) }
    var showEditTask by remember { mutableStateOf<Pair<Task, String>?>(null) }

    val doneForAll = remember(allForAll) { allForAll.filter { it.isDone } }
    val doneIndividual = remember(allTasks) { allTasks.filter { it.isDone } }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("✅ Completed Tasks", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("${doneForAll.size + doneIndividual.size} total", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }

        if (doneForAll.isEmpty() && doneIndividual.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No completed tasks yet", color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (doneForAll.isNotEmpty()) {
                    item(key = "completed_header_forall") {
                        Text("General Tasks", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    }
                    items(doneForAll, key = { "fa_" + it.id }) { task ->
                        TaskRow(task, "tasks_for_all", null, user, profile.hasAdminPowers, vm,
                            onShowComments = { showComments = it },
                            onEditTask = { t, type -> showEditTask = t to type },
                            reminderTargets = reminderTargets,
                            onRemindTask = { t, selected, onCallId ->
                                vm.sendTaskReminder(
                                    task = t,
                                    taskType = "tasks_for_all",
                                    projectId = null,
                                    recipientEmails = selected,
                                    senderEmail = user.email ?: ""
                                ) { err, callId ->
                                    if (err != null) vm.clearError() else onCallId(callId)
                                }
                            })
                    }
                }
                if (doneIndividual.isNotEmpty()) {
                    item(key = "completed_header_individual") {
                        Text("Individual Tasks", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    }
                    items(doneIndividual, key = { "ind_" + it.id }) { task ->
                        TaskRow(task, "tasks", null, user, profile.hasAdminPowers, vm,
                            onShowComments = { showComments = it },
                            onEditTask = { t, type -> showEditTask = t to type },
                            reminderTargets = reminderTargets,
                            onRemindTask = { t, selected, onCallId ->
                                vm.sendTaskReminder(
                                    task = t,
                                    taskType = "tasks",
                                    projectId = null,
                                    recipientEmails = selected,
                                    senderEmail = user.email ?: ""
                                ) { _, callId -> onCallId(callId) }
                            })
                    }
                }
            }
        }
    }

    showComments?.let { task ->
        CommentsDialog(task, if (task.assigneeEmail.isNullOrBlank()) "tasks_for_all" else "tasks", null, user.email ?: "", vm) { showComments = null }
    }

    showEditTask?.let { (task, taskType) ->
        EditTaskDialog(task, taskType, null, user, profile.hasAdminPowers, vm, staff) { showEditTask = null }
    }
}

@Composable
fun AddIndividualTaskDialog(vm: AppViewModel, user: FirebaseUser, onDismiss: () -> Unit) {
    val staff by vm.staff.collectAsState()
    var desc by remember { mutableStateOf("") }
    var selectedStaff by remember { mutableStateOf<Staff?>(null) }
    var date by remember { mutableStateOf("") }
    var time by remember { mutableStateOf("09:00") }
    var allDay by remember { mutableStateOf(false) }
    var repeatType by remember { mutableStateOf("none") }
    var repeatCountText by remember { mutableStateOf("") }
    var alarmEnabled by remember { mutableStateOf(false) }
    var notifyFiveMinutes by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val defaultRingtone = remember { AppSettingsStore.getDefaultAlarmRingtone(context) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Individual Task") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = desc,
                    onValueChange = { desc = it; error = null },
                    label = { Text("Task Description") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
                Spacer(Modifier.height(8.dp))
                Text("Assign To", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                
                val allUsers = staff + Staff(name = user.email?.substringBefore('@') ?: "Me", email = user.email ?: "")
                allUsers.forEach { s ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { selectedStaff = s }.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(selected = selectedStaff == s, onClick = { selectedStaff = s })
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(s.name, fontWeight = FontWeight.Medium)
                            Text(s.email, style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))
                TaskScheduleFields(
                    date = date,
                    onDateChange = { date = it },
                    time = time,
                    onTimeChange = { time = it },
                    allDay = allDay,
                    onAllDayChange = { allDay = it },
                    repeatType = repeatType,
                    onRepeatTypeChange = { repeatType = it },
                    repeatCountText = repeatCountText,
                    onRepeatCountTextChange = { repeatCountText = it },
                    alarmEnabled = alarmEnabled,
                    onAlarmEnabledChange = { alarmEnabled = it },
                    notifyFiveMinutes = notifyFiveMinutes,
                    onNotifyFiveMinutesChange = { notifyFiveMinutes = it },
                    ringtoneLabel = defaultRingtone.second
                )

                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val dueDate = buildDueDate(date, time, allDay)
                val repeatCount = repeatCountText.toIntOrNull()
                when {
                    desc.isBlank() -> error = "Description is required"
                    selectedStaff == null -> error = "Select an assignee"
                    date.isNotBlank() && dueDate == null -> error = "Use date as dd/MM/yyyy and time as HH:mm"
                    repeatType != "none" && repeatCountText.isNotBlank() && repeatCount == null ->
                        error = "Repeat count must be a number"
                    else -> {
                        vm.addIndividualTask(
                            description = desc,
                            assigneeEmail = selectedStaff!!.email,
                            dueDate = dueDate,
                            repeatType = repeatType,
                            repeatCount = repeatCount,
                            allDay = allDay,
                            alarmEnabled = alarmEnabled,
                            notifyBeforeMinutes = if (alarmEnabled && notifyFiveMinutes) 5 else null,
                            alarmRingtoneUri = if (alarmEnabled) defaultRingtone.first else null,
                            alarmRingtoneTitle = if (alarmEnabled) defaultRingtone.second else null,
                            creatorEmail = user.email ?: ""
                        )
                        onDismiss()
                    }
                }
            }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun ProjectsPage(vm: AppViewModel, user: FirebaseUser, profile: UserProfile) {
    val projects by vm.projects.collectAsState()
    val staff by vm.staff.collectAsState()
    val projectTasks by vm.projectTasks.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }
    var expandedProjectId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(projects, user.email, profile.hasAdminPowers) {
        projects.forEach { project ->
            vm.listenProjectTasks(project.id, user.email, profile.hasAdminPowers)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("All Projects", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            IconButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, "Add Project", tint = MaterialTheme.colorScheme.primary)
            }
        }

        if (projects.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No projects yet", color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(projects, key = { it.id }) { project ->
                    ProjectCard(
                        project = project,
                        vm = vm,
                        user = user,
                        isAdmin = profile.hasAdminPowers,
                        staff = staff,
                        tasks = projectTasks[project.id].orEmpty(),
                        expandedProjectId = expandedProjectId,
                        onExpandChange = { id -> expandedProjectId = if (expandedProjectId == id) null else id }
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        AddProjectDialog(vm, staff, user) { showAddDialog = false }
    }
}

@Composable
fun AddSubUserDialog(vm: AppViewModel, user: FirebaseUser, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var whatsappNumber by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!loading) onDismiss() },
        title = { Text("Add Sub User") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; error = null },
                    label = { Text("User Name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it; error = null },
                    label = { Text("Email Address") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                )
                OutlinedTextField(
                    value = whatsappNumber,
                    onValueChange = { whatsappNumber = it; error = null },
                    label = { Text("WhatsApp Number (e.g. +971501234567)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; error = null },
                    label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation()
                )
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; error = null },
                    label = { Text("Confirm Password") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation()
                )
                Text(
                    "This creates a new Firebase Auth account and adds the user to your team staff list.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
                )
                if (error != null) {
                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !loading,
                onClick = {
                    when {
                        name.isBlank() -> error = "User name is required"
                        email.isBlank() -> error = "Email address is required"
                        password.length < 6 -> error = "Password must be at least 6 characters"
                        password != confirmPassword -> error = "Passwords do not match"
                        else -> {
                            loading = true
                            vm.createSubUser(name, email, password, user.email ?: "", whatsappNumber) { result ->
                                loading = false
                                if (result == null) onDismiss() else error = result
                            }
                        }
                    }
                }
            ) {
                Text(if (loading) "Creating..." else "Create")
            }
        },
        dismissButton = {
            TextButton(enabled = !loading, onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun ProjectCard(
    project: Project,
    vm: AppViewModel,
    user: FirebaseUser,
    isAdmin: Boolean,
    staff: List<Staff>,
    tasks: List<Task>,
    expandedProjectId: String?,
    onExpandChange: (String) -> Unit
) {
    var showAddTaskDialog by remember(project.id) { mutableStateOf(false) }
    var showComments by remember(project.id) { mutableStateOf<Task?>(null) }
    var showEditTask by remember(project.id) { mutableStateOf<Pair<Task, String>?>(null) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth().clickable { onExpandChange(project.id) }.padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text(project.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                IconButton(onClick = { vm.deleteProject(project.id, "abcd") { } }) {
                    Icon(Icons.Default.Delete, "Delete", modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.error)
                }
            }
            if (expandedProjectId == project.id) {
                Spacer(Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                Text("Members:", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                project.members.forEach { member ->
                    Text("• $member", style = MaterialTheme.typography.labelSmall)
                }

                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Project Tasks", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    IconButton(onClick = { showAddTaskDialog = true }) {
                        Icon(Icons.Default.Add, "Add Project Task", tint = MaterialTheme.colorScheme.primary)
                    }
                }

                if (tasks.isEmpty()) {
                    Text("No tasks in this project", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
                } else {
                    val pending = tasks.filter { !it.isDone }
                    val done = tasks.filter { it.isDone }
                    pending.forEach { task ->
                        TaskRow(
                            task = task,
                            taskType = "project",
                            projectId = project.id,
                            user = user,
                            isAdmin = isAdmin,
                            vm = vm,
                            onShowComments = { showComments = it },
                            onEditTask = { t, type -> showEditTask = t to type },
                            reminderTargets = buildReminderTargets(staff, user.email),
                            onRemindTask = { t, selected, onCallId ->
                                vm.sendTaskReminder(
                                    task = t,
                                    taskType = "project",
                                    projectId = project.id,
                                    recipientEmails = selected,
                                    senderEmail = user.email ?: ""
                                ) { _, callId -> onCallId(callId) }
                            }
                        )
                    }
                    if (done.isNotEmpty()) {
                        CompletedToggle(done, "project", project.id, user, isAdmin, vm,
                            onShowComments = { showComments = it },
                            onEditTask = { t, type -> showEditTask = t to type })
                    }
                }
            }
        }
    }

    if (showAddTaskDialog) {
        AddProjectTaskDialog(vm, user, staff, project) { showAddTaskDialog = false }
    }

    showComments?.let { task ->
        CommentsDialog(task, "project", project.id, user.email ?: "", vm) { showComments = null }
    }

    showEditTask?.let { (task, taskType) ->
        EditTaskDialog(task, taskType, project.id, user, isAdmin, vm, staff) { showEditTask = null }
    }
}

@Composable
fun AddProjectDialog(vm: AppViewModel, staff: List<Staff>, user: FirebaseUser, onDismiss: () -> Unit) {
    var projectName by remember { mutableStateOf("") }
    var selectedMembers by remember { mutableStateOf(setOf<String>()) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create New Project") },
        text = {
            Column {
                OutlinedTextField(
                    value = projectName,
                    onValueChange = { projectName = it; error = null },
                    label = { Text("Project Name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(Modifier.height(12.dp))
                Text("Select Members", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                
                val allUsers = staff + Staff(name = user.email?.substringBefore('@') ?: "Me", email = user.email ?: "")
                allUsers.forEach { s ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable {
                            selectedMembers = if (selectedMembers.contains(s.email))
                                selectedMembers - s.email else selectedMembers + s.email
                        }.padding(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(checked = selectedMembers.contains(s.email), onCheckedChange = {
                            selectedMembers = if (selectedMembers.contains(s.email))
                                selectedMembers - s.email else selectedMembers + s.email
                        })
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(s.name, fontWeight = FontWeight.Medium)
                            Text(s.email, style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
                        }
                    }
                }

                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                when {
                    projectName.isBlank() -> error = "Project name is required"
                    selectedMembers.isEmpty() -> error = "Select at least one member"
                    else -> {
                        vm.createProject(projectName, selectedMembers.toList())
                        onDismiss()
                    }
                }
            }) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun AddProjectTaskDialog(vm: AppViewModel, user: FirebaseUser, staff: List<Staff>, project: Project, onDismiss: () -> Unit) {
    var desc by remember { mutableStateOf("") }
    var selectedAssignee by remember { mutableStateOf("") }
    var date by remember { mutableStateOf("") }
    var time by remember { mutableStateOf("09:00") }
    var allDay by remember { mutableStateOf(false) }
    var repeatType by remember { mutableStateOf("none") }
    var repeatCountText by remember { mutableStateOf("") }
    var alarmEnabled by remember { mutableStateOf(false) }
    var notifyFiveMinutes by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val defaultRingtone = remember { AppSettingsStore.getDefaultAlarmRingtone(context) }

    val members = remember(project.members, staff, user.email) {
        val all = (staff.map { it.email } + project.members + listOf(user.email ?: ""))
            .filter { it.isNotBlank() }
            .distinct()
        all
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Task in ${project.name}") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = desc,
                    onValueChange = { desc = it; error = null },
                    label = { Text("Task Description") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
                Spacer(Modifier.height(8.dp))
                MemberDropdown(
                    label = "Assign To",
                    selectedEmail = selectedAssignee,
                    users = members,
                    onSelect = { selectedAssignee = it }
                )
                Spacer(Modifier.height(8.dp))
                TaskScheduleFields(
                    date = date,
                    onDateChange = { date = it },
                    time = time,
                    onTimeChange = { time = it },
                    allDay = allDay,
                    onAllDayChange = { allDay = it },
                    repeatType = repeatType,
                    onRepeatTypeChange = { repeatType = it },
                    repeatCountText = repeatCountText,
                    onRepeatCountTextChange = { repeatCountText = it },
                    alarmEnabled = alarmEnabled,
                    onAlarmEnabledChange = { alarmEnabled = it },
                    notifyFiveMinutes = notifyFiveMinutes,
                    onNotifyFiveMinutesChange = { notifyFiveMinutes = it },
                    ringtoneLabel = defaultRingtone.second
                )
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val dueDate = buildDueDate(date, time, allDay)
                val repeatCount = repeatCountText.toIntOrNull()
                when {
                    desc.isBlank() -> error = "Description is required"
                    selectedAssignee.isBlank() -> error = "Select assignee"
                    date.isNotBlank() && dueDate == null -> error = "Use date as dd/MM/yyyy and time as HH:mm"
                    repeatType != "none" && repeatCountText.isNotBlank() && repeatCount == null ->
                        error = "Repeat count must be a number"
                    else -> {
                        vm.addProjectTask(
                            projectId = project.id,
                            description = desc,
                            assigneeEmail = selectedAssignee,
                            dueDate = dueDate,
                            repeatType = repeatType,
                            repeatCount = repeatCount,
                            allDay = allDay,
                            alarmEnabled = alarmEnabled,
                            notifyBeforeMinutes = if (alarmEnabled && notifyFiveMinutes) 5 else null,
                            alarmRingtoneUri = if (alarmEnabled) defaultRingtone.first else null,
                            alarmRingtoneTitle = if (alarmEnabled) defaultRingtone.second else null,
                            creatorEmail = user.email ?: ""
                        )
                        onDismiss()
                    }
                }
            }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun TeamMembersPage(vm: AppViewModel, user: FirebaseUser, profile: UserProfile) {
    val staff by vm.staff.collectAsState()
    val adminEmail = if (profile.isAdmin) profile.email else profile.ownerAdminEmail.ifBlank { profile.email }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                    Text("Admin", fontWeight = FontWeight.Bold)
                    Text(adminEmail, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        if (staff.isEmpty()) {
            item {
                Text("No sub users added yet", color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
            }
        } else {
            items(staff, key = { it.id }) { member ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(member.name.ifBlank { member.email.substringBefore('@') }, fontWeight = FontWeight.SemiBold)
                        Text(member.email, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsPage(vm: AppViewModel) {
    val context = LocalContext.current
    var ringtone by remember { mutableStateOf(AppSettingsStore.getDefaultAlarmRingtone(context)) }
    val projects by vm.projects.collectAsState()
    var selectedProjectId by remember { mutableStateOf(AppSettingsStore.getWidgetProjectSelection(context).first) }
    var selectedProjectName by remember { mutableStateOf(AppSettingsStore.getWidgetProjectSelection(context).second) }
    var projectExpanded by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uri = result.data?.getParcelableExtra<Uri>(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
        if (uri != null) {
            val title = RingtoneManager.getRingtone(context, uri)?.getTitle(context) ?: "Selected ringtone"
            AppSettingsStore.setDefaultAlarmRingtone(context, uri.toString(), title)
            ringtone = uri.toString() to title
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Alarm Settings", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("Default ringtone for task alarms", style = MaterialTheme.typography.bodySmall)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(ringtone.second, fontWeight = FontWeight.SemiBold)
                Text(ringtone.first, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
                Button(onClick = {
                    val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
                        putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
                        putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Choose Alarm Ringtone")
                    }
                    launcher.launch(intent)
                }) {
                    Text("Choose From Device")
                }
            }
        }

        Text("Project Widget Selection", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        ExposedDropdownMenuBox(expanded = projectExpanded, onExpandedChange = { projectExpanded = !projectExpanded }) {
            OutlinedTextField(
                value = selectedProjectName.ifBlank { "Select project for widget" },
                onValueChange = {},
                readOnly = true,
                modifier = Modifier.menuAnchor().fillMaxWidth(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = projectExpanded) },
                label = { Text("Project tasks widget") }
            )
            ExposedDropdownMenu(expanded = projectExpanded, onDismissRequest = { projectExpanded = false }) {
                projects.forEach { project ->
                    DropdownMenuItem(
                        text = { Text(project.name) },
                        onClick = {
                            selectedProjectId = project.id
                            selectedProjectName = project.name
                            AppSettingsStore.setWidgetProjectSelection(context, project.id, project.name)
                            projectExpanded = false
                        }
                    )
                }
            }
        }
    }
}

enum class PlannerViewMode(val label: String) {
    Day("Day"),
    Week("Week"),
    Month("Month"),
    Year("Year"),
    FourDays("4 days")
}

@Composable
fun TimetablePlannerPage(vm: AppViewModel, user: FirebaseUser, profile: UserProfile) {
    val tasks by vm.tasks.collectAsState()
    val tasksForAll by vm.tasksForAll.collectAsState()
    val projects by vm.projects.collectAsState()
    val projectTasks by vm.projectTasks.collectAsState()
    var selectedDate by remember { mutableStateOf(SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date())) }
    var selectedTime by remember { mutableStateOf("09:00") }
    var mode by remember { mutableStateOf(PlannerViewMode.Day) }
    var modeExpanded by remember { mutableStateOf(false) }
    val context = LocalContext.current

    LaunchedEffect(projects, user.email, profile.hasAdminPowers) {
        projects.forEach { vm.listenProjectTasks(it.id, user.email, profile.hasAdminPowers) }
    }

    val allProjectTasks = projectTasks.values.flatten()
    val allTasks = remember(tasks, tasksForAll, allProjectTasks) {
        (tasks + tasksForAll + allProjectTasks)
            .distinctBy { it.id }
            .sortedBy { parseDueDateToDate(it.dueDate)?.time ?: Long.MAX_VALUE }
    }

    val baseCalendar = remember(selectedDate) { parseDateToCalendar(selectedDate) }
    val startDate = remember(baseCalendar, mode) {
        Calendar.getInstance().apply { time = baseCalendar.time }.apply {
            when (mode) {
                PlannerViewMode.Day -> {}
                PlannerViewMode.Week -> set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
                PlannerViewMode.Month -> set(Calendar.DAY_OF_MONTH, 1)
                PlannerViewMode.Year -> {
                    set(Calendar.DAY_OF_YEAR, 1)
                }
                PlannerViewMode.FourDays -> {}
            }
        }
    }
    val endDate = remember(startDate, mode) {
        Calendar.getInstance().apply { time = startDate.time }.apply {
            when (mode) {
                PlannerViewMode.Day -> add(Calendar.DAY_OF_MONTH, 1)
                PlannerViewMode.Week -> add(Calendar.DAY_OF_MONTH, 7)
                PlannerViewMode.Month -> add(Calendar.MONTH, 1)
                PlannerViewMode.Year -> add(Calendar.YEAR, 1)
                PlannerViewMode.FourDays -> add(Calendar.DAY_OF_MONTH, 4)
            }
        }
    }

    fun moveRange(delta: Int) {
        val cal = parseDateToCalendar(selectedDate)
        when (mode) {
            PlannerViewMode.Day -> cal.add(Calendar.DAY_OF_MONTH, delta)
            PlannerViewMode.Week -> cal.add(Calendar.DAY_OF_MONTH, 7 * delta)
            PlannerViewMode.Month -> cal.add(Calendar.MONTH, delta)
            PlannerViewMode.Year -> cal.add(Calendar.YEAR, delta)
            PlannerViewMode.FourDays -> cal.add(Calendar.DAY_OF_MONTH, 4 * delta)
        }
        selectedDate = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(cal.time)
    }

    val rangeTasks = allTasks.filter { task ->
        val due = parseDueDateToDate(task.dueDate) ?: return@filter false
        due >= startDate.time && due < endDate.time
    }

    Column(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { moveRange(-1) }) {
                Icon(Icons.Default.ChevronLeft, "Previous")
            }
            TextButton(onClick = {
                val cal = parseDateToCalendar(selectedDate)
                DatePickerDialog(
                    context,
                    { _, y, m, d -> selectedDate = String.format("%02d/%02d/%04d", d, m + 1, y) },
                    cal.get(Calendar.YEAR),
                    cal.get(Calendar.MONTH),
                    cal.get(Calendar.DAY_OF_MONTH)
                ).show()
            }) {
                Text(selectedDate, fontWeight = FontWeight.SemiBold)
            }
            IconButton(onClick = { moveRange(1) }) {
                Icon(Icons.Default.ChevronRight, "Next")
            }
            Spacer(Modifier.weight(1f))
            ExposedDropdownMenuBox(expanded = modeExpanded, onExpandedChange = { modeExpanded = !modeExpanded }) {
                OutlinedTextField(
                    value = mode.label,
                    onValueChange = {},
                    readOnly = true,
                    modifier = Modifier.menuAnchor().width(150.dp),
                    singleLine = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = modeExpanded) }
                )
                ExposedDropdownMenu(expanded = modeExpanded, onDismissRequest = { modeExpanded = false }) {
                    PlannerViewMode.values().forEach { viewMode ->
                        DropdownMenuItem(
                            text = { Text(viewMode.label) },
                            onClick = {
                                mode = viewMode
                                modeExpanded = false
                            }
                        )
                    }
                }
            }
        }

        PickerField(
            value = selectedTime,
            label = "Focus Time",
            placeholder = "Select time",
            icon = Icons.Default.AccessTime,
            onClick = {
                val (h, m) = parseTimeToHourMinute(selectedTime)
                TimePickerDialog(context, { _, hh, mm ->
                    selectedTime = String.format("%02d:%02d", hh, mm)
                }, h, m, false).show()
            }
        )

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.fillMaxWidth().padding(10.dp)) {
                val startTxt = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(startDate.time)
                val endTmp = Calendar.getInstance().apply { time = endDate.time; add(Calendar.DAY_OF_MONTH, -1) }
                val endTxt = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(endTmp.time)
                Text("${mode.label} view: $startTxt - $endTxt", fontWeight = FontWeight.SemiBold)
                Text("Tasks in range: ${rangeTasks.size}", style = MaterialTheme.typography.bodySmall)
            }
        }

        if (rangeTasks.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No tasks in selected range")
            }
        } else {
            when (mode) {
                PlannerViewMode.Day, PlannerViewMode.Week, PlannerViewMode.FourDays -> {
                    val dayBuckets = rangeTasks.groupBy {
                        val date = parseDueDateToDate(it.dueDate) ?: Date()
                        SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(date)
                    }
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        dayBuckets.toSortedMap(compareBy {
                            parseDueDateToDate("$it 00:00")?.time ?: Long.MAX_VALUE
                        }).forEach { (day, list) ->
                            item {
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Column(modifier = Modifier.fillMaxWidth().padding(10.dp)) {
                                        Text(day, fontWeight = FontWeight.Bold)
                                        list.forEach { task ->
                                            Text("• ${task.description} ${if (task.dueDate.isNullOrBlank()) "" else "(${formatDueDate(task.dueDate)})"}")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                PlannerViewMode.Month -> {
                    val byDay = rangeTasks.groupBy {
                        val date = parseDueDateToDate(it.dueDate) ?: Date()
                        SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(date)
                    }
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        byDay.toSortedMap(compareBy {
                            parseDueDateToDate("$it 00:00")?.time ?: Long.MAX_VALUE
                        }).forEach { (day, list) ->
                            item {
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Row(modifier = Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(day, fontWeight = FontWeight.SemiBold)
                                        Text("${list.size} task(s)")
                                    }
                                }
                            }
                        }
                    }
                }
                PlannerViewMode.Year -> {
                    val byMonth = rangeTasks.groupBy {
                        val date = parseDueDateToDate(it.dueDate) ?: Date()
                        SimpleDateFormat("MMMM yyyy", Locale.getDefault()).format(date)
                    }
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        byMonth.forEach { (month, list) ->
                            item {
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Row(modifier = Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(month, fontWeight = FontWeight.SemiBold)
                                        Text("${list.size} task(s)")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MemberDropdown(label: String, selectedEmail: String, users: List<String>, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
        OutlinedTextField(
            value = selectedEmail,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            placeholder = { Text("Select member") },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            users.forEach { email ->
                DropdownMenuItem(
                    text = { Text(email) },
                    onClick = {
                        onSelect(email)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
fun TaskScheduleFields(
    date: String,
    onDateChange: (String) -> Unit,
    time: String,
    onTimeChange: (String) -> Unit,
    allDay: Boolean,
    onAllDayChange: (Boolean) -> Unit,
    repeatType: String,
    onRepeatTypeChange: (String) -> Unit,
    repeatCountText: String,
    onRepeatCountTextChange: (String) -> Unit,
    alarmEnabled: Boolean,
    onAlarmEnabledChange: (Boolean) -> Unit,
    notifyFiveMinutes: Boolean,
    onNotifyFiveMinutesChange: (Boolean) -> Unit,
    ringtoneLabel: String
) {
    val context = LocalContext.current
    val initialCalendar = remember(date) { parseDateToCalendar(date) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = {
            val shifted = shiftDate(date, -1)
            onDateChange(shifted)
        }) {
            Icon(Icons.Default.ChevronLeft, "Previous Date")
        }
        Text(
            text = if (date.isBlank()) "No date selected" else date,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold
        )
        IconButton(onClick = {
            val shifted = shiftDate(date, 1)
            onDateChange(shifted)
        }) {
            Icon(Icons.Default.ChevronRight, "Next Date")
        }
    }

    PickerField(
        value = date,
        label = "Due Date (dd/MM/yyyy)",
        placeholder = "Select date",
        icon = Icons.Default.DateRange,
        onClick = {
            DatePickerDialog(
                context,
                { _, year, month, dayOfMonth ->
                    onDateChange(String.format("%02d/%02d/%04d", dayOfMonth, month + 1, year))
                },
                initialCalendar.get(Calendar.YEAR),
                initialCalendar.get(Calendar.MONTH),
                initialCalendar.get(Calendar.DAY_OF_MONTH)
            ).show()
        }
    )
    Spacer(Modifier.height(6.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = allDay, onCheckedChange = onAllDayChange)
        Text("Full day")
    }
    if (!allDay) {
        val (h, m) = parseTimeToHourMinute(time)
        PickerField(
            value = time,
            label = "Time (HH:mm)",
            placeholder = "Select time",
            icon = Icons.Default.AccessTime,
            onClick = {
                TimePickerDialog(
                    context,
                    { _, hourOfDay, minute ->
                        onTimeChange(String.format("%02d:%02d", hourOfDay, minute))
                    },
                    h,
                    m,
                    false
                ).show()
            }
        )
    }
    Spacer(Modifier.height(6.dp))
    val repeatOptions = listOf("none", "daily", "weekly", "monthly", "yearly")
    var repeatExpanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = repeatExpanded, onExpandedChange = { repeatExpanded = !repeatExpanded }) {
        OutlinedTextField(
            value = repeatType,
            onValueChange = {},
            readOnly = true,
            label = { Text("Repeat") },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = repeatExpanded) }
        )
        ExposedDropdownMenu(expanded = repeatExpanded, onDismissRequest = { repeatExpanded = false }) {
            repeatOptions.forEach { option ->
                DropdownMenuItem(text = { Text(option) }, onClick = {
                    onRepeatTypeChange(option)
                    repeatExpanded = false
                })
            }
        }
    }
    if (repeatType != "none") {
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = repeatCountText,
            onValueChange = onRepeatCountTextChange,
            label = { Text("Repeat how many times? (optional)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
    }
    Spacer(Modifier.height(6.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = alarmEnabled, onCheckedChange = onAlarmEnabledChange)
        Text("Set alarm")
    }
    if (alarmEnabled) {
        Text("Ringtone: $ringtoneLabel", style = MaterialTheme.typography.bodySmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = notifyFiveMinutes, onCheckedChange = onNotifyFiveMinutesChange)
            Text("Send notification 5 minutes before")
        }
    }
}

fun buildDueDate(date: String, time: String, allDay: Boolean): String? {
    if (date.isBlank()) return null
    val dateRegex = Regex("^\\d{2}/\\d{2}/\\d{4}$")
    if (!dateRegex.matches(date)) return null
    if (allDay) return date
    val timeRegex = Regex("^\\d{2}:\\d{2}$")
    if (!timeRegex.matches(time)) return null
    return "$date $time"
}

@Composable
fun PickerField(
    value: String,
    label: String,
    placeholder: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        trailingIcon = {
            IconButton(onClick = onClick) {
                Icon(icon, label)
            }
        },
        singleLine = true
    )
}

fun parseDateToCalendar(date: String?): Calendar {
    val cal = Calendar.getInstance()
    val normalized = date.orEmpty().trim()
    if (normalized.isBlank()) return cal

    val patterns = listOf("dd/MM/yyyy", "yyyy-MM-dd", "dd/MM/yyyy HH:mm", "yyyy-MM-dd'T'HH:mm")
    patterns.firstNotNullOfOrNull { pattern ->
        runCatching { SimpleDateFormat(pattern, Locale.getDefault()).parse(normalized) }.getOrNull()
    }?.let { parsed ->
        cal.time = parsed
    }
    return cal
}

fun shiftDate(date: String, dayDelta: Int): String {
    val cal = parseDateToCalendar(date)
    cal.add(Calendar.DAY_OF_MONTH, dayDelta)
    return SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(cal.time)
}

fun parseTimeToHourMinute(time: String): Pair<Int, Int> {
    val parts = time.split(":")
    val hour = parts.getOrNull(0)?.toIntOrNull() ?: 9
    val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
    return hour.coerceIn(0, 23) to minute.coerceIn(0, 59)
}

fun splitDueDate(dueDate: String?): Pair<String, String> {
    if (dueDate.isNullOrBlank()) return "" to "09:00"
    val raw = dueDate.trim()

    val dateTimePatterns = listOf(
        "dd/MM/yyyy HH:mm",
        "yyyy-MM-dd'T'HH:mm"
    )
    dateTimePatterns.firstNotNullOfOrNull { pattern ->
        runCatching { SimpleDateFormat(pattern, Locale.getDefault()).parse(raw) }.getOrNull()
    }?.let { parsed ->
        val date = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(parsed)
        val time = SimpleDateFormat("HH:mm", Locale.getDefault()).format(parsed)
        return date to time
    }

    val dateOnlyPatterns = listOf("dd/MM/yyyy", "yyyy-MM-dd")
    dateOnlyPatterns.firstNotNullOfOrNull { pattern ->
        runCatching { SimpleDateFormat(pattern, Locale.getDefault()).parse(raw) }.getOrNull()
    }?.let { parsed ->
        val date = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(parsed)
        return date to "09:00"
    }

    return raw to "09:00"
}

object AppSettingsStore {
    private const val PREFS = "assign_task_prefs"
    private const val KEY_RINGTONE_URI = "default_alarm_ringtone_uri"
    private const val KEY_RINGTONE_TITLE = "default_alarm_ringtone_title"
    private const val KEY_WIDGET_PROJECT_ID = "widget_project_id"
    private const val KEY_WIDGET_PROJECT_NAME = "widget_project_name"
    private const val KEY_REMINDER_PROMPT_SHOWN = "reminder_prompt_shown"
    private const val KEY_REMINDER_RINGTONE_ENABLED = "reminder_ringtone_enabled"

    fun getDefaultAlarmRingtone(context: Context): Pair<String, String> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val fallbackUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)?.toString().orEmpty()
        val fallbackTitle = "Default alarm ringtone"
        val uri = prefs.getString(KEY_RINGTONE_URI, fallbackUri).orEmpty()
        val title = prefs.getString(KEY_RINGTONE_TITLE, fallbackTitle).orEmpty()
        return uri to title
    }

    fun setDefaultAlarmRingtone(context: Context, uri: String, title: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_RINGTONE_URI, uri)
            .putString(KEY_RINGTONE_TITLE, title)
            .apply()
    }

    fun getWidgetProjectSelection(context: Context): Pair<String, String> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getString(KEY_WIDGET_PROJECT_ID, "").orEmpty() to
            prefs.getString(KEY_WIDGET_PROJECT_NAME, "").orEmpty()
    }

    fun setWidgetProjectSelection(context: Context, projectId: String, projectName: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_WIDGET_PROJECT_ID, projectId)
            .putString(KEY_WIDGET_PROJECT_NAME, projectName)
            .apply()
    }

    fun shouldShowReminderPermissionPrompt(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return !prefs.getBoolean(KEY_REMINDER_PROMPT_SHOWN, false)
    }

    fun setReminderPermissionPromptShown(context: Context, shown: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_REMINDER_PROMPT_SHOWN, shown)
            .apply()
    }

    fun isReminderRingtoneEnabled(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_REMINDER_RINGTONE_ENABLED, true)
    }

    fun setReminderRingtoneEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_REMINDER_RINGTONE_ENABLED, enabled)
            .apply()
    }
}

@Composable
fun UserProfilePage(profile: UserProfile, vm: AppViewModel, onBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(Icons.Default.Person, null, modifier = Modifier.size(64.dp).align(Alignment.CenterHorizontally),
            tint = MaterialTheme.colorScheme.primary)
        
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ProfileInfoRow("Name", profile.displayName)
                HorizontalDivider()
                ProfileInfoRow("Email", profile.email)
                HorizontalDivider()
                ProfileInfoRow("Role", if (profile.isAdmin) "Admin" else "User")
                HorizontalDivider()
                ProfileInfoRow("Status", if (profile.active) "Active" else "Inactive")
            }
        }

        Spacer(Modifier.weight(1f))

        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}

@Composable
fun ProfileInfoRow(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun TaskRow(task: Task, taskType: String, projectId: String?, user: FirebaseUser,
            isAdmin: Boolean, vm: AppViewModel,
            onShowComments: (Task) -> Unit,
        onEditTask: (Task, String) -> Unit,
        reminderTargets: List<String> = emptyList(),
        onRemindTask: ((Task, List<String>, (String?) -> Unit) -> Unit)? = null) {
    val isDone = task.isDone
    val context = LocalContext.current
    val density = LocalDensity.current
    var showDeleteDialog by remember(task.id) { mutableStateOf(false) }
    var showReminderDialog by remember(task.id) { mutableStateOf(false) }
    var showQuickReminderConfirm by remember(task.id) { mutableStateOf(false) }
    var showReminderRepliesDialog by remember(task.id) { mutableStateOf(false) }
    var showWaTargetsPicker by remember(task.id) { mutableStateOf(false) }
    var swipeOffsetPx by remember(task.id) { mutableFloatStateOf(0f) }
    val maxSwipePx = with(density) { 156.dp.toPx() }

    fun startSenderRinging(callId: String?, selectedRecipients: List<String>) {
        if (callId.isNullOrBlank()) return
        // Reminder call page is opened by live reminder-call listener in MainAppScreen.
    }

    Box(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier
                .matchParentSize()
                .background(MaterialTheme.colorScheme.surfaceVariant),
            horizontalArrangement = Arrangement.Start,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = {
                    swipeOffsetPx = 0f
                    onEditTask(task, taskType)
                },
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Default.Edit, "Edit")
                Spacer(Modifier.width(4.dp))
                Text("Edit")
            }
            if (isAdmin) {
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = {
                        swipeOffsetPx = 0f
                        showDeleteDialog = true
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Icon(Icons.Default.Delete, "Delete")
                    Spacer(Modifier.width(4.dp))
                    Text("Delete")
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(swipeOffsetPx.roundToInt(), 0) }
                .background(MaterialTheme.colorScheme.surface)
                .draggable(
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { delta ->
                        swipeOffsetPx = (swipeOffsetPx + delta).coerceIn(0f, maxSwipePx)
                    },
                    onDragStopped = {
                        swipeOffsetPx = if (swipeOffsetPx >= (maxSwipePx * 0.4f)) maxSwipePx else 0f
                    }
                )
                .combinedClickable(
                    onClick = {
                        if (swipeOffsetPx > 0f) swipeOffsetPx = 0f
                    },
                    onDoubleClick = {
                        if (onRemindTask != null && reminderTargets.isNotEmpty()) {
                            showQuickReminderConfirm = true
                        }
                    }
                )
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.Top
        ) {
            Checkbox(checked = isDone, onCheckedChange = { checked ->
                vm.toggleTaskDone(task, taskType, projectId, checked, user.email ?: "")
            }, modifier = Modifier.padding(top = 0.dp))
            Column(modifier = Modifier.weight(1f).padding(start = 4.dp)) {
                Text(
                    text = task.description,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        textDecoration = if (isDone) TextDecoration.LineThrough else TextDecoration.None
                    ),
                    color = if (isDone) MaterialTheme.colorScheme.onSurface.copy(0.45f)
                    else MaterialTheme.colorScheme.onSurface
                )
                if (!task.dueDate.isNullOrEmpty()) {
                    val overdue = isOverdue(task.dueDate) && !isDone
                    Text(text = formatDueDate(task.dueDate),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
                }
                if (task.createdBy.isNotEmpty()) {
                    Text("By ${task.createdBy.substringBefore('@')}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(0.45f))
                }
                if (isDone && !task.completedBy.isNullOrEmpty()) {
                    Text("Done by ${task.completedBy!!.substringBefore('@')}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(0.45f))
                }
            }
            val waReminderContext = LocalContext.current
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { onShowComments(task) }, modifier = Modifier.size(32.dp)) {
                    BadgedBox(badge = {
                        if (task.comments.isNotEmpty()) Badge { Text("${task.comments.size}") }
                    }) { Icon(Icons.Default.Comment, "Comments", modifier = Modifier.size(18.dp)) }
                }

                IconButton(onClick = { showWaTargetsPicker = true }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Send, "WhatsApp Reminder", modifier = Modifier.size(18.dp), tint = androidx.compose.ui.graphics.Color(0xFF25D366))
                }

                if (onRemindTask != null && reminderTargets.isNotEmpty()) {
                    IconButton(onClick = { showReminderDialog = true }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.NotificationsActive, "Remind", modifier = Modifier.size(18.dp))
                    }
                }
                IconButton(onClick = { showReminderRepliesDialog = true }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Groups, "Reminder Replies", modifier = Modifier.size(18.dp))
                }
            }
        }
    }

    if (showDeleteDialog) {
        TaskDeletePasswordDialog(task, taskType, projectId, vm) { showDeleteDialog = false }
    }

    if (showReminderDialog && onRemindTask != null) {
        val waDialogContext = LocalContext.current
        ReminderTargetsDialog(
            task = task,
            targets = reminderTargets,
            onDismiss = { showReminderDialog = false },
            onSend = { selected ->
                showReminderDialog = false
                onRemindTask.invoke(task, selected) { callId ->
                    startSenderRinging(callId, selected)
                }
            },
            onSendWhatsApp = { selected ->
                showReminderDialog = false
                sendAlignWhatsAppReminder(waDialogContext, task, selected)
            }
        )
    }

    if (showWaTargetsPicker) {
        val waPickerContext = LocalContext.current
        WhatsAppTargetsDialog(
            task = task,
            onDismiss = { showWaTargetsPicker = false },
            onSend = { selected, groups ->
                showWaTargetsPicker = false
                sendAlignWhatsAppReminder(waPickerContext, task, selected)
                groups.forEach { (gname, gjid) -> sendAlignWhatsAppGroupReminder(waPickerContext, task, gname, gjid) }
            }
        )
    }

    if (showQuickReminderConfirm && onRemindTask != null) {
        AlertDialog(
            onDismissRequest = { showQuickReminderConfirm = false },
            title = { Text("Send Reminder") },
            text = { Text("Do you want to send reminder about this task to all available members?") },
            confirmButton = {
                Button(onClick = {
                    showQuickReminderConfirm = false
                    onRemindTask.invoke(task, reminderTargets) { callId ->
                        startSenderRinging(callId, reminderTargets)
                    }
                }) { Text("Yes, Send") }
            },
            dismissButton = {
                TextButton(onClick = { showQuickReminderConfirm = false }) { Text("Cancel") }
            }
        )
    }

    if (showReminderRepliesDialog) {
        ReminderRepliesDialog(
            task = task,
            senderUid = user.uid,
            onDismiss = { showReminderRepliesDialog = false }
        )
    }

}

private fun normalizeWaDigitsAndroid(raw: String?): String {
    var d = (raw ?: "").filter { it.isDigit() }
    if (d.startsWith("00")) d = d.substring(2)
    if (d.startsWith("0")) d = "971" + d.substring(1)
    return d
}

// Queue a WhatsApp reminder for this task - the Railway server (the only WhatsApp node) sends it in seconds.
// targetEmails: the members picked in the reminder dialog. Empty = smart default (assignee -> admin).
fun sendAlignWhatsAppReminder(context: android.content.Context, task: Task, targetEmails: List<String> = emptyList()) {
    val db = FirebaseFirestore.getInstance()
    val assignee = (task.assigneeEmail ?: "").lowercase()
    val myEmail = FirebaseAuth.getInstance().currentUser?.email?.lowercase() ?: ""
    val wanted = targetEmails.map { it.trim().lowercase() }.filter { it.isNotBlank() }
    db.collection("$REMINDER_BASE/staff").get()
        .addOnSuccessListener { snap ->
            val numbers = LinkedHashMap<String, String>()   // name -> wa number
            var fallback = ""
            var fallbackName = ""
            snap.documents.forEach { doc ->
                val v = doc.data ?: return@forEach
                val email = (v["email"] as? String)?.lowercase() ?: ""
                val name = ((v["name"] as? String) ?: "").ifBlank { email.substringBefore('@') }
                val wa = normalizeWaDigitsAndroid(v["whatsappNumber"] as? String)
                if (wa.isBlank()) return@forEach
                if (wanted.isNotEmpty()) {
                    if (email in wanted || name.lowercase() in wanted) numbers[name] = wa
                } else {
                    if (numbers.isEmpty() && email == assignee && assignee.isNotBlank() && assignee != myEmail) numbers[name] = wa
                    if (fallback.isBlank()) { fallback = wa; fallbackName = name }
                }
            }
            if (numbers.isEmpty() && wanted.isEmpty() && fallback.isNotBlank()) numbers[fallbackName] = fallback
            if (numbers.isEmpty()) {
                Toast.makeText(context, "No WhatsApp number saved for the selected member(s) - add it in Sub User Management", Toast.LENGTH_LONG).show()
                return@addOnSuccessListener
            }
            val due = task.dueDate ?: ""
            numbers.forEach { (name, wa) ->
                val msg = "⏰ Reminder (from AlignTasks):\n📋 \"" + task.description + "\"" +
                    (if (due.isNotBlank()) "\n🗓️ Due: " + due else "") +
                    "\n👤 For: " + name +
                    "\n\nPlease check and update the board when done."
                db.collection("alignWaQueue").add(
                    mapOf(
                        "target" to wa,
                        "message" to msg,
                        "taskId" to task.id,
                        "taskTitle" to task.description.take(80),
                        "toName" to name,
                        "status" to "pending",
                        "source" to "aligntasks-android",
                        "createdAt" to System.currentTimeMillis()
                    )
                ).addOnSuccessListener {
                    Toast.makeText(context, "✅ WhatsApp reminder queued for " + name, Toast.LENGTH_SHORT).show()
                }.addOnFailureListener { e ->
                    Toast.makeText(context, "❌ " + e.message, Toast.LENGTH_LONG).show()
                }
            }
        }
        .addOnFailureListener { e ->
            Toast.makeText(context, "❌ " + e.message, Toast.LENGTH_LONG).show()
        }
}

@Composable
fun ReminderTargetsDialog(
    task: Task,
    targets: List<String>,
    onDismiss: () -> Unit,
    onSend: (List<String>) -> Unit,
    onSendWhatsApp: ((List<String>) -> Unit)? = null
) {
    val uniqueTargets = remember(targets) { targets.map { it.trim().lowercase() }.filter { it.isNotBlank() }.distinct() }
    var allSelected by remember { mutableStateOf(false) }
    val selected = remember { mutableStateMapOf<String, Boolean>() }

    LaunchedEffect(uniqueTargets) {
        selected.clear()
        uniqueTargets.forEach { selected[it] = false }
        allSelected = false
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Remind Someone") },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text("Send reminder for: ${task.description}", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth().clickable {
                        allSelected = !allSelected
                        uniqueTargets.forEach { selected[it] = allSelected }
                    },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = allSelected,
                        onCheckedChange = { checked ->
                            allSelected = checked
                            uniqueTargets.forEach { selected[it] = checked }
                        }
                    )
                    Text("All")
                }

                Spacer(Modifier.height(6.dp))
                Column(modifier = Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState())) {
                    uniqueTargets.forEach { email ->
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable {
                                val next = !(selected[email] ?: false)
                                selected[email] = next
                                allSelected = uniqueTargets.all { selected[it] == true }
                            },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = selected[email] == true,
                                onCheckedChange = { checked ->
                                    selected[email] = checked
                                    allSelected = uniqueTargets.all { selected[it] == true }
                                }
                            )
                            Text(email.substringBefore('@'))
                            Spacer(Modifier.width(6.dp))
                            Text(email, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
                        }
                    }
                }
            }
        },
        confirmButton = {
            Row {
                if (onSendWhatsApp != null) {
                    TextButton(onClick = {
                        val selectedEmails = uniqueTargets.filter { selected[it] == true }
                        if (selectedEmails.isNotEmpty()) onSendWhatsApp.invoke(selectedEmails)
                    }) {
                        Text("📲 WhatsApp")
                    }
                }
                Button(onClick = {
                    val selectedEmails = uniqueTargets.filter { selected[it] == true }
                    if (selectedEmails.isNotEmpty()) onSend(selectedEmails)
                }) {
                    Text("Send")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

// The one-tap WhatsApp member picker: shows every team member with their WhatsApp number
// (like the webapp) and queues the reminder for the chosen member - no typos, no guessing.
// Queue a WhatsApp reminder for a GROUP (targetType=group) - the Railway server sends it in seconds.
fun sendAlignWhatsAppGroupReminder(context: android.content.Context, task: Task, groupName: String, groupJid: String) {
    if (!groupJid.endsWith("@g.us")) {
        Toast.makeText(context, "❌ Invalid group target", Toast.LENGTH_LONG).show()
        return
    }
    val db = FirebaseFirestore.getInstance()
    val due = task.dueDate ?: ""
    val msg = "⏰ Reminder (from AlignTasks):\n📋 \"" + task.description + "\"" +
        (if (due.isNotBlank()) "\n🗓️ Due: " + due else "") +
        "\n👥 Group reminder" +
        "\n\nPlease check and update the board when done."
    db.collection("alignWaQueue").add(
        mapOf(
            "target" to groupJid,
            "targetType" to "group",
            "message" to msg,
            "taskId" to task.id,
            "taskTitle" to task.description.take(80),
            "toName" to groupName.ifBlank { groupJid },
            "status" to "pending",
            "source" to "aligntasks-android",
            "createdAt" to System.currentTimeMillis()
        )
    ).addOnSuccessListener {
        Toast.makeText(context, "✅ Group reminder queued for " + groupName.ifBlank { groupJid }, Toast.LENGTH_SHORT).show()
    }.addOnFailureListener { e ->
        Toast.makeText(context, "❌ " + e.message, Toast.LENGTH_LONG).show()
    }
}

@Composable
fun WhatsAppTargetsDialog(task: Task, onDismiss: () -> Unit, onSend: (List<String>, List<Pair<String, String>>) -> Unit) {
    val context = LocalContext.current
    var loading by remember { mutableStateOf(true) }
    var members by remember { mutableStateOf(listOf<Triple<String, String, String>>()) }
    val selectedEmails = remember { mutableStateMapOf<String, Boolean>() }
    var groupsLoading by remember { mutableStateOf(true) }
    var favoriteGroups by remember { mutableStateOf(listOf<Pair<String, String>>()) } // name -> jid
    val selectedGroups = remember { mutableStateMapOf<String, Boolean>() }               // jid -> checked
    var showGroupManager by remember { mutableStateOf(false) }
    var groupQuery by remember { mutableStateOf("") }
    var allGroups by remember { mutableStateOf(listOf<Pair<String, String>>()) }
    val assigneeDefault = (task.assigneeEmail ?: "").lowercase()
    val myEmail = FirebaseAuth.getInstance().currentUser?.email?.lowercase() ?: ""

    fun loadFavorites() {
        FirebaseFirestore.getInstance().collection("alignWaGroupFavorites").limit(60).get()
            .addOnSuccessListener { snap ->
                favoriteGroups = snap.documents.mapNotNull { d ->
                    val v = d.data ?: return@mapNotNull null
                    val jid = (v["jid"] as? String) ?: d.id
                    val name = (v["name"] as? String) ?: jid
                    name to jid
                }
                groupsLoading = false
            }
            .addOnFailureListener { groupsLoading = false }
    }
    fun loadAllGroups() {
        FirebaseFirestore.getInstance().document("appData/alignWaGroupsIndex").get()
            .addOnSuccessListener { snap ->
                val v = snap.data ?: emptyMap()
                @Suppress("UNCHECKED_CAST")
                val list = (v["groups"] as? List<Map<String, Any>>) ?: emptyList()
                allGroups = list.mapNotNull { g ->
                    val jid = (g["jid"] as? String) ?: return@mapNotNull null
                    val name = (g["name"] as? String) ?: jid
                    name to jid
                }
            }
    }
    fun toggleFavorite(name: String, jid: String, saved: Boolean) {
        val ref = FirebaseFirestore.getInstance().collection("alignWaGroupFavorites").document(jid.replace("/", "_"))
        if (saved) ref.delete().addOnSuccessListener { loadFavorites() }
        else ref.set(mapOf("name" to name, "jid" to jid, "savedBy" to myEmail, "savedAt" to System.currentTimeMillis()))
            .addOnSuccessListener { loadFavorites() }
    }

    LaunchedEffect(task.id) {
        FirebaseFirestore.getInstance().collection("$REMINDER_BASE/staff").get()
            .addOnSuccessListener { snap ->
                val list = mutableListOf<Triple<String, String, String>>()
                snap.documents.forEach { d ->
                    val v = d.data ?: return@forEach
                    val email = ((v["email"] as? String) ?: "").lowercase()
                    if (email.isBlank()) return@forEach
                    val name = ((v["name"] as? String) ?: "").ifBlank { email.substringBefore('@') }
                    val wa = normalizeWaDigitsAndroid(v["whatsappNumber"] as? String)
                    list.add(Triple(email, name, wa))
                }
                members = list
                val preferred = list.firstOrNull { it.first == assigneeDefault && it.third.isNotBlank() }
                    ?: list.firstOrNull { it.third.isNotBlank() }
                if (preferred != null) selectedEmails[preferred.first] = true
                loading = false
            }
            .addOnFailureListener { e ->
                Toast.makeText(context, "❌ " + e.message, Toast.LENGTH_LONG).show()
                loading = false
            }
        loadFavorites()
        loadAllGroups()
    }

    val favIds = favoriteGroups.map { it.second }.toSet()
    val filteredAll = allGroups.filter { groupQuery.isBlank() || it.first.contains(groupQuery, ignoreCase = true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Send WhatsApp Reminder") },
        text = {
            Column(modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
                Text("\"${task.description.take(70)}\"", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(6.dp))
                Text("Team members (select one or more)", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                when {
                    loading -> Text("Loading team members…", style = MaterialTheme.typography.bodySmall)
                    members.isEmpty() -> Text("No team members found. Add them in Add Sub User.", style = MaterialTheme.typography.bodySmall)
                    else -> members.forEach { (email, name, wa) ->
                        val hasWa = wa.isNotBlank()
                        Row(
                            modifier = Modifier.fillMaxWidth()
                                .clickable(enabled = hasWa) { selectedEmails[email] = !(selectedEmails[email] ?: false) }
                                .padding(vertical = 1.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = selectedEmails[email] == true,
                                onCheckedChange = { c -> if (hasWa) selectedEmails[email] = c },
                                enabled = hasWa
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(name, style = MaterialTheme.typography.bodyMedium)
                            }
                            Text(
                                text = if (hasWa) "+$wa" else "no WhatsApp number",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (hasWa) androidx.compose.ui.graphics.Color(0xFF10B981) else MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("📢 WhatsApp groups (favorites)", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    TextButton(onClick = { showGroupManager = !showGroupManager }) { Text(if (showGroupManager) "Done" else "⭐ Manage", style = MaterialTheme.typography.labelMedium) }
                }
                when {
                    groupsLoading -> Text("Loading favorite groups…", style = MaterialTheme.typography.bodySmall)
                    favoriteGroups.isEmpty() -> Text("No favorite groups yet — tap ⭐ Manage to star the groups you use.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
                    else -> favoriteGroups.forEach { (name, jid) ->
                        Row(
                            modifier = Modifier.fillMaxWidth()
                                .clickable { selectedGroups[jid] = !(selectedGroups[jid] ?: false) }
                                .padding(vertical = 1.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(checked = selectedGroups[jid] == true, onCheckedChange = { c -> selectedGroups[jid] = c })
                            Text(name, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                if (showGroupManager) {
                    Spacer(Modifier.height(6.dp))
                    OutlinedTextField(
                        value = groupQuery,
                        onValueChange = { groupQuery = it },
                        label = { Text("Search all groups (" + allGroups.size + ")") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    if (allGroups.isEmpty()) {
                        Text("Groups list not ready yet — it updates automatically from the WhatsApp session.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
                    } else {
                        Column(modifier = Modifier.heightIn(max = 180.dp).verticalScroll(rememberScrollState())) {
                            filteredAll.take(150).forEach { (name, jid) ->
                                val saved = favIds.contains(jid)
                                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    IconButton(onClick = { toggleFavorite(name, jid, saved) }, modifier = Modifier.size(32.dp)) {
                                        Text(if (saved) "⭐" else "☆", style = MaterialTheme.typography.titleMedium)
                                    }
                                    Text(name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            val count = selectedEmails.count { it.value } + selectedGroups.count { it.value }
            Button(
                enabled = count > 0,
                onClick = {
                    val emails = members.map { it.first }.filter { selectedEmails[it] == true }
                    val groups = favoriteGroups.filter { selectedGroups[it.second] == true }
                    if (emails.isNotEmpty() || groups.isNotEmpty()) onSend(emails, groups)
                }
            ) { Text("💬 Send ($count)") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun IncomingReminderCallDialog(
    reminder: IncomingReminderCall,
    onConfirm: () -> Unit,
    onDecline: () -> Unit
) {
    Dialog(
        onDismissRequest = { },
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0D1B2A)),
            color = Color(0xFF0D1B2A)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 20.dp, vertical = 28.dp),
                verticalArrangement = Arrangement.SpaceBetween,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Reminder Call",
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = "${reminder.senderName.ifBlank { reminder.senderEmail.substringBefore('@') }} sent reminder call to finish this task",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = reminder.taskDescription.ifBlank { reminder.message },
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White.copy(alpha = 0.88f)
                    )
                }

                Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00A86B))
                    ) {
                        Text("Ok, we shall complete it soon")
                    }
                    Button(
                        onClick = onDecline,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB00020))
                    ) {
                        Text("Stop Incoming Reminder Call")
                    }
                }
            }
        }
    }
}

@Composable
fun ReminderRepliesDialog(
    task: Task,
    senderUid: String,
    onDismiss: () -> Unit
) {
    val responses = remember { mutableStateListOf<ReminderResponse>() }

    DisposableEffect(task.id, senderUid) {
        val db = Firebase.firestore
        val reg = db.collection(REMINDER_RESPONSE_COLLECTION)
            .whereEqualTo("senderUid", senderUid)
            .whereEqualTo("taskId", task.id)
            .addSnapshotListener { snap, _ ->
                val mapped = snap?.documents.orEmpty().map { doc ->
                    val createdAt = doc.getTimestamp("createdAt")
                    ReminderResponse(
                        id = doc.id,
                        responderName = (doc.getString("responderName") ?: "").ifBlank {
                            (doc.getString("responderEmail") ?: "").substringBefore('@')
                        },
                        responderEmail = doc.getString("responderEmail").orEmpty(),
                        status = doc.getString("status").orEmpty(),
                        createdAtMillis = createdAt?.toDate()?.time ?: 0L,
                        createdAtLabel = formatTimestamp(createdAt)
                    )
                }.sortedByDescending { it.createdAtMillis }

                responses.clear()
                responses.addAll(mapped)
            }
        onDispose { reg.remove() }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Reminder Replies") },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Task: ${task.description}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(0.7f)
                )
                Spacer(Modifier.height(8.dp))
                if (responses.isEmpty()) {
                    Text("No replies yet.")
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 260.dp)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        responses.forEach { response ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text(
                                        text = response.responderName.ifBlank { response.responderEmail },
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    if (response.responderEmail.isNotBlank()) {
                                        Text(
                                            text = response.responderEmail,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface.copy(0.7f)
                                        )
                                    }
                                    Text(
                                        text = if (response.status == "confirmed") "Confirmed" else "Cut/Dismissed",
                                        color = if (response.status == "confirmed") Color(0xFF0A8754) else MaterialTheme.colorScheme.error,
                                        fontWeight = FontWeight.Medium
                                    )
                                    if (response.createdAtLabel.isNotBlank()) {
                                        Text(
                                            text = response.createdAtLabel,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface.copy(0.65f)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) { Text("Close") }
        }
    )
}

@Composable
fun OutgoingReminderRingingDialog(
    reminderCallId: String,
    senderUid: String,
    taskDescription: String,
    expectedRecipients: List<String>,
    onStopRinging: () -> Unit
) {
    val responses = remember(reminderCallId, senderUid) { mutableStateListOf<ReminderResponse>() }

    DisposableEffect(reminderCallId, senderUid) {
        val db = Firebase.firestore
        val reg = db.collection(REMINDER_RESPONSE_COLLECTION)
            .whereEqualTo("senderUid", senderUid)
            .whereEqualTo("reminderCallId", reminderCallId)
            .addSnapshotListener { snap, _ ->
                val mapped = snap?.documents.orEmpty().map { doc ->
                    val createdAt = doc.getTimestamp("createdAt")
                    ReminderResponse(
                        id = doc.id,
                        responderName = (doc.getString("responderName") ?: "").ifBlank {
                            (doc.getString("responderEmail") ?: "").substringBefore('@')
                        },
                        responderEmail = doc.getString("responderEmail").orEmpty(),
                        status = doc.getString("status").orEmpty(),
                        createdAtMillis = createdAt?.toDate()?.time ?: 0L,
                        createdAtLabel = formatTimestamp(createdAt)
                    )
                }.sortedByDescending { it.createdAtMillis }

                responses.clear()
                responses.addAll(mapped)
            }
        onDispose { reg.remove() }
    }

    val normalizedExpected = remember(expectedRecipients) {
        expectedRecipients.map { it.trim().lowercase() }.filter { it.isNotBlank() }.distinct()
    }
    val responseEmails = responses.map { it.responderEmail.trim().lowercase() }.toSet()
    val pending = normalizedExpected.filter { it !in responseEmails }
    val confirmed = responses.filter { it.status == "confirmed" }
    val declined = responses.filter { it.status == "declined" }

    Dialog(
        onDismissRequest = { },
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = Color(0xFF1B263B)
        ) {
            Column(
                modifier = Modifier.fillMaxSize().padding(20.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Reminder Ringing", color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text(taskDescription, color = Color.White.copy(alpha = 0.92f), style = MaterialTheme.typography.titleMedium)
                    Text("Waiting: ${pending.size} | Confirmed: ${confirmed.size} | Cut: ${declined.size}", color = Color.White.copy(alpha = 0.88f))

                    if (pending.isNotEmpty()) {
                        Text("Still ringing for", color = Color(0xFFFFD166), fontWeight = FontWeight.SemiBold)
                        pending.take(8).forEach { email ->
                            Text("- ${email.substringBefore('@')}", color = Color.White)
                        }
                    }

                    if (confirmed.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text("Confirmed", color = Color(0xFF06D6A0), fontWeight = FontWeight.SemiBold)
                        confirmed.forEach { item ->
                            Text("- ${item.responderName.ifBlank { item.responderEmail.substringBefore('@') }}", color = Color.White)
                        }
                    }

                    if (declined.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text("Cut Reminder", color = Color(0xFFFF6B6B), fontWeight = FontWeight.SemiBold)
                        declined.forEach { item ->
                            Text("- ${item.responderName.ifBlank { item.responderEmail.substringBefore('@') }}", color = Color.White)
                        }
                    }
                }

                Button(
                    onClick = {
                        stopReminderCall(reminderCallId, senderUid, "")
                        ReminderTonePlayer.stop()
                        onStopRinging()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB00020))
                ) {
                    Text("Hangup Outgoing Reminder Call")
                }
            }
        }
    }
}

@Composable
fun CompletedToggle(doneTasks: List<Task>, taskType: String, projectId: String?,
                    user: FirebaseUser, isAdmin: Boolean, vm: AppViewModel,
                    onShowComments: (Task) -> Unit,
                    onEditTask: (Task, String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    TextButton(onClick = { expanded = !expanded }) {
        Text("${if (expanded) "Hide" else "Show"} ${doneTasks.size} Completed",
            style = MaterialTheme.typography.labelMedium)
    }
    if (expanded) {
        doneTasks.forEach { task ->
            TaskRow(task, taskType, projectId, user, isAdmin, vm, onShowComments, onEditTask)
        }
    }
}

@Composable
fun CommentsDialog(task: Task, taskType: String, projectId: String?,
                   currentUserEmail: String, vm: AppViewModel, onDismiss: () -> Unit) {
    var commentText by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Comments", style = MaterialTheme.typography.titleMedium) },
        text = {
            Column(modifier = Modifier.heightIn(max = 400.dp)) {
                Text(task.description, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                if (task.comments.isEmpty()) {
                    Text("No comments yet.", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(0.5f))
                } else {
                    Column(modifier = Modifier.verticalScroll(rememberScrollState()).weight(1f, fill = false)) {
                        task.comments.forEach { comment ->
                            val author = (comment["authorEmail"] as? String)?.substringBefore('@') ?: "?"
                            val text = comment["text"] as? String ?: ""
                            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small)
                                .padding(8.dp)) {
                                Text(author, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                Text(text, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(value = commentText, onValueChange = { commentText = it },
                        label = { Text("Add comment") }, modifier = Modifier.weight(1f), singleLine = true)
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = {
                        if (commentText.isNotBlank()) {
                            vm.addComment(task.id, taskType, projectId, commentText, currentUserEmail)
                            commentText = ""
                        }
                    }) { Text("Post") }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
fun EditTaskDialog(task: Task, taskType: String, projectId: String?, user: FirebaseUser,
                   isAdmin: Boolean, vm: AppViewModel, staff: List<Staff>, onDismiss: () -> Unit) {
    var description by remember(task.id) { mutableStateOf(task.description) }
    var date by remember(task.id) { mutableStateOf(splitDueDate(task.dueDate).first) }
    var time by remember(task.id) { mutableStateOf(splitDueDate(task.dueDate).second) }
    var allDay by remember(task.id) { mutableStateOf(task.allDay) }
    var repeatType by remember(task.id) { mutableStateOf(task.repeatType) }
    var repeatCountText by remember(task.id) { mutableStateOf(task.repeatRemaining?.toString() ?: "") }
    var alarmEnabled by remember(task.id) { mutableStateOf(task.alarmEnabled) }
    var notifyFiveMinutes by remember(task.id) { mutableStateOf(task.notifyFiveMinutesBefore) }
    var assigneeEmail by remember(task.id) { mutableStateOf(task.assigneeEmail) }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val defaultRingtone = remember { AppSettingsStore.getDefaultAlarmRingtone(context) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Task") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it; error = null },
                    label = { Text("Description") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
                Spacer(Modifier.height(8.dp))
                if (isAdmin && taskType != "tasks_for_all") {
                    MemberDropdown(
                        label = "Assign To",
                        selectedEmail = assigneeEmail,
                        users = (staff.map { it.email } + listOf(user.email ?: "")).filter { it.isNotBlank() }.distinct(),
                        onSelect = { assigneeEmail = it }
                    )
                    Spacer(Modifier.height(8.dp))
                }
                TaskScheduleFields(
                    date = date,
                    onDateChange = { date = it },
                    time = time,
                    onTimeChange = { time = it },
                    allDay = allDay,
                    onAllDayChange = { allDay = it },
                    repeatType = repeatType,
                    onRepeatTypeChange = { repeatType = it },
                    repeatCountText = repeatCountText,
                    onRepeatCountTextChange = { repeatCountText = it },
                    alarmEnabled = alarmEnabled,
                    onAlarmEnabledChange = { alarmEnabled = it },
                    notifyFiveMinutes = notifyFiveMinutes,
                    onNotifyFiveMinutesChange = { notifyFiveMinutes = it },
                    ringtoneLabel = (task.alarmRingtoneTitle ?: defaultRingtone.second)
                )
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val dueDate = buildDueDate(date, time, allDay)
                val repeatCount = repeatCountText.toIntOrNull()
                when {
                    description.isBlank() -> error = "Description is required"
                    date.isNotBlank() && dueDate == null -> error = "Use date as dd/MM/yyyy and time as HH:mm"
                    repeatType != "none" && repeatCountText.isNotBlank() && repeatCount == null ->
                        error = "Repeat count must be a number"
                    else -> {
                        vm.editTask(
                            taskId = task.id,
                            taskType = taskType,
                            projectId = projectId,
                            description = description,
                            dueDate = dueDate,
                            repeatType = repeatType,
                            repeatCount = repeatCount,
                            assigneeEmail = assigneeEmail.ifBlank { null },
                            allDay = allDay,
                            alarmEnabled = alarmEnabled,
                            notifyBeforeMinutes = if (alarmEnabled && notifyFiveMinutes) 5 else null,
                            alarmRingtoneUri = if (alarmEnabled) defaultRingtone.first else null,
                            alarmRingtoneTitle = if (alarmEnabled) defaultRingtone.second else null,
                            currentUserEmail = user.email ?: "",
                            isAdmin = isAdmin
                        )
                        onDismiss()
                    }
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun TaskDeletePasswordDialog(task: Task, taskType: String, projectId: String?,
                             vm: AppViewModel, onDismiss: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete Task") },
        text = {
            Column {
                Text("Enter admin password to delete this task.")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; error = null },
                    label = { Text("Admin Password") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation()
                )
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                vm.deleteTask(task.id, taskType, projectId, password) { err ->
                    error = err
                    if (err == null) onDismiss()
                }
            }) { Text("Delete") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

// ─── Auth ────────────────────────────────────────────────────────────────────

@Composable
fun AuthScreen(vm: AppViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isSignUp by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var showAdminSignupConfirm by remember { mutableStateOf(false) }
    val selfRegistrationAllowed by vm.selfRegistrationAllowed.collectAsState()
    val globalError by vm.errorMessage.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Default.Assignment, null, modifier = Modifier.size(48.dp).align(Alignment.CenterHorizontally),
            tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))
        Text("ALIGNTASK", style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally))
        Text(
            "v1.5",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        )
        Text(
            when {
                selfRegistrationAllowed == null -> "Checking workspace access..."
                isSignUp -> "You are creating a full new admin account"
                else -> "Sign in to manage your team"
            },
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(0.6f),
            modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(Modifier.height(24.dp))

        globalError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }

        OutlinedTextField(value = email, onValueChange = { email = it; errorMsg = null },
            label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = password, onValueChange = { password = it; errorMsg = null },
            label = { Text("Password") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
            visualTransformation = PasswordVisualTransformation())
        if (errorMsg != null) {
            Spacer(Modifier.height(8.dp))
            Text(errorMsg!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(16.dp))

        Button(onClick = {
            if (isSignUp) {
                showAdminSignupConfirm = true
            } else {
                vm.signIn(email, password) { err -> errorMsg = err }
            }
        }, modifier = Modifier.fillMaxWidth()) {
            Text(if (isSignUp) "Create Admin Account" else "Sign In")
        }

        TextButton(onClick = { isSignUp = !isSignUp; errorMsg = null }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (isSignUp) "Already have an account? Sign in" else "Don't have an account? Create one")
        }
    }

    if (showAdminSignupConfirm) {
        AlertDialog(
            onDismissRequest = { showAdminSignupConfirm = false },
            title = { Text("Create Admin Account") },
            text = { Text("You are about to create a new admin account. Only proceed if you are authorized to do so.") },
            confirmButton = {
                Button(onClick = {
                    vm.signUp(email, password) { err -> errorMsg = err }
                    showAdminSignupConfirm = false
                }) { Text("Create") }
            },
            dismissButton = {
                TextButton(onClick = { showAdminSignupConfirm = false }) { Text("Cancel") }
            }
        )
    }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

fun isOverdue(dueDate: String?): Boolean {
    if (dueDate.isNullOrEmpty()) return false
    return try {
        val due = parseDueDateToDate(dueDate) ?: return false
        due.before(Date())
    } catch (e: Exception) {
        false
    }
}

fun formatDueDate(dueDate: String?): String {
    if (dueDate.isNullOrEmpty()) return ""
    return try {
        val date = parseDueDateToDate(dueDate) ?: return dueDate
        val display = if (hasDueTime(dueDate)) {
            SimpleDateFormat("dd/MM/yyyy · hh:mm a", Locale.getDefault())
        } else {
            SimpleDateFormat("dd/MM/yyyy (Full day)", Locale.getDefault())
        }
        display.format(date)
    } catch (e: Exception) {
        dueDate
    }
}

fun parseDueDateToDate(value: String?): Date? {
    if (value.isNullOrBlank()) return null
    val formats = listOf("dd/MM/yyyy HH:mm", "dd/MM/yyyy", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd")
    for (pattern in formats) {
        val parsed = runCatching {
            SimpleDateFormat(pattern, Locale.getDefault()).parse(value.trim())
        }.getOrNull()
        if (parsed != null) return parsed
    }
    return null
}

fun hasDueTime(value: String?): Boolean {
    if (value.isNullOrBlank()) return false
    return value.contains(":")
}

fun buildReminderTargets(staff: List<Staff>, userEmail: String?): List<String> {
    val own = userEmail?.trim()?.lowercase().orEmpty()
    return (staff.map { it.email.trim().lowercase() } + listOf(own))
        .filter { it.isNotBlank() }
        .distinct()
}

object ReminderTonePlayer {
    private var activeRingtone: android.media.Ringtone? = null

    fun play(context: Context, uri: Uri?) {
        stop()
        activeRingtone = runCatching {
            RingtoneManager.getRingtone(context, uri ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
        }.getOrNull()
        runCatching { activeRingtone?.play() }
    }

    fun stop() {
        runCatching { activeRingtone?.stop() }
        activeRingtone = null
    }
}

fun createReminderNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
        REMINDER_CHANNEL_ID,
        "Task Reminder Calls",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "Ringtone and notification alerts for task reminders"
        lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
}

fun showTaskReminderNotification(context: Context, reminder: IncomingReminderCall) {
    if (!areReminderNotificationsAllowed(context)) return

    val launchIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(MainActivity.EXTRA_OPEN_PAGE, "tasksForAll")
    }
    val pendingIntent = PendingIntent.getActivity(
        context,
        reminder.notificationCode,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val stopIntent = Intent(context, ReminderActionReceiver::class.java).apply {
        action = ACTION_STOP_INCOMING_REMINDER
        putExtra(EXTRA_REMINDER_NOTIFICATION_ID, reminder.notificationId)
        putExtra(EXTRA_REMINDER_CALL_ID, reminder.reminderCallId)
        putExtra(EXTRA_RECIPIENT_UID, reminder.recipientUid)
    }
    val stopPendingIntent = PendingIntent.getBroadcast(
        context,
        reminder.notificationCode + 1000,
        stopIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, REMINDER_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(reminder.title)
        .setContentText(reminder.message)
        .setStyle(NotificationCompat.BigTextStyle().bigText(reminder.message))
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setOngoing(true)
        .setAutoCancel(false)
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Hangup", stopPendingIntent)
        .setContentIntent(pendingIntent)
        .setFullScreenIntent(pendingIntent, true)
        .build()

    NotificationManagerCompat.from(context).notify(INCOMING_REMINDER_NOTIFICATION_ID, notification)
}

fun areReminderNotificationsAllowed(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    } else {
        true
    }
}

fun playReminderRingtone(context: Context) {
    val (uriValue, _) = AppSettingsStore.getDefaultAlarmRingtone(context)
    val uri = runCatching { Uri.parse(uriValue) }.getOrNull()
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    ReminderTonePlayer.play(context, uri)
}

fun respondToReminderCall(
    context: Context,
    user: FirebaseUser,
    profile: UserProfile,
    reminder: IncomingReminderCall,
    status: String
) {
    ReminderTonePlayer.stop()
    val db = Firebase.firestore
    val reminderPath = "$REMINDER_BASE/users/${user.uid}/notifications"
    val now = FieldValue.serverTimestamp()
    val responseMessage = if (status == "confirmed") {
        "${profile.displayName} confirmed: we shall complete it soon."
    } else {
        "${profile.displayName} cut the reminder call."
    }

    db.collection(reminderPath).document(reminder.notificationId).update(
        mapOf(
            "handled" to true,
            "handledAt" to now,
            "responseStatus" to status,
            "responseMessage" to responseMessage,
            "responderEmail" to (user.email ?: ""),
            "responderName" to profile.displayName,
            "responseCreatedAt" to now
        )
    )

    db.collection(REMINDER_RESPONSE_COLLECTION)
        .add(
            mapOf(
                "reminderCallId" to reminder.reminderCallId,
                "notificationId" to reminder.notificationId,
                "taskId" to reminder.taskId,
                "taskDescription" to reminder.taskDescription,
                "taskType" to reminder.taskType,
                "projectId" to reminder.projectId,
                "senderUid" to reminder.senderUid,
                "senderEmail" to reminder.senderEmail,
                "responderUid" to user.uid,
                "responderEmail" to (user.email ?: ""),
                "responderName" to profile.displayName,
                "status" to status,
                "createdAt" to now
            )
        )

    NotificationManagerCompat.from(context).cancel(INCOMING_REMINDER_NOTIFICATION_ID)
}

fun stopReminderCall(reminderCallId: String, actorUid: String, actorEmail: String) {
    if (reminderCallId.isBlank() || actorUid.isBlank()) return
    val db = Firebase.firestore
    db.collection(REMINDER_CONTROL_COLLECTION)
        .document(reminderCallId)
        .set(
            mapOf(
                "reminderCallId" to reminderCallId,
                "stopped" to true,
                "stoppedAt" to FieldValue.serverTimestamp(),
                "stoppedByUid" to actorUid,
                "stoppedByEmail" to actorEmail.lowercase(),
                "lastUpdatedAt" to FieldValue.serverTimestamp()
            ),
            com.google.firebase.firestore.SetOptions.merge()
        )
}

fun rejectIncomingReminderCall(context: Context, recipientUid: String, notificationId: String) {
    if (recipientUid.isBlank() || notificationId.isBlank()) return
    ReminderTonePlayer.stop()
    NotificationManagerCompat.from(context).cancel(INCOMING_REMINDER_NOTIFICATION_ID)

    val db = Firebase.firestore
    db.collection("$REMINDER_BASE/users/$recipientUid/notifications")
        .document(notificationId)
        .update(
            mapOf(
                "handled" to true,
                "handledAt" to FieldValue.serverTimestamp(),
                "responseStatus" to "declined",
                "responseMessage" to "Rejected from reminder history",
                "responseCreatedAt" to FieldValue.serverTimestamp()
            )
        )
}

fun formatTimestamp(timestamp: Timestamp?): String {
    if (timestamp == null) return ""
    return runCatching {
        val date = timestamp.toDate()
        SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault()).format(date)
    }.getOrDefault("")
}

class ReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_STOP_INCOMING_REMINDER) return

        val notificationId = intent.getStringExtra(EXTRA_REMINDER_NOTIFICATION_ID).orEmpty()
        val reminderCallId = intent.getStringExtra(EXTRA_REMINDER_CALL_ID).orEmpty()
        val recipientUid = intent.getStringExtra(EXTRA_RECIPIENT_UID).orEmpty()
        if (notificationId.isBlank() || recipientUid.isBlank()) return

        ReminderTonePlayer.stop()
        NotificationManagerCompat.from(context).cancel(INCOMING_REMINDER_NOTIFICATION_ID)

        val db = Firebase.firestore
        val now = FieldValue.serverTimestamp()
        val reminderPath = "$REMINDER_BASE/users/$recipientUid/notifications"
        db.collection(reminderPath).document(notificationId).update(
            mapOf(
                "handled" to true,
                "handledAt" to now,
                "responseStatus" to "declined",
                "responseMessage" to "Rejected from notification hangup",
                "responseCreatedAt" to now
            )
        )

    }
}
