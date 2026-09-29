package com.signalmint.esimagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        if (AgentStore.getToken(context).isBlank()) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val from = messages.firstOrNull()?.displayOriginatingAddress ?: return
        val body = messages.joinToString(separator = "") { it.messageBody ?: "" }
        val to = AgentStore.getPhoneNumber(context)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                AgentApi.postInbound(context, from, to, body)
            } catch (_: Exception) {
                // Best-effort; next inbound can still succeed.
            }
        }
    }
}
