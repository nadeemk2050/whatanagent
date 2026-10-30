package com.assigntask.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Typed wrapper over the `/api/align` routes.
 *
 * The phone used to write the board straight into Firestore, which skips the server's stamps,
 * permissions and audit trail. Everything here goes through the same server the browser uses, so
 * "who did what" is identical on both. Blocking calls — invoke them from a coroutine on IO.
 */
object AlignApi {

    // ---- auth ------------------------------------------------------------
    fun login(ctx: Context, name: String, password: String): Pair<String, String> =
        TeamSession.login(ctx, name, password)

    fun me(ctx: Context): JSONObject = TeamSession.get(ctx, "/staff/me")
    fun status(ctx: Context): JSONObject = TeamSession.get(ctx, "/status")
    fun profile(ctx: Context): JSONObject = TeamSession.get(ctx, "/profile")
    fun saveProfile(ctx: Context, patch: JSONObject): JSONObject = TeamSession.patch(ctx, "/profile", patch.toString())

    // ---- team ------------------------------------------------------------
    fun teams(ctx: Context): JSONObject = TeamSession.get(ctx, "/teams")
    fun teamStatus(ctx: Context): JSONObject = TeamSession.get(ctx, "/team/status")
    fun unlockTeam(ctx: Context, password: String): JSONObject =
        TeamSession.post(ctx, "/team/unlock", JSONObject().put("password", password).toString())

    fun teamStaff(ctx: Context): JSONObject = TeamSession.get(ctx, "/team/staff")

    fun addTeamStaff(ctx: Context, name: String, email: String, password: String, whatsapp: String, role: String): JSONObject =
        TeamSession.post(
            ctx, "/team/staff",
            JSONObject()
                .put("name", name).put("email", email).put("password", password)
                .put("whatsapp", whatsapp).put("role", role)
                .toString()
        )

    fun editTeamStaff(ctx: Context, handle: String, patch: JSONObject): JSONObject =
        TeamSession.post(ctx, "/team/staff/edit", patch.put("handle", handle).toString())

    fun removeTeamStaff(ctx: Context, handle: String): JSONObject =
        TeamSession.delete(ctx, "/team/staff/" + encode(handle))

    fun revealTeamStaffPassword(ctx: Context, handle: String): JSONObject =
        TeamSession.post(ctx, "/team/staff/reveal", JSONObject().put("handle", handle).toString())

    // ---- tasks -----------------------------------------------------------
    fun tasks(ctx: Context): JSONObject = TeamSession.get(ctx, "/tasks")

    fun createTask(ctx: Context, body: JSONObject): JSONObject = TeamSession.post(ctx, "/task/create", body.toString())
    fun updateTask(ctx: Context, body: JSONObject): JSONObject = TeamSession.post(ctx, "/task/update", body.toString())
    fun commentTask(ctx: Context, body: JSONObject): JSONObject = TeamSession.post(ctx, "/task/comment", body.toString())
    fun deleteTask(ctx: Context, body: JSONObject): JSONObject = TeamSession.post(ctx, "/task/delete", body.toString())
    fun taskEvents(ctx: Context): JSONObject = TeamSession.get(ctx, "/task/events")

    // ---- personal tasks --------------------------------------------------
    fun personalTasks(ctx: Context): List<PersonalTask> =
        list(TeamSession.get(ctx, "/personal"), "tasks").map { PersonalTask.from(it.str("id"), it.toMap()) }

    fun addPersonalTask(ctx: Context, body: JSONObject): JSONObject = TeamSession.post(ctx, "/personal", body.toString())
    fun patchPersonalTask(ctx: Context, id: String, body: JSONObject): JSONObject =
        TeamSession.patch(ctx, "/personal/" + encode(id), body.toString())
    fun deletePersonalTask(ctx: Context, id: String): JSONObject =
        TeamSession.delete(ctx, "/personal/" + encode(id))

    // ---- whatsapp --------------------------------------------------------
    fun waStatus(ctx: Context): JSONObject = TeamSession.get(ctx, "/wa/status")
    fun waGroups(ctx: Context): List<WaTarget> =
        list(TeamSession.get(ctx, "/wa/groups"), "groups").map {
            WaTarget(jid = it.str("jid"), name = it.str("name").ifBlank { it.str("subject") }, isGroup = true)
        }

    fun waContacts(ctx: Context): List<WaTarget> =
        list(TeamSession.get(ctx, "/wa/contacts"), "contacts").map {
            WaTarget(jid = it.str("jid"), name = it.str("name").ifBlank { it.str("phone") }, isGroup = false)
        }

    fun waSend(ctx: Context, jid: String, message: String): JSONObject =
        TeamSession.post(ctx, "/wa/send", JSONObject().put("jid", jid).put("message", message).toString())

    // ---- my own WhatsApp number (QR link on the server, send-only) ----------
    fun waMultiStatus(ctx: Context): JSONObject = TeamSession.get(ctx, "/wa/multi/status")

    fun waMultiLink(ctx: Context, teamId: String = "", name: String = ""): JSONObject =
        TeamSession.post(
            ctx, "/wa/multi/link",
            JSONObject().put("teamId", teamId).put("name", name).toString()
        )

    fun waMultiLinkStatus(ctx: Context): JSONObject = TeamSession.get(ctx, "/wa/multi/link/status")

    fun waMultiUnlink(ctx: Context): JSONObject = TeamSession.post(ctx, "/wa/multi/unlink", "{}")

    fun waMultiGroups(ctx: Context, refresh: Boolean = false): List<WaTarget> =
        list(TeamSession.get(ctx, "/wa/multi/groups" + if (refresh) "?refresh=1" else ""), "groups").map {
            WaTarget(jid = it.str("id"), name = it.str("name").ifBlank { it.str("id") }, isGroup = true)
        }

    fun waMultiContacts(ctx: Context, refresh: Boolean = false): List<WaTarget> =
        list(TeamSession.get(ctx, "/wa/multi/contacts" + if (refresh) "?refresh=1" else ""), "contacts").map {
            WaTarget(jid = it.str("id"), name = it.str("name").ifBlank { it.str("phone") }, isGroup = false)
        }

    fun waMultiSend(ctx: Context, message: String, targets: JSONArray): JSONObject =
        TeamSession.post(
            ctx, "/wa/multi/send",
            JSONObject().put("message", message).put("targets", targets).toString()
        )

    // ---- ai --------------------------------------------------------------
    fun aiAgents(ctx: Context): JSONObject = TeamSession.get(ctx, "/ai/agents")

    fun aiTask(ctx: Context, taskId: String, kind: String, prompt: String, agentId: String = ""): JSONObject =
        TeamSession.post(
            ctx, "/task/ai",
            JSONObject().put("taskId", taskId).put("kind", kind).put("prompt", prompt).put("agentId", agentId).toString()
        )

    // ---- push ------------------------------------------------------------
    fun pushKey(ctx: Context): JSONObject = TeamSession.get(ctx, "/push/key")
    fun pushTest(ctx: Context): JSONObject = TeamSession.post(ctx, "/push/test", "{}")

    // ---- helpers ---------------------------------------------------------
    private fun encode(v: String): String = java.net.URLEncoder.encode(v, "UTF-8")

    private fun list(res: JSONObject, key: String): List<JSONObject> {
        val arr: JSONArray = res.optJSONArray(key) ?: res.optJSONArray("items") ?: JSONArray()
        return (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
    }

    private fun JSONObject.str(key: String): String = optString(key, "")

    private fun JSONObject.toMap(): Map<String, Any?> =
        keys().asSequence().associateWith { k -> opt(k) }
}
