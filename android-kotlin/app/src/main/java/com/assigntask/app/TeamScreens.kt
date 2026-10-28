@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.assigntask.app


import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Date

/**
 * TEAM SETTINGS — team identity, members, invite links and a full JSON export.
 * Replaces the old "open the browser" link, i.e. the PWA's Team Settings page.
 */
@Composable
fun TeamSettingsScreen(
    vm: AppViewModel,
    user: com.google.firebase.auth.FirebaseUser,
    profile: UserProfile
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val db = remember { FirebaseFirestore.getInstance() }
    val teamId = vm.activeTeamId.orEmpty()
    var teamName by remember { mutableStateOf("") }
    var teamDocRaw by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var invites by remember { mutableStateOf<List<TeamInvite>>(emptyList()) }
    var status by remember { mutableStateOf<String?>(null) }
    var inviteRole by remember { mutableStateOf("member") }
    var inviteMessage by remember { mutableStateOf("") }

    LaunchedEffect(teamId) {
        if (teamId.isBlank()) return@LaunchedEffect
        runCatching {
            val doc = db.collection("$BOARD_BASE_PATH/teams").document(teamId).get().await()
            @Suppress("UNCHECKED_CAST")
            val data = (doc.data ?: emptyMap<String, Any?>()) as Map<String, Any?>
            teamDocRaw = data
            teamName = (data["name"] as? String).orEmpty()
        }
        runCatching {
            val snap = db.collection("$BOARD_BASE_PATH/invites")
                .whereEqualTo("teamId", teamId).limit(50).get().await()
            invites = snap.documents.map {
                @Suppress("UNCHECKED_CAST")
                TeamInvite.from(it.id, (it.data ?: emptyMap<String, Any?>()) as Map<String, Any?>)
            }.sortedByDescending { it.createdAtMs }
        }
    }

    val staff by vm.staff.collectAsState()
    val activeInvites = invites.filter { !it.isRevoked }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Ats.bg),
        contentPadding = PaddingValues(12.dp, 10.dp, 12.dp, 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            AtsCard {
                Column {
                    Text("TEAM", fontSize = 10.sp, letterSpacing = 1.sp, color = Ats.inkSoft, fontWeight = FontWeight.Bold)
                    Text(teamName.ifBlank { "Unnamed team" }, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ats.ink)
                    Spacer(Modifier.height(6.dp))
                    Text("Team ID", fontSize = 10.sp, color = Ats.inkSoft, fontWeight = FontWeight.Bold)
                    Text(teamId.ifBlank { "—" }, fontSize = 11.5.sp, color = Ats.ink)
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = teamName, onValueChange = { teamName = it },
                        label = { Text("Team name") }, singleLine = true, modifier = Modifier.fillMaxWidth()
                    )
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = {
                            if (teamId.isBlank()) { status = "No team selected"; return@TextButton }
                            scope.launch {
                                status = runCatching {
                                    db.collection("$BOARD_BASE_PATH/teams").document(teamId)
                                        .set(mapOf("name" to teamName.trim(), "updatedAt" to FieldValue.serverTimestamp()), com.google.firebase.firestore.SetOptions.merge()).await()
                                    "Team name saved"
                                }.getOrElse { it.message ?: "Could not save" }
                            }
                        }) { Text("Save name", color = Ats.gold, fontWeight = FontWeight.Bold) }
                        TextButton(onClick = { shareTeamExport(ctx, user, profile, teamId, teamDocRaw, vm, invites) }) {
                            Text("Export JSON", color = Ats.gold, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        item {
            AtsCard {
                Column {
                    Text("INVITE LINKS", fontSize = 10.sp, letterSpacing = 1.sp, color = Ats.inkSoft, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("member", "admin").forEach { r ->
                            val on = inviteRole == r
                            Box(
                                modifier = Modifier
                                    .background(if (on) Ats.charcoal else Ats.bg2, RoundedCornerShape(50))
                                    .border(Ats.hairline, if (on) Ats.charcoal else Ats.line, RoundedCornerShape(50))
                                    .clickable { inviteRole = r }
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) { Text(r, fontSize = 12.sp, color = if (on) Ats.card else Ats.inkSoft, fontWeight = FontWeight.SemiBold) }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = inviteMessage, onValueChange = { inviteMessage = it },
                        label = { Text("Welcome message (optional)") }, modifier = Modifier.fillMaxWidth()
                    )
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = {
                            if (teamId.isBlank()) { status = "No team selected"; return@TextButton }
                            scope.launch {
                                status = runCatching {
                                    val code = makeInviteCode()
                                    val expires = Date(System.currentTimeMillis() + 7L * 24 * 60 * 60 * 1000)
                                    db.collection("$BOARD_BASE_PATH/invites").document(code).set(
                                        mapOf(
                                            "code" to code,
                                            "teamId" to teamId,
                                            "teamName" to teamName,
                                            "role" to inviteRole,
                                            "message" to inviteMessage.trim(),
                                            "status" to "active",
                                            "createdAt" to FieldValue.serverTimestamp(),
                                            "createdBy" to (user.email ?: ""),
                                            "expiresAt" to Timestamp(expires)
                                        )
                                    ).await()
                                    inviteMessage = ""
                                    "Invite $code created — share it with the new member"
                                }.getOrElse { it.message ?: "Could not create the invite" }
                            }
                        }) { Text("Create invite code", color = Ats.gold, fontWeight = FontWeight.Bold) }
                    }
                    if (activeInvites.isEmpty()) {
                        Text("No invite links yet.", fontSize = 12.sp, color = Ats.inkSoft, modifier = Modifier.padding(top = 4.dp))
                    }
                    activeInvites.forEach { inv ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(inv.code, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Ats.ink)
                                Text(
                                    inv.role + (if (inv.isExpired) " · expired" else " · active"),
                                    fontSize = 11.sp,
                                    color = if (inv.isExpired) Ats.warn else Ats.ok
                                )
                            }
                            TextButton(onClick = {
                                scope.launch {
                                    runCatching {
                                        db.collection("$BOARD_BASE_PATH/invites").document(inv.id)
                                            .update("status", "revoked", "revokedAt", FieldValue.serverTimestamp()).await()
                                    }
                                    invites = invites.map { if (it.id == inv.id) it.copy(status = "revoked") else it }
                                }
                            }) { Text("Revoke", color = Ats.danger, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                        }
                    }
                }
            }
        }

        item {
            AtsCard {
                Column {
                    Text("MEMBERS (${staff.size})", fontSize = 10.sp, letterSpacing = 1.sp, color = Ats.inkSoft, fontWeight = FontWeight.Bold)
                    staff.forEach { s ->
                        Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(s.name.ifBlank { s.email }, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = Ats.ink)
                                Text(s.email, fontSize = 11.sp, color = Ats.inkSoft)
                            }
                            if (s.whatsappNumber.isNotBlank()) {
                                Text("WhatsApp", fontSize = 10.sp, color = Ats.ok, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    if (staff.isEmpty()) Text("No members found.", fontSize = 12.sp, color = Ats.inkSoft)
                }
            }
        }

        if (status != null) {
            item { AtsNotice(status!!, onClose = { status = null }) }
        }
    }
}

private fun shareTeamExport(
    ctx: android.content.Context,
    user: com.google.firebase.auth.FirebaseUser,
    profile: UserProfile,
    teamId: String,
    teamDoc: Map<String, Any?>,
    vm: AppViewModel,
    invites: List<TeamInvite>
) {
    val root = JSONObject()
    root.put("exportedAt", System.currentTimeMillis())
    root.put("exportedBy", user.email ?: "")
    root.put("teamId", teamId)
    root.put("team", JSONObject(teamDoc.mapValues { it.value?.toString() ?: "" }))
    root.put("tasks", vm.tasks.value.size)
    root.put("tasksForAll", vm.tasksForAll.value.size)
    root.put("projects", vm.projects.value.size)
    root.put("members", vm.staff.value.joinToString(", ") { it.name.ifBlank { it.email } })
    root.put("activeInvites", invites.count { !it.isRevoked })
    val text = root.toString(2)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "AlignTasks team export")
        putExtra(Intent.EXTRA_TEXT, text)
    }
    ctx.startActivity(Intent.createChooser(send, "Share team export"))
}

