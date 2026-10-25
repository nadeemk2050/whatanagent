package com.assigntask.app

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import android.widget.Toast
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import org.json.JSONObject

/**
 * Optional AI brain on a task: a chosen AI agent chases the job on WhatsApp, confirms it and
 * reports. The configuration lives on the task (aiFollowUp); the chasing itself runs on the
 * server, so enabling it calls POST /api/align/task/ai through the team session.
 */
data class AiCfg(
    var enabled: Boolean = false,
    var agentId: String = "",
    var agentName: String = "",
    var targetType: String = "group",
    var targetJid: String = "",
    var targetName: String = "",
    var firstMessage: String = "Salam, reminder about: {task} — expected by {due}. Kindly confirm when done.",
    var waitMinutes: Int = 120,
    var retryAfterMinutes: Int = 240,
    var maxRetries: Int = 3,
    var confirmMode: String = "keywords",
    var confirmKeywords: String = "done, paid, received, sent, completed",
    var requireProof: Boolean = false,
    var onConfirm: String = "stop",
    var announceJid: String = "",
    var announceName: String = "",
    var activeFrom: Int = 8,
    var activeTo: Int = 21,
    var honorPromise: Boolean = true,
    var notifyBoss: Boolean = true
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("enabled", enabled)
        put("agentId", agentId)
        put("agentName", agentName)
        put("targetType", targetType)
        put("targetJid", targetJid)
        put("targetName", targetName)
        put("firstMessage", firstMessage)
        put("waitMinutes", waitMinutes)
        put("retryAfterMinutes", retryAfterMinutes)
        put("maxRetries", maxRetries)
        put("confirmMode", confirmMode)
        put("confirmKeywords", confirmKeywords)
        put("requireProof", requireProof)
        put("onConfirm", onConfirm)
        put("announceJid", announceJid)
        put("announceName", announceName)
        put("activeFrom", activeFrom)
        put("activeTo", activeTo)
        put("honorPromise", honorPromise)
        put("notifyBoss", notifyBoss)
    }

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromMap(m: Map<String, Any>?): AiCfg {
            if (m == null) return AiCfg()
            fun s(k: String, d: String = "") = (m[k] as? String) ?: d
            fun i(k: String, d: Int) = (m[k] as? Long)?.toInt() ?: (m[k] as? Int) ?: d
            fun b(k: String, d: Boolean) = (m[k] as? Boolean) ?: d
            return AiCfg(
                enabled = b("enabled", false),
                agentId = s("agentId"), agentName = s("agentName"),
                targetType = s("targetType", "group"), targetJid = s("targetJid"), targetName = s("targetName"),
                firstMessage = s("firstMessage", "Salam, reminder about: {task} — expected by {due}. Kindly confirm when done."),
                waitMinutes = i("waitMinutes", 120), retryAfterMinutes = i("retryAfterMinutes", 240),
                maxRetries = i("maxRetries", 3),
                confirmMode = s("confirmMode", "keywords"),
                confirmKeywords = s("confirmKeywords", "done, paid, received, sent, completed"),
                requireProof = b("requireProof", false),
                onConfirm = s("onConfirm", "stop"),
                announceJid = s("announceJid"), announceName = s("announceName"),
                activeFrom = i("activeFrom", 8), activeTo = i("activeTo", 21),
                honorPromise = b("honorPromise", true), notifyBoss = b("notifyBoss", true)
            )
        }
    }
}

object AiFollowUp {
    /** Enable / disable / update the AI chaser for a task (server keeps the chaser in sync). */
    fun save(ctx: Context, taskId: String, kind: String, cfg: AiCfg, onDone: (String?) -> Unit = {}) {
        if (taskId.isBlank()) { onDone("Task id missing"); return }
        if (!TeamSession.isSignedIn(ctx)) { onDone("Team sign-in expired — sign in again"); return }
        kotlin.concurrent.thread {
            try {
                val body = JSONObject().put("id", taskId).put("kind", kind).put("aiFollowUp", cfg.toJson()).toString()
                TeamSession.post(ctx, "/task/ai", body)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    Toast.makeText(ctx, if (cfg.enabled) "🤖 AI follow-up is on" else "AI follow-up removed", Toast.LENGTH_SHORT).show()
                    onDone(null)
                }
            } catch (e: Exception) {
                val msg = e.message ?: "Could not save the AI follow-up"
                android.os.Handler(android.os.Looper.getMainLooper()).post { onDone(msg) }
            }
        }
    }
}

private data class AiTarget(val name: String, val jid: String, val phone: String)

