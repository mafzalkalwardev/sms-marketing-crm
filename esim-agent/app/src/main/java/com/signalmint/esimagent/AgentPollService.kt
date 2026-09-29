package com.signalmint.esimagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.telephony.SmsManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class AgentPollService : Service() {
    private val scope = CoroutineScope(Dispatchers.IO)
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForeground(42, buildNotification("Waiting for SMS jobs"))
        job = scope.launch {
            while (isActive) {
                try {
                    pollOnce()
                } catch (error: Exception) {
                    updateNotification("Poll error: ${error.message}")
                }
                delay(3000)
            }
        }
    }

    private fun pollOnce() {
        if (AgentStore.getToken(this).isBlank()) return
        val jobs = AgentApi.fetchJobs(this)
        if (jobs.length() == 0) {
            updateNotification("Listening as ${AgentStore.getPhoneNumber(this)}")
            return
        }
        for (i in 0 until jobs.length()) {
            val item = jobs.getJSONObject(i)
            val jobId = item.getLong("id")
            val to = item.getString("to")
            val text = item.getString("text")
            try {
                val smsManager = getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
                val parts = smsManager.divideMessage(text)
                if (parts.size == 1) {
                    smsManager.sendTextMessage(to, null, text, null, null)
                } else {
                    smsManager.sendMultipartTextMessage(to, null, parts, null, null)
                }
                AgentApi.reportJobStatus(this, jobId, "sent")
                updateNotification("Sent to $to")
            } catch (error: Exception) {
                AgentApi.reportJobStatus(this, jobId, "failed", error.message)
                updateNotification("Send failed: ${error.message}")
            }
        }
    }

    override fun onDestroy() {
        job?.cancel()
        super.onDestroy()
    }

    private fun buildNotification(content: String): Notification {
        val channelId = "esim_agent"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(channelId, "eSIM Agent", NotificationManager.IMPORTANCE_LOW)
            )
        }
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("SignalMint eSIM Agent")
            .setContentText(content)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(content: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(42, buildNotification(content))
    }
}
