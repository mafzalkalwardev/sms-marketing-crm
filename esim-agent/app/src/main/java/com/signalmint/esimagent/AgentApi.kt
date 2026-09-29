package com.signalmint.esimagent

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

object AgentStore {
    private const val PREFS = "esim_agent_prefs"

    private fun prefs(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Exception) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        }
    }

    fun getServerUrl(context: Context): String = prefs(context).getString("server_url", "") ?: ""
    fun setServerUrl(context: Context, value: String) = prefs(context).edit().putString("server_url", value.trim().trimEnd('/')).apply()

    fun getToken(context: Context): String = prefs(context).getString("agent_token", "") ?: ""
    fun setToken(context: Context, value: String) = prefs(context).edit().putString("agent_token", value).apply()

    fun getPhoneNumber(context: Context): String = prefs(context).getString("phone_number", "") ?: ""
    fun setPhoneNumber(context: Context, value: String) = prefs(context).edit().putString("phone_number", value).apply()

    fun getDeviceId(context: Context): String {
        val existing = prefs(context).getString("device_id", null)
        if (!existing.isNullOrBlank()) return existing
        val created = UUID.randomUUID().toString()
        prefs(context).edit().putString("device_id", created).apply()
        return created
    }

    fun clearSession(context: Context) {
        prefs(context).edit()
            .remove("agent_token")
            .remove("phone_number")
            .apply()
    }
}

object AgentApi {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun pair(serverUrl: String, pairingCode: String, deviceId: String): JSONObject {
        val body = JSONObject()
            .put("pairingCode", pairingCode)
            .put("deviceId", deviceId)
            .toString()
            .toRequestBody(jsonType)
        val request = Request.Builder()
            .url("$serverUrl/api/esim-agent/pair")
            .post(body)
            .build()
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException(parseError(text, "Pairing failed (${response.code})"))
            }
            return JSONObject(text)
        }
    }

    fun fetchJobs(context: Context): JSONArray {
        val request = authorized(context, "/api/esim-agent/jobs").get().build()
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException(parseError(text, "Job poll failed (${response.code})"))
            }
            return JSONObject(text).optJSONArray("jobs") ?: JSONArray()
        }
    }

    fun reportJobStatus(context: Context, jobId: Long, status: String, error: String? = null) {
        val payload = JSONObject().put("status", status)
        if (!error.isNullOrBlank()) payload.put("error", error)
        val body = payload.toString().toRequestBody(jsonType)
        val request = authorized(context, "/api/esim-agent/jobs/$jobId/status").post(body).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Status update failed (${response.code})")
            }
        }
    }

    fun postInbound(context: Context, from: String, to: String, text: String) {
        val payload = JSONObject()
            .put("from", from)
            .put("to", to)
            .put("text", text)
            .put("providerMessageId", "android_${System.currentTimeMillis()}")
        val body = payload.toString().toRequestBody(jsonType)
        val request = authorized(context, "/api/esim-agent/inbound").post(body).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Inbound post failed (${response.code})")
            }
        }
    }

    private fun authorized(context: Context, path: String): Request.Builder {
        val server = AgentStore.getServerUrl(context)
        val token = AgentStore.getToken(context)
        return Request.Builder()
            .url("$server$path")
            .header("Authorization", "Bearer $token")
            .header("X-eSIM-Agent-Token", token)
    }

    private fun parseError(body: String, fallback: String): String {
        return try {
            JSONObject(body).optString("error", fallback)
        } catch (_: Exception) {
            fallback
        }
    }
}
