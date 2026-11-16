package com.localdesk.mobile.lib

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.localdesk.mobile.MobileApp
import com.localdesk.mobile.core.Kind
import com.localdesk.mobile.core.KindDetector
import com.localdesk.mobile.core.OpenRecord
import com.localdesk.mobile.core.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Home state: on-device recents + SAF pick hand-off. */
class LibraryModel(app: Application) : AndroidViewModel(app) {

    private val library = (app as MobileApp).library

    val records: StateFlow<List<OpenRecord>> = library.records
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    fun search(value: String) {
        _query.value = value
    }

    fun visible(records: List<OpenRecord>): List<OpenRecord> {
        val q = _query.value.trim()
        return if (q.isEmpty()) records else records.filter { it.name.contains(q, ignoreCase = true) }
    }

    /** Registers picked URIs (persist grants best-effort) and returns them for opening. */
    fun addPicked(uris: List<Uri>, onDone: (List<OpenRecord>) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val context = getApplication<Application>()
            val metas = uris.mapNotNull { uri ->
                val source = Source(context, uri.toString())
                val meta = source.liveMeta() ?: return@mapNotNull null
                try {
                    context.contentResolver.takePersistableUriPermission(
                        uri,
                        android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION,
                    )
                } catch (_: SecurityException) {
                    // Some provider builds register the grant against the encoded twin form —
                    // persist that one too so recents stay openable across reboots.
                    runCatching {
                        source.accessCandidates().drop(1).forEach { twin ->
                            runCatching {
                                context.contentResolver.takePersistableUriPermission(
                                    twin,
                                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION,
                                )
                            }
                        }
                    }
                }
                OpenRecord(
                    name = meta.first,
                    uri = uri.toString(),
                    mime = runCatching { context.contentResolver.getType(uri) }.getOrNull(),
                    sizeBytes = meta.second,
                    openedAt = System.currentTimeMillis(),
                    kind = KindDetector.detect(meta.first, runCatching { context.contentResolver.getType(uri) }.getOrNull()),
                )
            }
            metas.forEach { library.upsert(it) }
            withContext(Dispatchers.Main) { onDone(metas) }
        }
    }

    fun opened(record: OpenRecord) {
        viewModelScope.launch(Dispatchers.IO) { library.touch(record.uri) }
    }

    fun remove(record: OpenRecord) {
        val context = getApplication<Application>()
        viewModelScope.launch(Dispatchers.IO) {
            library.remove(record.uri)
            Source(context, record.uri).purgeCache()
        }
    }
}

/** Launches the system document picker. */
fun browseMimes(): Array<String> = arrayOf(
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/*",
    "image/*",
)