/** Compact AI-brain editor: agent, target, routine, confirmation and post-confirmation action. */
@Composable
fun AiFollowUpSection(cfgState: MutableState<AiCfg>, onError: (String?) -> Unit = {}) {
    val cfg = cfgState.value
    val ctx = androidx.compose.ui.platform.LocalContext.current
    var agents by remember { mutableStateOf(listOf<Pair<String, String>>()) }   // id -> label
    var groups by remember { mutableStateOf(listOf<AiTarget>()) }
    var contacts by remember { mutableStateOf(listOf<AiTarget>()) }
    var loaded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (loaded) return@LaunchedEffect
        loaded = true
        // WhatsApp groups + contacts come from the shared index (no session needed)
        Firebase.firestore.document("appData/alignWaGroupsIndex").get()
            .addOnSuccessListener { snap ->
                @Suppress("UNCHECKED_CAST")
                val g = (snap.data?.get("groups") as? List<*>) ?: emptyList<Any?>()
                @Suppress("UNCHECKED_CAST")
                val c = (snap.data?.get("contacts") as? List<*>) ?: emptyList<Any?>()
                groups = g.mapNotNull { it as? Map<*, *> }.mapNotNull { m ->
                    val jid = m["jid"] as? String ?: return@mapNotNull null
                    AiTarget((m["name"] as? String) ?: jid, jid, "")
                }
                contacts = c.mapNotNull { it as? Map<*, *> }.mapNotNull { m ->
                    val name = m["name"] as? String ?: return@mapNotNull null
                    AiTarget(name, (m["jid"] as? String) ?: "", (m["phone"] as? String) ?: "")
                }
            }
        // Agents need the team session
        kotlin.concurrent.thread {
            try {
                val res = TeamSession.get(ctx, "/ai/agents")
                val arr = res.optJSONArray("agents")
                val list = ArrayList<Pair<String, String>>()
                if (arr != null) for (i in 0 until arr.length()) {
                    val a = arr.optJSONObject(i) ?: continue
                    list.add((a.optString("id")) to (a.optString("name") + " · " + a.optString("status")))
                }
                android.os.Handler(android.os.Looper.getMainLooper()).post { agents = list }
            } catch (e: Exception) { /* keep the default option */ }
        }
    }

    fun update(block: (AiCfg) -> AiCfg) { cfgState.value = block(cfgState.value) }
    val fieldMod = Modifier.fillMaxWidth()

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable {
                update { it.copy(enabled = !it.enabled) }
                if (!cfg.enabled) onError(null)
            },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(checked = cfg.enabled, onCheckedChange = { v -> update { it.copy(enabled = v) } })
            Text("🤖 Let an AI staff member follow this up on WhatsApp", style = MaterialTheme.typography.bodySmall)
        }
        if (!cfg.enabled) return@Column

        Spacer(Modifier.height(6.dp))
        // Agent
        Text("AI staff agent", style = MaterialTheme.typography.labelSmall)
        var agentExpanded by remember { mutableStateOf(false) }
        Box {
            OutlinedButton(onClick = { agentExpanded = true }, modifier = fieldMod) {
                Text(cfg.agentName.ifBlank { "Default AI" }, maxLines = 1)
            }
            DropdownMenu(expanded = agentExpanded, onDismissRequest = { agentExpanded = false }) {
                DropdownMenuItem(text = { Text("Default AI") }, onClick = {
                    update { it.copy(agentId = "", agentName = "") }; agentExpanded = false
                })
                agents.forEach { (id, label) ->
                    DropdownMenuItem(text = { Text(label) }, onClick = {
                        update { it.copy(agentId = id, agentName = label.substringBefore(" ·")) }
                        agentExpanded = false
                    })
                }
            }
        }

        Spacer(Modifier.height(6.dp))
        // Target type
        Row(verticalAlignment = Alignment.CenterVertically) {
            listOf("group" to "📢 Group", "contact" to "👤 Contact", "number" to "📱 Number").forEach { (key, label) ->
                FilterChip(
                    selected = cfg.targetType == key,
                    onClick = { update { it.copy(targetType = key, targetJid = "", targetName = "") } },
                    label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                    modifier = Modifier.padding(end = 4.dp)
                )
            }
        }

        Spacer(Modifier.height(4.dp))
        when (cfg.targetType) {
            "number" -> OutlinedTextField(
                value = cfg.targetName,
                onValueChange = { v -> update { it.copy(targetName = v, targetJid = v.filter { ch -> ch.isDigit() }) } },
                label = { Text("WhatsApp number (+971…)") }, singleLine = true, modifier = fieldMod
            )
            else -> {
                val list = if (cfg.targetType == "group") groups else contacts
                var expanded by remember(cfg.targetType) { mutableStateOf(false) }
                Box {
                    OutlinedButton(onClick = { expanded = true }, modifier = fieldMod) {
                        Text(cfg.targetName.ifBlank { if (cfg.targetType == "group") "Pick a group" else "Pick a contact" }, maxLines = 1)
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        list.take(200).forEach { t ->
                            DropdownMenuItem(text = { Text(t.name, maxLines = 1) }, onClick = {
                                update { it.copy(targetName = t.name, targetJid = t.phone.ifBlank { t.jid }) }
                                expanded = false
                            })
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = cfg.firstMessage,
            onValueChange = { v -> update { it.copy(firstMessage = v) } },
            label = { Text("First message (AI writes the rest)") },
            modifier = fieldMod, maxLines = 3
        )

        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(
                value = cfg.waitMinutes.toString(),
                onValueChange = { v -> update { it.copy(waitMinutes = v.filter { c -> c.isDigit() }.toIntOrNull() ?: 120) } },
                label = { Text("Wait min", style = MaterialTheme.typography.labelSmall) },
                singleLine = true, modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = cfg.retryAfterMinutes.toString(),
                onValueChange = { v -> update { it.copy(retryAfterMinutes = v.filter { c -> c.isDigit() }.toIntOrNull() ?: 240) } },
                label = { Text("Retry min", style = MaterialTheme.typography.labelSmall) },
                singleLine = true, modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = cfg.maxRetries.toString(),
                onValueChange = { v -> update { it.copy(maxRetries = v.filter { c -> c.isDigit() }.toIntOrNull() ?: 3) } },
                label = { Text("Tries", style = MaterialTheme.typography.labelSmall) },
                singleLine = true, modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(6.dp))
        Text("Counts as done when", style = MaterialTheme.typography.labelSmall)
        Row {
            listOf("keywords" to "Words", "ai" to "AI reads", "proof" to "Proof").forEach { (key, label) ->
                FilterChip(
                    selected = cfg.confirmMode == key,
                    onClick = { update { it.copy(confirmMode = key) } },
                    label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                    modifier = Modifier.padding(end = 4.dp)
                )
            }
        }
        if (cfg.confirmMode == "keywords") {
            OutlinedTextField(
                value = cfg.confirmKeywords,
                onValueChange = { v -> update { it.copy(confirmKeywords = v) } },
                label = { Text("Confirm words") }, singleLine = true, modifier = fieldMod
            )
        }

        Spacer(Modifier.height(6.dp))
        Text("Then do", style = MaterialTheme.typography.labelSmall)
        Row {
            listOf("stop" to "Stop", "mark_done" to "Mark done", "announce" to "Announce").forEach { (key, label) ->
                FilterChip(
                    selected = cfg.onConfirm == key,
                    onClick = { update { it.copy(onConfirm = key) } },
                    label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                    modifier = Modifier.padding(end = 4.dp)
                )
            }
        }
        if (cfg.onConfirm == "announce") {
            var exp by remember { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { exp = true }, modifier = fieldMod) {
                    Text(cfg.announceName.ifBlank { "Pick the announcement group" }, maxLines = 1)
                }
                DropdownMenu(expanded = exp, onDismissRequest = { exp = false }) {
                    groups.take(200).forEach { g ->
                        DropdownMenuItem(text = { Text(g.name, maxLines = 1) }, onClick = {
                            update { it.copy(announceJid = g.jid, announceName = g.name) }
                            exp = false
                        })
                    }
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = cfg.activeFrom.toString(),
                onValueChange = { v -> update { it.copy(activeFrom = v.filter { c -> c.isDigit() }.toIntOrNull() ?: 8) } },
                label = { Text("From h", style = MaterialTheme.typography.labelSmall) },
                singleLine = true, modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(6.dp))
            OutlinedTextField(
                value = cfg.activeTo.toString(),
                onValueChange = { v -> update { it.copy(activeTo = v.filter { c -> c.isDigit() }.toIntOrNull() ?: 21) } },
                label = { Text("To h", style = MaterialTheme.typography.labelSmall) },
                singleLine = true, modifier = Modifier.weight(1f)
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = cfg.requireProof, onCheckedChange = { v -> update { it.copy(requireProof = v) } })
            Text("Need proof (photo/doc)", style = MaterialTheme.typography.labelSmall)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = cfg.honorPromise, onCheckedChange = { v -> update { it.copy(honorPromise = v) } })
            Text("Come back at a promised time", style = MaterialTheme.typography.labelSmall)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = cfg.notifyBoss, onCheckedChange = { v -> update { it.copy(notifyBoss = v) } })
            Text("Report every reply to me", style = MaterialTheme.typography.labelSmall)
        }
        if (cfg.enabled && cfg.targetJid.isBlank() && cfg.targetType != "number") {
            Text(
                "Pick the WhatsApp person or group the AI should talk to.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error
            )
        }
    }
}
