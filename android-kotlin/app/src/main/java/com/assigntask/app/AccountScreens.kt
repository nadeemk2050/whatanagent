package com.assigntask.app

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/** One name+password team login, exactly as the web app's "Team logins" panel shows it. */
data class TeamLogin(
    val handle: String = "",
    val name: String = "",
    val role: String = "member",
    val hasPassword: Boolean = false,
    val active: Boolean = true
)

/** Thin wrapper over the server routes the web app already uses for profile + team logins. */
object AccountApi {
    fun fetchProfile(ctx: Context): JSONObject =
        TeamSession.get(ctx, "/profile").optJSONObject("profile") ?: JSONObject()

    fun saveProfile(ctx: Context, body: JSONObject) {
        TeamSession.patch(ctx, "/profile", body.toString())
    }

    fun fetchLogins(ctx: Context): List<TeamLogin> {
        val arr = TeamSession.get(ctx, "/team/staff").optJSONArray("staff") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            TeamLogin(
                handle = o.optString("handle"),
                name = o.optString("name"),
                role = o.optString("role", "member"),
                hasPassword = o.optBoolean("hasPassword", false),
                active = o.optBoolean("active", true)
            )
        }.filter { it.handle.isNotBlank() }
    }

    fun saveLogin(ctx: Context, handle: String, name: String, role: String, active: Boolean, password: String?) {
        val body = JSONObject()
            .put("handle", handle)
            .put("name", name)
            .put("role", role)
            .put("active", active)
        if (!password.isNullOrBlank()) body.put("password", password)
        TeamSession.post(ctx, "/team/staff", body.toString())
    }

    fun deleteLogin(ctx: Context, handle: String) {
        TeamSession.delete(ctx, "/team/staff/" + URLEncoder.encode(handle, "UTF-8"))
    }

    fun teamNames(profile: JSONObject): List<String> {
        val arr: JSONArray = profile.optJSONArray("teams") ?: return emptyList()
        val names = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            when (val item = arr.opt(i)) {
                is String -> if (item.isNotBlank()) names.add(item)
                is JSONObject -> item.optString("name").takeIf { it.isNotBlank() }?.let { names.add(it) }
            }
        }
        return names
    }
}

@Composable
private fun SectionCard(
    title: String,
    open: Boolean,
    onToggle: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().clickable { onToggle() }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(title, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Icon(if (open) Icons.Default.ExpandLess else Icons.Default.ExpandMore, if (open) "Collapse" else "Expand")
            }
            if (open) {
                HorizontalDivider()
                Column(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    content = content
                )
            }
        }
    }
}

@Composable
private fun LabeledField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    enabled: Boolean = true,
    placeholder: String = "",
    keyboard: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    password: Boolean = false
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(0.6f)
        )
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            enabled = enabled,
            placeholder = { Text(placeholder) },
            singleLine = singleLine,
            minLines = if (singleLine) 1 else 3,
            visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

/**
 * Profile screen shaped like the web app's profile sheet: avatar header, collapsible detail / teams /
 * team-logins sections, green save and red log out. Everything is saved through the same server API
 * the web app uses, so both stay in sync.
 */
