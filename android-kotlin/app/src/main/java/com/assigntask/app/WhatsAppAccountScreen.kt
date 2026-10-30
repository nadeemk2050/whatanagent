package com.assigntask.app

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * WHATSAPP NUMBER — link the signed-in account's own number by QR, then send reminders
 * through it. Mirrors the PWA panel (Menu → WhatsApp number): the connection lives on the
 * server, so closing the app or the phone does not unlink it.
 *
 * Send-only: contacts/groups plus outgoing reminder text. No chats, no AI, no inbox.
 */
@Composable
fun WhatsAppAccountScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var linked by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("idle") }
    var phone by remember { mutableStateOf("") }
    var cap by remember { mutableStateOf(4) }
    var qrImage by remember { mutableStateOf<ImageBitmap?>(null) }
    var groups by remember { mutableStateOf<List<WaTarget>>(emptyList()) }
    var selectedGroups by remember { mutableStateOf<Set<String>>(emptySet()) }
    var message by remember { mutableStateOf("Reminder from AlignTasks") }
    var directPhone by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    var lastError by remember { mutableStateOf("") }

    fun applyStatus(json: JSONObject) {
        linked = json.optBoolean("linked", linked)
        status = json.optString("status", status)
        phone = json.optString("phone", phone)
        cap = json.optInt("cap", cap)
        lastError = json.optString("lastSendError", lastError)
        val qr = json.optString("qr", "")
        qrImage = if (qr.isBlank()) null else decodeDataUrl(qr)
    }

    suspend fun loadStatus(): JSONObject? = withContext(Dispatchers.IO) {
        runCatching { AlignApi.waMultiStatus(ctx) }.getOrNull()
    }

    suspend fun loadGroups(refresh: Boolean) {
        withContext(Dispatchers.IO) { runCatching { AlignApi.waMultiGroups(ctx, refresh) } }
            .onSuccess { groups = it }
            .onFailure { note = "Could not load groups: ${it.message}" }
    }

    LaunchedEffect(Unit) {
        loadStatus()?.let { applyStatus(it) }
        if (linked) loadGroups(false)
    }

    // While a QR is on screen, follow the link until the phone scans it.
    LaunchedEffect(status) {
        if (status != "qr_ready") return@LaunchedEffect
        var tries = 0
        while (status == "qr_ready" && tries < 60) {
            delay(2500)
            tries++
            val s = loadStatus() ?: continue
            applyStatus(s)
            if (s.optString("status") == "connected") {
                note = "Connected${if (phone.isNotBlank()) " (+$phone)" else ""} — reminders now send from this number."
                loadGroups(true)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ats.bg)
            .verticalScroll(rememberScrollState())
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        AtsCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("My WhatsApp number", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Ats.ink)
                    val line = when {
                        status == "connected" -> "Connected${if (phone.isNotBlank()) " as +$phone" else ""}"
                        linked -> "Linked${if (phone.isNotBlank()) " as +$phone" else ""} — reconnects when needed"
                        status == "qr_ready" -> "Scan the QR code below"
                        else -> "No number linked yet ($cap slots on this server)"
                    }
                    Text(line, fontSize = 11.sp, color = Ats.inkSoft, modifier = Modifier.padding(top = 2.dp))
                }
                if (busy) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            }
            if (lastError.isNotBlank()) {
                Text("Last send error: $lastError", fontSize = 11.sp, color = Ats.danger, modifier = Modifier.padding(top = 6.dp))
            }
            Row(modifier = Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (status != "connected" && status != "qr_ready") {
                    Button(onClick = {
                        busy = true; note = null
                        scope.launch {
                            withContext(Dispatchers.IO) { runCatching { AlignApi.waMultiLink(ctx) } }
                                .onSuccess { applyStatus(it); note = "Scan the QR code with WhatsApp → Linked devices." }
                                .onFailure { note = it.message }
                            busy = false
                        }
                    }) { Text(if (linked) "Reconnect" else "Connect a number", fontSize = 12.sp) }
                }
                if (linked || status == "connected") {
                    OutlinedButton(onClick = {
                        busy = true
                        scope.launch {
                            withContext(Dispatchers.IO) { runCatching { AlignApi.waMultiUnlink(ctx) } }
                                .onSuccess { applyStatus(it); groups = emptyList(); selectedGroups = emptySet(); note = "Number unlinked." }
                                .onFailure { note = it.message }
                            busy = false
                        }
                    }) { Text("Unlink", fontSize = 12.sp, color = Ats.danger) }
                    OutlinedButton(onClick = {
                        busy = true
                        scope.launch { loadGroups(true); busy = false; note = "Groups refreshed." }
                    }) { Text("Refresh groups", fontSize = 12.sp) }
                }
            }
            note?.let { AtsNotice(it) }
        }

        qrImage?.let { img ->
            AtsCard {
                Text("WhatsApp → Settings → Linked devices → Link a device", fontSize = 11.sp, color = Ats.inkSoft)
                Image(
                    bitmap = img,
                    contentDescription = "WhatsApp QR code",
                    modifier = Modifier.fillMaxWidth().height(260.dp).padding(top = 8.dp)
                )
                Text("The code refreshes by itself. The link stays on the server until you unlink it.", fontSize = 10.sp, color = Ats.inkSoft)
            }
        }

        if (linked) {
            AtsCard {
                Text("Send a reminder from my number", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Ats.ink)
                OutlinedTextField(
                    value = message,
                    onValueChange = { message = it },
                    label = { Text("Message", fontSize = 11.sp) },
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
                )
                OutlinedTextField(
                    value = directPhone,
                    onValueChange = { directPhone = it },
                    label = { Text("Send to a phone number (optional, e.g. 971501234567)", fontSize = 11.sp) },
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
                )
                Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        selectedGroups.size.toString() + " group(s) selected",
                        fontSize = 11.sp, color = Ats.inkSoft, modifier = Modifier.weight(1f)
                    )
                    Button(onClick = {
                        val targets = JSONArray()
                        groups.filter { selectedGroups.contains(it.jid) }.forEach { g ->
                            targets.put(JSONObject().put("type", "group").put("id", g.jid).put("name", g.name))
                        }
                        val digits = directPhone.filter { it.isDigit() }
                        if (digits.isNotBlank()) {
                            targets.put(JSONObject().put("type", "contact").put("phone", digits).put("name", "+$digits"))
                        }
                        if (targets.length() == 0) { note = "Pick a group or type a phone number."; return@Button }
                        busy = true; note = null
                        scope.launch {
                            withContext(Dispatchers.IO) { runCatching { AlignApi.waMultiSend(ctx, message, targets) } }
                                .onSuccess { res ->
                                    val sent = res.optInt("sent", 0)
                                    val failed = res.optInt("failed", 0)
                                    note = "Sent: $sent" + if (failed > 0) " · failed: $failed" else ""
                                }
                                .onFailure { note = it.message }
                            busy = false
                        }
                    }) { Text("Send", fontSize = 12.sp) }
                }
            }

            AtsCard {
                Text("My groups (${groups.size})", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Ats.ink)
                if (groups.isEmpty()) {
                    Text("No groups loaded yet — press Refresh groups.", fontSize = 11.sp, color = Ats.inkSoft, modifier = Modifier.padding(top = 4.dp))
                }
                groups.take(200).forEach { g ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = selectedGroups.contains(g.jid),
                            onCheckedChange = { on ->
                                selectedGroups = if (on) selectedGroups + g.jid else selectedGroups - g.jid
                            }
                        )
                        Text(g.name, fontSize = 12.sp, color = Ats.ink)
                    }
                }
            }
        } else {
            AtsEmpty(
                "No WhatsApp number linked",
                "Link your own number once and AlignTasks will send your reminders from it — closing the app does not disconnect it."
            )
        }
    }
}

/** `data:image/png;base64,....` → ImageBitmap (null when it is not a decodable image). */
private fun decodeDataUrl(dataUrl: String): ImageBitmap? = runCatching {
    val comma = dataUrl.indexOf(',')
    val raw = if (comma >= 0) dataUrl.substring(comma + 1) else dataUrl
    val bytes = Base64.decode(raw, Base64.DEFAULT)
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
}.getOrNull()
