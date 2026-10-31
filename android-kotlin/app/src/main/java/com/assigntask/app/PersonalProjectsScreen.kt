@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.assigntask.app


import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import com.google.firebase.firestore.FirebaseFirestore

/**
 * MY PERSONAL PROJECTS — private projects and their tasks.
 * Firestore: /users/{uid}/personal_projects/{pid}  and  .../{pid}/tasks/{id}
 * Mirrors: personal-projects-page, personal-project-modal, personal-project-task-modal.
 */
@Composable
fun PersonalProjectsScreen(uid: String) {
    val db = remember { FirebaseFirestore.getInstance() }
    val projects = remember { mutableStateListOf<PersonalProject>() }
    var openProject by remember { mutableStateOf<PersonalProject?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var taskCounts by remember { mutableStateOf<Map<String, Pair<Int, Int>>>(emptyMap()) }
    var editingProject by remember { mutableStateOf<PersonalProject?>(null) }
    var editName by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    val root = remember(uid) { db.collection("$BOARD_BASE_PATH/users/$uid/personal_projects") }

    DisposableEffect(uid) {
        val reg = root.addSnapshotListener { snap, _ ->
            projects.clear()
            snap?.documents?.forEach { d ->
                @Suppress("UNCHECKED_CAST")
                projects.add(PersonalProject.from(d.id, (d.data ?: emptyMap<String, Any?>()) as Map<String, Any?>))
            }
            projects.sortByDescending { it.createdAtMs }
        }
        onDispose { reg.remove() }
    }

    if (openProject != null) {
        PersonalProjectDetail(
            uid = uid,
            project = openProject!!,
            onBack = { openProject = null }
        )
        return
    }

    Box(modifier = Modifier.fillMaxSize().background(Ats.bg)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(12.dp, 10.dp, 12.dp, 90.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (projects.isEmpty()) {
                item { AtsEmpty("No personal projects", "Create one to keep private work off the team board.") }
            }
            items(projects, key = { it.id }) { p ->
                AtsCard(
                    modifier = Modifier.combinedClickable(
                        onClick = { openProject = p },
                        // Long press edits the project (rename / delete) — the same gesture as the web app.
                        onLongClick = { editingProject = p; editName = p.name }
                    )
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(p.name, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Ats.ink)
                            if (p.dueDate != null) {
                                Text("Due " + fmtDue(p.dueDate), fontSize = 11.sp, color = Ats.inkSoft, modifier = Modifier.padding(top = 2.dp))
                            }
                        }
                        Text("open →", fontSize = 12.sp, color = Ats.gold, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        ExtendedFloatingActionButton(
            onClick = { newName = ""; showAdd = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            containerColor = Ats.gold,
            contentColor = Ats.card,
            icon = { Icon(Icons.Default.Add, "Add project") },
            text = { Text("Project", fontWeight = FontWeight.Bold) }
        )
    }

    if (showAdd) {
        AtsSheet(
            title = "New personal project",
            onDismiss = { showAdd = false },
            confirmLabel = "Create",
            onConfirm = {
                if (newName.isNotBlank()) {
                    root.add(
                        mapOf(
                            "name" to newName.trim(),
                            "createdAt" to FieldValue.serverTimestamp(),
                            "ownerUid" to uid
                        )
                    )
                    showAdd = false
                }
            }
        ) {
            OutlinedTextField(
                value = newName, onValueChange = { newName = it },
                label = { Text("Project name") }, singleLine = true, modifier = Modifier.fillMaxWidth()
            )
        }
    }

    // Long press on a project -> edit it (rename or delete).
    editingProject?.let { proj ->
        AlertDialog(
            onDismissRequest = { editingProject = null },
            title = { Text("Edit personal project") },
            text = {
                OutlinedTextField(
                    value = editName,
                    onValueChange = { editName = it },
                    label = { Text("Project name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (editName.isNotBlank()) {
                        root.document(proj.id).update("name", editName.trim())
                        editingProject = null
                    }
                }) { Text("Save") }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = {
                        scope.launch {
                            runCatching {
                                val snap = root.document(proj.id).collection("tasks").get().await()
                                snap.documents.forEach { it.reference.delete().await() }
                                root.document(proj.id).delete().await()
                            }
                            editingProject = null
                        }
                    }) { Text("Delete", color = Color(0xFFB91C1C)) }
                    TextButton(onClick = { editingProject = null }) { Text("Cancel") }
                }
            }
        )
    }
}

@Composable
private fun PersonalProjectDetail(uid: String, project: PersonalProject, onBack: () -> Unit) {
    val db = remember { FirebaseFirestore.getInstance() }
    val tasks = remember { mutableStateListOf<PersonalProjectTask>() }
    var showAdd by remember { mutableStateOf(false) }
    var desc by remember { mutableStateOf("") }
    val col = remember(project.id) { db.collection("$BOARD_BASE_PATH/users/$uid/personal_projects/${project.id}/tasks") }

    DisposableEffect(project.id) {
        val reg = col.addSnapshotListener { snap, _ ->
            tasks.clear()
            snap?.documents?.forEach { d ->
                @Suppress("UNCHECKED_CAST")
                tasks.add(PersonalProjectTask.from(d.id, (d.data ?: emptyMap<String, Any?>()) as Map<String, Any?>))
            }
            tasks.sortByDescending { it.createdAtMs }
        }
        onDispose { reg.remove() }
    }

    val counts = projectCounts(tasks)

    Box(modifier = Modifier.fillMaxSize().background(Ats.bg)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(12.dp, 6.dp, 12.dp, 90.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Ats.ink) }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(project.name, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Ats.ink)
                        Text("${counts.first} of ${counts.second} done", fontSize = 11.sp, color = Ats.inkSoft)
                    }
                }
            }
            if (tasks.isEmpty()) item { AtsEmpty("No tasks yet", "Add the first task to this project.") }
            items(tasks, key = { it.id }) { t ->
                AtsCard(
                    modifier = Modifier.combinedClickable(
                        onClick = {},
                        onLongClick = { col.document(t.id).delete() }
                    )
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(22.dp)
                                .background(if (t.isDone()) Ats.ok else Ats.card, CircleShape)
                                .border(Ats.hairline, if (t.isDone()) Ats.ok else Ats.line, CircleShape)
                                .clickable {
                                    col.document(t.id).update("status", if (t.isDone()) "To Do" else "Done")
                                },
                            contentAlignment = Alignment.Center
                        ) { if (t.isDone()) Icon(Icons.Default.Check, "Done", tint = Ats.card, modifier = Modifier.size(14.dp)) }
                        Spacer(Modifier.width(10.dp))
                        Text(
                            t.description,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (t.isDone()) Ats.inkSoft else Ats.ink,
                            textDecoration = if (t.isDone()) TextDecoration.LineThrough else null,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
        ExtendedFloatingActionButton(
            onClick = { desc = ""; showAdd = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            containerColor = Ats.gold,
            contentColor = Ats.card,
            icon = { Icon(Icons.Default.Add, "Add task") },
            text = { Text("Task", fontWeight = FontWeight.Bold) }
        )
    }

    if (showAdd) {
        AtsSheet(
            title = "New task in " + project.name,
            onDismiss = { showAdd = false },
            confirmLabel = "Add",
            onConfirm = {
                if (desc.isNotBlank()) {
                    col.add(
                        mapOf(
                            "description" to desc.trim(),
                            "status" to "To Do",
                            "createdAt" to FieldValue.serverTimestamp()
                        )
                    )
                    showAdd = false
                }
            }
        ) {
            OutlinedTextField(
                value = desc, onValueChange = { desc = it },
                label = { Text("Task") }, modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
