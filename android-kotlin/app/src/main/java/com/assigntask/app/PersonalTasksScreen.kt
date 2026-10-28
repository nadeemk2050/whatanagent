@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.assigntask.app


import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * MY PERSONAL TASKS — the PWA's strictly-private section.
 * Firestore: /artifacts/{appId}/public/data/users/{uid}/personal_tasks
 * Mirrors: personal-tasks-page (stats, category filter, search, add/edit sheet).
 */
@Composable
fun PersonalTasksScreen(uid: String, filter: TaskFilter, onFilter: (TaskFilter) -> Unit) {
    val ctx = LocalContext.current
    val db = remember { FirebaseFirestore.getInstance() }
    val scope = rememberCoroutineScope()
    val tasks = remember { mutableStateListOf<PersonalTask>() }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<PersonalTask?>(null) }
    var showForm by remember { mutableStateOf(false) }
    var category by remember { mutableStateOf("all") }
    var searchOpen by remember { mutableStateOf(filter.query.isNotBlank()) }

    val col = remember(uid) { db.collection("$BOARD_BASE_PATH/users/$uid/personal_tasks") }

    DisposableEffect(uid) {
        val reg = col.addSnapshotListener { snap, err ->
            loading = false
            if (err != null) { error = err.message; return@addSnapshotListener }
            error = null
            tasks.clear()
            snap?.documents?.forEach { d ->
                @Suppress("UNCHECKED_CAST")
                tasks.add(PersonalTask.from(d.id, (d.data ?: emptyMap<String, Any?>()) as Map<String, Any?>))
            }
            tasks.sortByDescending { it.createdAtMs }
        }
        onDispose { reg.remove() }
    }

    val stats = personalStats(tasks)
    val categories = remember(tasks.toList()) {
        listOf("all") + tasks.mapNotNull { it.category.takeIf { c -> c.isNotBlank() } }.distinct().sorted()
    }
    val shown = remember(tasks.toList(), filter.query, category) {
        tasks.filter { t ->
            (category == "all" || t.category.equals(category, true)) &&
                (filter.query.isBlank() || t.description.lowercase(Locale.US).contains(filter.query.lowercase(Locale.US)))
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Ats.bg)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp, 10.dp, 12.dp, 90.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    AtsStatChip("Total", stats.total)
                    AtsStatChip("To Do", stats.todo, Ats.charcoal)
                    AtsStatChip("Done", stats.done, Ats.ok)
                    AtsStatChip("Urgent", stats.urgent, Ats.warn)
                }
            }

            if (searchOpen) {
                item {
                    OutlinedTextField(
                        value = filter.query,
                        onValueChange = { onFilter(filter.copy(query = it)) },
                        placeholder = { Text("Search my tasks", fontSize = 13.sp) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            if (categories.size > 1) {
                item {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        categories.forEach { c ->
                            val on = c == category
                            Box(
                                modifier = Modifier
                                    .background(if (on) Ats.charcoal else Ats.card, RoundedCornerShape(50))
                                    .border(Ats.hairline, if (on) Ats.charcoal else Ats.line, RoundedCornerShape(50))
                                    .clickable { category = c }
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    if (c == "all") "All" else c,
                                    fontSize = 12.sp,
                                    color = if (on) Ats.card else Ats.inkSoft,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
            }

            if (error != null) item { AtsNotice("Could not load your private tasks: $error") }
            if (loading) item { Text("Loading…", color = Ats.inkSoft, fontSize = 12.sp, modifier = Modifier.padding(8.dp)) }
            if (!loading && shown.isEmpty()) item { AtsEmpty("Nothing here yet", "Tap + to add your first personal task.") }

            items(shown, key = { it.id }) { t ->
                PersonalTaskRow(
                    task = t,
                    onToggle = {
                        // personal_tasks are read-only for clients, so every write goes through
                        // /api/align/personal where the server stamps who did it.
                        scope.launch {
                            busy = true
                            withContext(Dispatchers.IO) {
                                runCatching {
                                    AlignApi.patchPersonalTask(
                                        ctx, t.id,
                                        JSONObject().put("status", if (t.isDone()) "To Do" else "Done")
                                    )
                                }.onFailure { error = it.message }
                            }
                            busy = false
                        }
                    },
                    onEdit = { editing = t; showForm = true },
                    onDelete = {
                        scope.launch {
                            busy = true
                            withContext(Dispatchers.IO) {
                                runCatching { AlignApi.deletePersonalTask(ctx, t.id) }
                                    .onFailure { error = it.message }
                            }
                            busy = false
                        }
                    }
                )
            }
        }

        ExtendedFloatingActionButton(
            onClick = { editing = null; showForm = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            containerColor = Ats.gold,
            contentColor = Ats.card,
            icon = { Icon(Icons.Default.Add, "Add personal task") },
            text = { Text("Personal task", fontWeight = FontWeight.Bold) }
        )
    }

    if (showForm) {
        PersonalTaskForm(
            existing = editing,
            onDismiss = { showForm = false },
            onSave = { values ->
                scope.launch {
                    busy = true
                    withContext(Dispatchers.IO) {
                        runCatching {
                            if (editing == null) {
                                AlignApi.addPersonalTask(
                                    ctx,
                                    JSONObject()
                                        .put("description", values.description)
                                        .put("category", values.category)
                                        .put("priority", values.priority)
                                        .put("dueDate", values.dueDate ?: "")
                                        .put("notes", values.notes)
                                        .put("repeat", values.repeat)
                                )
                            } else {
                                AlignApi.patchPersonalTask(
                                    ctx, editing!!.id,
                                    JSONObject()
                                        .put("description", values.description)
                                        .put("category", values.category)
                                        .put("priority", values.priority)
                                        .put("dueDate", values.dueDate ?: "")
                                        .put("notes", values.notes)
                                        .put("repeat", values.repeat)
                                )
                            }
                        }.onFailure { error = it.message }
                    }
                    busy = false
                    showForm = false
                }
            }
        )
    }
}

@Composable
private fun PersonalTaskRow(
    task: PersonalTask,
    onToggle: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val due = parseDueMs(task.dueDate)
    val overdue = !task.isDone() && due != null && due < System.currentTimeMillis()
    AtsCard(modifier = Modifier.combinedClickable(onClick = onEdit, onLongClick = onDelete)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .background(if (task.isDone()) Ats.ok else Ats.card, CircleShape)
                    .border(Ats.hairline, if (task.isDone()) Ats.ok else Ats.line, CircleShape)
                    .clickable { onToggle() },
                contentAlignment = Alignment.Center
            ) { if (task.isDone()) Icon(Icons.Default.Check, "Done", tint = Ats.card, modifier = Modifier.size(14.dp)) }

            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    task.description,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (task.isDone()) Ats.inkSoft else Ats.ink,
                    textDecoration = if (task.isDone()) TextDecoration.LineThrough else null
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 3.dp)) {
                    if (task.category.isNotBlank()) TagPill(task.category, Ats.inkSoft)
                    if (task.priority.isNotBlank()) TagPill(task.priority.uppercase(Locale.US), if (task.priority.equals("high", true)) Ats.danger else Ats.warn)
                    if (task.dueDate != null) TagPill(fmtDue(task.dueDate), if (overdue) Ats.danger else Ats.inkSoft)
                }
            }
        }
    }
}

