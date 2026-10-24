package com.assigntask.app

import android.content.Context
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Team session for the server APIs (`/api/align/*`).
 *
 * The board itself is read/written through Firestore, but the newer features (WhatsApp picker,
 * AI agents, AI follow-up) are server routes that need the team sign-in token in
 * `x-align-session`. This keeps that token in SharedPreferences and offers a tiny HTTP helper —
 * no extra dependency (plain HttpURLConnection).
 */
object TeamSession {
    private const val PREFS = "align_session"
    private const val KEY_TOKEN = "token"
    private const val KEY_NAME = "name"

    const val API = "https://whatanagent.duckdns.org/api/align"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun token(ctx: Context): String = prefs(ctx).getString(KEY_TOKEN, "") ?: ""
    fun name(ctx: Context): String = prefs(ctx).getString(KEY_NAME, "") ?: ""
    fun isSignedIn(ctx: Context): Boolean = token(ctx).isNotBlank()

    fun save(ctx: Context, token: String, name: String) {
        prefs(ctx).edit().putString(KEY_TOKEN, token).putString(KEY_NAME, name).apply()
    }

    fun clear(ctx: Context) {
        prefs(ctx).edit().remove(KEY_TOKEN).remove(KEY_NAME).apply()
    }

    /** POST /staff/login — returns (token, displayName) or throws with a readable message. */
    fun login(ctx: Context, name: String, password: String): Pair<String, String> {
        val body = JSONObject().put("name", name).put("password", password).toString()
        val res = request(ctx, "/staff/login", "POST", body, withSession = false)
        val token = res.optString("session", "")
        if (token.isBlank()) throw IllegalStateException("No session returned by the server.")
        val staff = res.optJSONObject("staff")
        val display = staff?.optString("name")?.takeIf { it.isNotBlank() }
            ?: staff?.optString("handle")?.takeIf { it.isNotBlank() }
            ?: name
        save(ctx, token, display)
        return token to display
    }

    /** GET helper that returns the parsed JSON (empty object when the body is empty). */
    fun get(ctx: Context, path: String): JSONObject = request(ctx, path, "GET", null, withSession = true)

    /** POST helper with a JSON body. */
    fun post(ctx: Context, path: String, body: String): JSONObject =
        request(ctx, path, "POST", body, withSession = true)

    private fun request(ctx: Context, path: String, method: String, body: String?, withSession: Boolean): JSONObject {
        val url = URL(API + path)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 20000
            readTimeout = 25000
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
            if (withSession) {
                val t = token(ctx)
                if (t.isNotBlank()) setRequestProperty("x-align-session", t)
            }
            if (method != "GET") doOutput = true
        }
        try {
            if (method != "GET") {
                val payload = (body ?: "{}").toByteArray(Charsets.UTF_8)
                conn.outputStream.use { it.write(payload) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val json = if (text.isBlank()) JSONObject() else runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (code !in 200..299) {
                val msg = json.optString("error").takeIf { it.isNotBlank() } ?: "Server error ($code)"
                if (code == 401 || code == 404) clear(ctx)   // session expired / invalid
                throw IllegalStateException(msg)
            }
            return json
        } finally {
            conn.disconnect()
        }
    }
}
