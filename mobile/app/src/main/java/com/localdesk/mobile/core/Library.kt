package com.localdesk.mobile.core

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONArray

private val Context.recentsDataStore by preferencesDataStore(name = "localdesk_library")
private val Context.settingsDataStore by preferencesDataStore(name = "localdesk_prefs")

enum class ThemePref { SYSTEM, LIGHT, DARK }

/** One persisted PDF selection highlight (app-side, view-only overlay). */
data class PdfHighlight(val uri: String, val page: Int, val from: Int, val to: Int)

/** On-device recents list (content URIs + metadata only). Cap 30, newest first. */
class Library(private val context: Context) {

    private val key = stringPreferencesKey("records")
    private val themeKey = stringPreferencesKey("theme")
    private val highlightsKey = stringPreferencesKey("pdf_highlights")

    val records: Flow<List<OpenRecord>> = context.recentsDataStore.data.map { prefs ->
        decode(prefs[key]).sortedByDescending { it.openedAt }
    }

    val themePref: Flow<ThemePref> = context.settingsDataStore.data.map { prefs ->
        when (prefs[themeKey]) {
            "LIGHT" -> ThemePref.LIGHT
            "DARK" -> ThemePref.DARK
            else -> ThemePref.SYSTEM
        }
    }

    suspend fun setTheme(pref: ThemePref) {
        context.settingsDataStore.edit { it[themeKey] = pref.name }
    }

    suspend fun upsert(record: OpenRecord) {
        context.recentsDataStore.edit { prefs ->
            val list = decode(prefs[key]).toMutableList()
            val decodedNew = android.net.Uri.decode(record.uri)
            // One physical file can arrive via several URI forms (SAF pick, VIEW intent,
            // DocumentsUI) — treat decoded URI or same name+size as the same document.
            list.removeAll {
                android.net.Uri.decode(it.uri) == decodedNew ||
                    (record.sizeBytes > 0 && it.name == record.name && it.sizeBytes == record.sizeBytes)
            }
            list.add(record)
            if (list.size > 30) {
                list.sortByDescending { it.openedAt }
                while (list.size > 30) list.removeAt(list.size - 1)
            }
            prefs[key] = encode(list)
        }
    }

    /** One-time cleanup of duplicate recents rows created before decoded-URI matching. */
    suspend fun dedupe() {
        context.recentsDataStore.edit { prefs ->
            val list = decode(prefs[key])
            if (list.size < 2) return@edit
            val seen = linkedSetOf<String>()
            val kept = mutableListOf<OpenRecord>()
            list.sortedByDescending { it.openedAt }.forEach { r ->
                val id = android.net.Uri.decode(r.uri) + "|" + r.name + "|" + r.sizeBytes
                if (seen.add(id)) kept += r
            }
            if (kept.size != list.size) prefs[key] = encode(kept)
        }
    }

    suspend fun touch(uriString: String, at: Long = System.currentTimeMillis()) {
        context.recentsDataStore.edit { prefs ->
            val list = decode(prefs[key]).toMutableList()
            val index = list.indexOfFirst { it.uri == uriString }
            if (index >= 0) {
                list[index] = list[index].copy(openedAt = at)
                prefs[key] = encode(list)
            }
        }
    }

    suspend fun remove(uriString: String) {
        context.recentsDataStore.edit { prefs ->
            prefs[key] = encode(decode(prefs[key]).filterNot { it.uri == uriString })
        }
    }

    suspend fun findByUri(uriString: String): OpenRecord? =
        // Compare decoded forms — pick URIs may be stored encoded while the reader
        // receives them in another encoding generation.
        records.first().firstOrNull {
            android.net.Uri.decode(it.uri) == android.net.Uri.decode(uriString)
        }

    val highlights: Flow<List<PdfHighlight>> = context.settingsDataStore.data.map { prefs ->
        decodeHighlights(prefs[highlightsKey])
    }

    suspend fun addHighlight(h: PdfHighlight) {
        context.settingsDataStore.edit { prefs ->
            val list = decodeHighlights(prefs[highlightsKey]).toMutableList()
            list.removeAll { it.uri == h.uri && it.page == h.page && it.from == h.from && it.to == h.to }
            list += h
            prefs[highlightsKey] = JSONArray().apply { list.forEach {
                put(org.json.JSONObject().put("uri", it.uri).put("page", it.page)
                    .put("from", it.from).put("to", it.to))
            } }.toString()
        }
    }

    private fun decodeHighlights(raw: String?): List<PdfHighlight> {
        if (raw.isNullOrEmpty()) return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                PdfHighlight(o.getString("uri"), o.getInt("page"), o.getInt("from"), o.getInt("to"))
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun encode(list: List<OpenRecord>): String {
        val array = JSONArray()
        list.forEach { r ->
            array.put(
                org.json.JSONObject()
                    .put("name", r.name)
                    .put("uri", r.uri)
                    .put("mime", r.mime ?: "")
                    .put("size", r.sizeBytes)
                    .put("at", r.openedAt)
                    .put("kind", r.kind.name),
            )
        }
        return array.toString()
    }

    private fun decode(raw: String?): List<OpenRecord> {
        if (raw.isNullOrEmpty()) return emptyList()
        return try {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { i ->
                val o = array.optJSONObject(i) ?: return@mapNotNull null
                OpenRecord(
                    name = o.optString("name", "Document"),
                    uri = o.getString("uri"),
                    mime = o.optString("mime").ifEmpty { null },
                    sizeBytes = o.optLong("size", -1L),
                    openedAt = o.optLong("at", 0L),
                    kind = runCatching { Kind.valueOf(o.optString("kind", "UNKNOWN")) }
                        .getOrDefault(Kind.UNKNOWN),
                )
            }
        } catch (_: Exception) {
            emptyList()
        }
    }
}