@Composable
private fun TagPill(text: String, tint: androidx.compose.ui.graphics.Color) {
    Box(
        modifier = Modifier
            .background(Ats.bg2, RoundedCornerShape(50))
            .border(Ats.hairline, Ats.line, RoundedCornerShape(50))
            .padding(horizontal = 7.dp, vertical = 1.dp)
    ) { Text(text, fontSize = 9.5.sp, color = tint, fontWeight = FontWeight.Bold) }
}

fun fmtDue(raw: String?): String {
    val ms = parseDueMs(raw) ?: return raw.orEmpty()
    return SimpleDateFormat("d MMM, HH:mm", Locale.US).format(Date(ms))
}

private data class PersonalTaskValues(
    val description: String,
    val category: String,
    val priority: String,
    val dueDate: String?,
    val notes: String,
    val repeat: String
)

@Composable
private fun PersonalTaskForm(
    existing: PersonalTask?,
    onDismiss: () -> Unit,
    onSave: (PersonalTaskValues) -> Unit
) {
    val ctx = LocalContext.current
    var description by remember { mutableStateOf(existing?.description.orEmpty()) }
    var category by remember { mutableStateOf(existing?.category.orEmpty()) }
    var priority by remember { mutableStateOf((existing?.priority ?: "").ifBlank { "normal" }) }
    var due by remember { mutableStateOf(existing?.dueDate.orEmpty()) }
    var notes by remember { mutableStateOf(existing?.notes.orEmpty()) }
    var repeat by remember { mutableStateOf((existing?.repeat ?: "").ifBlank { "none" }) }

    AtsSheet(
        title = if (existing == null) "New personal task" else "Edit personal task",
        onDismiss = onDismiss,
        confirmLabel = if (existing == null) "Add" else "Save",
        onConfirm = {
            if (description.isNotBlank()) {
                onSave(PersonalTaskValues(description.trim(), category.trim(), priority, due.ifBlank { null }, notes.trim(), repeat))
            }
        }
    ) {
        OutlinedTextField(
            value = description, onValueChange = { description = it },
            label = { Text("Task") }, singleLine = false, modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = category, onValueChange = { category = it },
            label = { Text("Category (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(10.dp))
        Text("Priority", fontSize = 11.sp, color = Ats.inkSoft, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
            listOf("urgent", "high", "normal", "low").forEach { p ->
                val on = priority == p
                Box(
                    modifier = Modifier
                        .background(if (on) Ats.charcoal else Ats.bg2, RoundedCornerShape(50))
                        .border(Ats.hairline, if (on) Ats.charcoal else Ats.line, RoundedCornerShape(50))
                        .clickable { priority = p }
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) { Text(p.replaceFirstChar { it.uppercase() }, fontSize = 12.sp, color = if (on) Ats.card else Ats.inkSoft) }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = due, onValueChange = { due = it },
                label = { Text("Due (yyyy-MM-dd)") }, singleLine = true, modifier = Modifier.weight(1f)
            )
            TextButton(onClick = {
                val cal = Calendar.getInstance()
                DatePickerDialog(
                    ctx,
                    { _, y, m, d ->
                        due = String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d)
                    },
                    cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)
                ).show()
            }) { Text("Pick", color = Ats.gold, fontWeight = FontWeight.Bold) }
        }
        Spacer(Modifier.height(10.dp))
        Text("Repeat", fontSize = 11.sp, color = Ats.inkSoft, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
            listOf("none", "daily", "weekly", "monthly").forEach { r ->
                val on = repeat == r
                Box(
                    modifier = Modifier
                        .background(if (on) Ats.charcoal else Ats.bg2, RoundedCornerShape(50))
                        .border(Ats.hairline, if (on) Ats.charcoal else Ats.line, RoundedCornerShape(50))
                        .clickable { repeat = r }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) { Text(r, fontSize = 12.sp, color = if (on) Ats.card else Ats.inkSoft) }
            }
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = notes, onValueChange = { notes = it },
            label = { Text("Notes") }, modifier = Modifier.fillMaxWidth()
        )
    }
}