@Composable
fun ProfileScreen(onClose: () -> Unit, onLogout: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var messageOk by remember { mutableStateOf(true) }

    var fullName by remember { mutableStateOf("") }
    var loginName by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("") }
    var jobTitle by remember { mutableStateOf("") }
    var department by remember { mutableStateOf("") }
    var whatsapp by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var timezone by remember { mutableStateOf("") }
    var avatarEmoji by remember { mutableStateOf("") }
    var bio by remember { mutableStateOf("") }
    var teams by remember { mutableStateOf<List<String>>(emptyList()) }

    var openDetails by remember { mutableStateOf(true) }
    var openTeams by remember { mutableStateOf(true) }
    var openLogins by remember { mutableStateOf(true) }

    var logins by remember { mutableStateOf<List<TeamLogin>>(emptyList()) }
    var loginError by remember { mutableStateOf<String?>(null) }
    var editingHandle by remember { mutableStateOf<String?>(null) }
    var editingName by remember { mutableStateOf("") }
    var passwordFor by remember { mutableStateOf<String?>(null) }
    var passwordValue by remember { mutableStateOf("") }
    var deletingHandle by remember { mutableStateOf<String?>(null) }
    var newName by remember { mutableStateOf("") }
    var newPass by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }

    fun reloadProfile() {
        scope.launch {
            loading = true
            error = null
            try {
                val p = withContext(Dispatchers.IO) { AccountApi.fetchProfile(context) }
                fullName = p.optString("name")
                loginName = p.optString("handle").ifBlank { p.optString("loginName") }
                role = p.optString("role", "member")
                jobTitle = p.optString("jobTitle")
                department = p.optString("department")
                whatsapp = p.optString("whatsapp")
                phone = p.optString("phone")
                timezone = p.optString("timezone")
                avatarEmoji = p.optString("avatarEmoji")
                bio = p.optString("bio")
                teams = AccountApi.teamNames(p)
            } catch (e: Exception) {
                error = e.message ?: "Could not load your profile"
            } finally {
                loading = false
            }
        }
    }

    fun reloadLogins() {
        scope.launch {
            loginError = null
            try {
                logins = withContext(Dispatchers.IO) { AccountApi.fetchLogins(context) }
            } catch (e: Exception) {
                loginError = e.message
            }
        }
    }

    LaunchedEffect(Unit) {
        reloadProfile()
        reloadLogins()
    }

    Column(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)
    ) {
        // Purple header, same information as the web app sheet.
        Surface(color = Color(0xFF4C1D95), contentColor = Color.White) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier.size(42.dp)
                        .background(Color.White.copy(alpha = 0.18f), RoundedCornerShape(50)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(if (avatarEmoji.isBlank()) "👤" else avatarEmoji)
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        fullName.ifBlank { loginName.ifBlank { "Profile" } },
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        (if (jobTitle.isBlank()) "" else jobTitle + " · ") + role.ifBlank { "member" },
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                TextButton(onClick = onClose) {
                    Icon(Icons.Default.Close, null, tint = Color.White)
                    Spacer(Modifier.width(4.dp))
                    Text("Close", color = Color.White)
                }
            }
        }

        Column(
            modifier = Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (loading) {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            if (error != null) {
                Text("❌ " + error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            if (message != null) {
                Text(
                    message!!,
                    color = if (messageOk) Color(0xFF15803D) else MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            SectionCard("Profile details", openDetails, { openDetails = !openDetails }) {
                LabeledField("Full name", fullName, { fullName = it })
                LabeledField("Login name (locked)", loginName, { }, enabled = false)
                LabeledField("Role (locked)", role, { }, enabled = false)
                LabeledField("Job title", jobTitle, { jobTitle = it }, placeholder = "e.g. Accounts Manager")
                LabeledField("Department", department, { department = it }, placeholder = "e.g. Finance")
                LabeledField("WhatsApp number", whatsapp, { whatsapp = it }, placeholder = "+971 50 123 4567", keyboard = KeyboardType.Phone)
                LabeledField("Phone", phone, { phone = it }, placeholder = "optional", keyboard = KeyboardType.Phone)
                LabeledField("Timezone", timezone, { timezone = it }, placeholder = "Asia/Dubai")
                LabeledField("Avatar", avatarEmoji, { avatarEmoji = it }, placeholder = "👑")
                LabeledField("About me", bio, { bio = it }, placeholder = "A short note shown on your profile", singleLine = false)
            }

            SectionCard("Teams", openTeams, { openTeams = !openTeams }) {
                if (teams.isEmpty()) {
                    Text("No team yet", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(0.6f))
                } else {
                    teams.forEach { name ->
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = RoundedCornerShape(50)
                        ) {
                            Text(
                                name,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                        }
                    }
                }
            }

            SectionCard("🔑 Team logins", openLogins, { openLogins = !openLogins }) {
                Text(
                    "Each person signs in with their name and this password — no email needed.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(0.65f)
                )
                if (loginError != null) {
                    Text("❌ " + loginError!!, color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall)
                }
                logins.forEach { login ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    (login.name.ifBlank { login.handle }) + (if (login.role == "owner") " 👑" else ""),
                                    fontWeight = FontWeight.SemiBold,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Text(
                                    "@" + login.handle + " · " + login.role + " · " +
                                        (if (login.hasPassword) "password set" else "no password") +
                                        (if (!login.active) " · disabled" else ""),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (login.hasPassword) Color(0xFF15803D) else Color(0xFFB45309)
                                )
                            }
                            TextButton(onClick = {
                                editingHandle = login.handle
                                editingName = login.name.ifBlank { login.handle }
                            }) { Text("✏️") }
                            TextButton(onClick = {
                                passwordFor = login.handle
                                passwordValue = ""
                            }) { Text("🔑") }
                            TextButton(onClick = {
                                scope.launch {
                                    messageOk = true
                                    try {
                                        withContext(Dispatchers.IO) {
                                            AccountApi.saveLogin(
                                                context, login.handle, login.name.ifBlank { login.handle },
                                                login.role, !login.active, null
                                            )
                                        }
                                        message = if (login.active) "⛔ ${login.handle} disabled" else "✅ ${login.handle} enabled"
                                        reloadLogins()
                                    } catch (e: Exception) {
                                        messageOk = false
                                        message = "❌ " + (e.message ?: "Failed")
                                    }
                                }
                            }) { Text(if (login.active) "⛔" else "✅") }
                            if (login.role != "owner") {
                                TextButton(onClick = { deletingHandle = login.handle }) {
                                    Text("🗑", color = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }

                HorizontalDivider()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    OutlinedTextField(
                        value = newName,
                        onValueChange = { newName = it },
                        placeholder = { Text("New member name") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = newPass,
                        onValueChange = { newPass = it },
                        placeholder = { Text("Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.weight(1f)
                    )
                    Button(onClick = {
                        scope.launch {
                            if (newName.isBlank() || newPass.length < 6) {
                                messageOk = false
                                message = "Enter a name and a password of at least 6 characters."
                                return@launch
                            }
                            messageOk = true
                            try {
                                withContext(Dispatchers.IO) {
                                    AccountApi.saveLogin(context, newName.trim(), newName.trim(), "member", true, newPass)
                                }
                                message = "✅ " + newName.trim() + " can now sign in."
                                newName = ""
                                newPass = ""
                                reloadLogins()
                            } catch (e: Exception) {
                                messageOk = false
                                message = "❌ " + (e.message ?: "Failed")
                            }
                        }
                    }) { Text("Add") }
                }
            }

            Spacer(Modifier.height(4.dp))

            Button(
                enabled = !saving,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                onClick = {
                    scope.launch {
                        saving = true
                        messageOk = true
                        try {
                            val body = JSONObject()
                                .put("name", fullName.trim())
                                .put("jobTitle", jobTitle.trim())
                                .put("department", department.trim())
                                .put("whatsapp", whatsapp.trim())
                                .put("phone", phone.trim())
                                .put("timezone", timezone.trim())
                                .put("avatarEmoji", avatarEmoji.trim())
                                .put("bio", bio.trim())
                            withContext(Dispatchers.IO) { AccountApi.saveProfile(context, body) }
                            message = "💾 Profile saved."
                            reloadProfile()
                        } catch (e: Exception) {
                            messageOk = false
                            message = "❌ " + (e.message ?: "Could not save")
                        } finally {
                            saving = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (saving) "Saving…" else "💾 Save profile") }

            Button(
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFEF2F2), contentColor = Color(0xFFB91C1C)),
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Log out") }

            Text(
                "Login name, role and teams are managed by the owner.  ·  ALIGNTASK v" +
                    BuildConfig.VERSION_NAME + " (build " + BuildConfig.VERSION_CODE + ")",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(0.55f),
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
            )
        }
    }

    // ---- small dialogs for the login actions ----
    if (editingHandle != null) {
        AlertDialog(
            onDismissRequest = { editingHandle = null },
            title = { Text("Edit name") },
            text = {
                OutlinedTextField(
                    value = editingName,
                    onValueChange = { editingName = it },
                    label = { Text("Name") },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val login = logins.firstOrNull { it.handle == editingHandle }
                    scope.launch {
                        messageOk = true
                        try {
                            withContext(Dispatchers.IO) {
                                AccountApi.saveLogin(
                                    context, editingHandle!!, editingName.trim(),
                                    login?.role ?: "member", login?.active ?: true, null
                                )
                            }
                            message = "✅ Name updated."
                            editingHandle = null
                            reloadLogins()
                        } catch (e: Exception) {
                            messageOk = false
                            message = "❌ " + (e.message ?: "Failed")
                        }
                    }
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { editingHandle = null }) { Text("Cancel") } }
        )
    }

    if (passwordFor != null) {
        AlertDialog(
            onDismissRequest = { passwordFor = null },
            title = { Text("Set password for " + passwordFor) },
            text = {
                OutlinedTextField(
                    value = passwordValue,
                    onValueChange = { passwordValue = it },
                    label = { Text("New password (min 6)") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation()
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (passwordValue.length < 6) {
                        messageOk = false
                        message = "Password must be at least 6 characters."
                    } else {
                        val handle = passwordFor!!
                        val login = logins.firstOrNull { it.handle == handle }
                        scope.launch {
                            messageOk = true
                            try {
                                withContext(Dispatchers.IO) {
                                    AccountApi.saveLogin(
                                        context, handle, login?.name?.ifBlank { handle } ?: handle,
                                        login?.role ?: "member", login?.active ?: true, passwordValue
                                    )
                                }
                                message = "✅ Password set for $handle."
                                passwordFor = null
                                reloadLogins()
                            } catch (e: Exception) {
                                messageOk = false
                                message = "❌ " + (e.message ?: "Failed")
                            }
                        }
                    }
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { passwordFor = null }) { Text("Cancel") } }
        )
    }

    if (deletingHandle != null) {
        AlertDialog(
            onDismissRequest = { deletingHandle = null },
            title = { Text("Remove login " + deletingHandle + "?") },
            text = { Text("Their tasks stay, but they will not be able to sign in.") },
            confirmButton = {
                TextButton(onClick = {
                    val handle = deletingHandle!!
                    scope.launch {
                        messageOk = true
                        try {
                            withContext(Dispatchers.IO) { AccountApi.deleteLogin(context, handle) }
                            message = "🗑 Login removed for $handle."
                            deletingHandle = null
                            reloadLogins()
                        } catch (e: Exception) {
                            messageOk = false
                            message = "❌ " + (e.message ?: "Failed")
                        }
                    }
                }) { Text("Remove") }
            },
            dismissButton = { TextButton(onClick = { deletingHandle = null }) { Text("Cancel") } }
        )
    }
}
