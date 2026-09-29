package com.signalmint.esimagent

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    private lateinit var serverUrlInput: TextInputEditText
    private lateinit var pairingCodeInput: TextInputEditText
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        serverUrlInput = findViewById(R.id.serverUrl)
        pairingCodeInput = findViewById(R.id.pairingCode)
        statusText = findViewById(R.id.statusText)

        val savedUrl = AgentStore.getServerUrl(this)
        if (savedUrl.isNotBlank()) serverUrlInput.setText(savedUrl)
        refreshStatus()

        findViewById<Button>(R.id.pairButton).setOnClickListener {
            requestSmsPermissions()
            pairAndStart()
        }
        findViewById<Button>(R.id.stopButton).setOnClickListener {
            stopService(Intent(this, AgentPollService::class.java))
            statusText.text = "Agent stopped"
        }
    }

    private fun refreshStatus() {
        val token = AgentStore.getToken(this)
        val phone = AgentStore.getPhoneNumber(this)
        statusText.text = if (token.isBlank()) {
            "Not paired"
        } else {
            "Paired as $phone\nToken saved. Polling service can run."
        }
    }

    private fun requestSmsPermissions() {
        val needed = mutableListOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
        )
        if (Build.VERSION.SDK_INT >= 33) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1001)
        }
    }

    private fun pairAndStart() {
        val serverUrl = serverUrlInput.text?.toString().orEmpty().trim().trimEnd('/')
        val code = pairingCodeInput.text?.toString().orEmpty().trim()
        if (serverUrl.isBlank() || code.isBlank()) {
            Toast.makeText(this, "Server URL and pairing code are required", Toast.LENGTH_SHORT).show()
            return
        }

        statusText.text = "Pairing…"
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    AgentApi.pair(serverUrl, code, AgentStore.getDeviceId(this@MainActivity))
                }
                val token = result.getString("token")
                val phone = result.optString("phoneNumber", result.optJSONObject("profile")?.optString("phoneNumber").orEmpty())
                AgentStore.setServerUrl(this@MainActivity, serverUrl)
                AgentStore.setToken(this@MainActivity, token)
                AgentStore.setPhoneNumber(this@MainActivity, phone)
                ContextCompat.startForegroundService(
                    this@MainActivity,
                    Intent(this@MainActivity, AgentPollService::class.java)
                )
                statusText.text = "Paired as $phone\nAgent polling started."
            } catch (error: Exception) {
                statusText.text = "Pairing failed: ${error.message}"
            }
        }
    }
}