/**
 * SCHEDULED REMINDERS — read/cancel the WhatsApp reminders queued from a task.
 * Firestore: top-level `alignWaSchedules` (exactly what the PWA reads).
 */
@Composable
fun ScheduledRemindersScreen() {
    val db = remember { FirebaseFirestore.getInstance() }
    val items = remember { mutableStateListOf<WaSchedule>() }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    DisposableEffect(Unit) {
        val reg = db.collection("alignWaSchedules").limit(60).addSnapshotListener { snap, err ->
            loading = false
            if (err != null) { error = err.message; return@addSnapshotListener }
            items.clear()
            snap?.documents?.forEach {
                @Suppress("UNCHECKED_CAST")
                items.add(WaSchedule.from(it.id, (it.data ?: emptyMap<String, Any?>()) as Map<String, Any?>))
            }
            val sorted = items.sortedByDescending { it.createdAtMs }
            items.clear(); items.addAll(sorted)
        }
        onDispose { reg.remove() }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Ats.bg),
        contentPadding = PaddingValues(12.dp, 10.dp, 12.dp, 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (loading) item { Text("Loading reminders…", fontSize = 12.sp, color = Ats.inkSoft) }
        if (error != null) item { AtsNotice("Could not load reminders: $error") }
        if (!loading && items.isEmpty()) {
            item { AtsEmpty("No scheduled reminders", "Open a task → Remind → schedule for later.") }
        }
        items(items, key = { it.id }) { s ->
            AtsCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            s.title.ifBlank { s.message.take(60) }.ifBlank { "WhatsApp reminder" },
                            fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Ats.ink
                        )
                        val who = s.groupName.ifBlank { s.phone.ifBlank { s.groupJid } }
                        Text(
                            listOf(who, s.repeat, s.whenText, s.status).filter { it.isNotBlank() }.joinToString(" · "),
                            fontSize = 11.sp, color = Ats.inkSoft, modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    if (!s.isCancelled) {
                        TextButton(onClick = {
                            scope.launch {
                                runCatching {
                                    db.collection("alignWaSchedules").document(s.id)
                                        .update("status", "cancelled", "cancelledAt", FieldValue.serverTimestamp()).await()
                                }
                            }
                        }) { Text("Cancel", color = Ats.danger, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                    } else {
                        Text("cancelled", fontSize = 10.sp, color = Ats.inkSoft)
                    }
                }
            }
        }
    }
}

