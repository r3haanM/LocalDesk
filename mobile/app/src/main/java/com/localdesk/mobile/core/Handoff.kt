package com.localdesk.mobile.core

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri

object Handoff {

    /** URI to hand out: the live provider URI when currently readable, else the cached copy. */
    fun outbound(context: Context, source: com.localdesk.mobile.core.Source): Uri =
        if (source.providerReadable()) {
            source.uri
        } else {
            val file = source.cachedFile()
            if (file != null) {
                androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.files", file)
            } else source.uri
        }

    fun findActivity(context: Context): Activity? {
        var current: Context = context
        while (current is ContextWrapper) {
            if (current is Activity) return current
            current = current.baseContext
        }
        return null
    }

    fun share(activity: Activity, outbound: Uri, mime: String?, title: String): Boolean {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime ?: "application/octet-stream"
            putExtra(Intent.EXTRA_STREAM, outbound)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return try {
            activity.startActivity(Intent.createChooser(send, title))
            true
        } catch (_: Exception) {
            false
        }
    }

    fun openWith(activity: Activity, outbound: Uri, mime: String?): Boolean {
        val view = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(outbound, mime ?: "application/octet-stream")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return try {
            activity.startActivity(view)
            true
        } catch (_: Exception) {
            try {
                activity.startActivity(Intent.createChooser(view, null))
                true
            } catch (_: Exception) {
                false
            }
        }
    }
}

object HumanBytes {
    fun format(bytes: Long): String {
        if (bytes < 0) return "—"
        if (bytes < 1024) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1024.0) return trim(kb) + " KB"
        val mb = kb / 1024.0
        if (mb < 1024.0) return trim(mb) + " MB"
        return trim(mb / 1024.0) + " GB"
    }

    private fun trim(v: Double): String {
        val rounded = (v * 10).toInt() / 10.0
        return if (rounded == rounded.toInt().toDouble()) rounded.toInt().toString()
        else String.format(java.util.Locale.US, "%.1f", rounded)
    }
}

object HumanTime {
    fun ago(at: Long, now: Long = System.currentTimeMillis()): String {
        val diff = now - at
        if (diff < 60_000L) return "just now"
        val minutes = diff / 60_000L
        if (minutes < 60L) return "$minutes min ago"
        val hours = minutes / 60L
        if (hours < 24L) return "$hours h ago"
        val days = hours / 24L
        if (days == 1L) return "Yesterday"
        if (days < 7L) return "$days d ago"
        return java.text.SimpleDateFormat("d MMM", java.util.Locale.getDefault())
            .format(java.util.Date(at))
    }
}