/**
 * GROUP UPDATES — the switches the PWA writes to `appData/alignAnnounceConfig`.
 * Group list comes from the server (/api/align/wa/groups); a JID can also be typed by hand.
 */
@Composable
fun GroupUpdatesScreen() {
    val ctx = LocalContext.current
    val db = remember { FirebaseFirestore.getInstance() }
    val scope = rememberCoroutineScope()
    var config by remember { mutableStateOf(AnnounceConfig()) }
    var groups by remember { mutableStateOf<List<WaTarget>>(emptyList()) }
    var manualJid by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        runCatching {
            val doc = db.document("appData/alignAnnounceConfig").get().await()
            @Suppress("UNCHECKED_CAST")
            config = AnnounceConfig.from((doc.data ?: emptyMap<String, Any?>()) as Map<String, Any?>)
        }
        withContext(Dispatchers.IO) { runCatching { AlignApi.waGroups(ctx) } }
            .onSuccess { groups = it }
            .onFailure { status = "WhatsApp group list unavailable (${it.message}). You can paste the group JID below." }
        loading = false
    }

    Column(
        modifier = Modifier.fillMaxSize().background(Ats.bg).padding(12.dp)
    ) {
        AtsCard {
            Column {
                Text("WHATSAPP GROUP", fontSize = 10.sp, letterSpacing = 1.sp, color = Ats.inkSoft, fontWeight = FontWeight.Bold)
                Text(
                    config.groupName.ifBlank { config.groupJid.ifBlank { "No group chosen" } },
                    fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Ats.ink, modifier = Modifier.padding(top = 3.dp)
                )
                if (loading) Text("Loading groups…", fontSize = 11.sp, color = Ats.inkSoft)
                if (groups.isNotEmpty()) {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()).padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        groups.take(25).forEach { g ->
                            val on = config.groupJid == g.jid
                            Box(
                                modifier = Modifier
                                    .background(if (on) Ats.charcoal else Ats.bg2, RoundedCornerShape(50))
                                    .border(Ats.hairline, if (on) Ats.charcoal else Ats.line, RoundedCornerShape(50))
                                    .clickable { config = config.copy(groupJid = g.jid, groupName = g.name) }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) { Text(g.name.take(22), fontSize = 11.5.sp, color = if (on) Ats.card else Ats.inkSoft) }
                        }
                    }
                } else {
                    OutlinedTextField(
                        value = manualJid,
                        onValueChange = { manualJid = it; config = config.copy(groupJid = it, groupName = it) },
                        label = { Text("Group JID (…@g.us)") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        AtsCard {
            Column {
                SwitchRow("Instant update on task changes", config.instant) { config = config.copy(instant = it) }
                SwitchRow("Weekly summary", config.weekly) { config = config.copy(weekly = it) }
                if (config.weekly) {
                    Text("Send on day ${config.weeklyDay + 1}, hour ${config.weeklyHour}:00", fontSize = 11.sp, color = Ats.inkSoft, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = {
                scope.launch {
                    status = runCatching {
                        db.document("appData/alignAnnounceConfig").set(
                            mapOf(
                                "groupJid" to config.groupJid,
                                "groupName" to config.groupName,
                                "instantEnabled" to config.instant,
                                "weeklyEnabled" to config.weekly,
                                "weeklyDay" to config.weeklyDay,
                                "weeklyHour" to config.weeklyHour,
                                "updatedAt" to System.currentTimeMillis()
                            )
                        ).await()
                        "Group updates saved"
                    }.getOrElse { it.message ?: "Could not save" }
                }
            }) { Text("Save", color = Ats.gold, fontWeight = FontWeight.Bold) }
        }
        if (status != null) AtsNotice(status!!, onClose = { status = null })
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = 13.sp, color = Ats.ink, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
