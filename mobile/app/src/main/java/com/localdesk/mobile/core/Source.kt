package com.localdesk.mobile.core

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.IOException
import java.io.FileNotFoundException
import java.io.InputStream
import java.security.MessageDigest

/** Text-family preview cap (bytes) — oversized files hand off to the desktop. */
const val PREVIEW_CAP = 8L * 1024 * 1024

enum class Kind {
    PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, JSON, LOG, CODE, IMAGE,
    DOC_LEGACY, PPT_LEGACY, XLS_LEGACY, UNKNOWN;

    val chip: String
        get() = when (this) {
            PDF -> "PDF"; DOCX -> "DOCX"; PPTX -> "PPTX"; XLSX -> "XLSX"; CSV -> "CSV"
            TXT, MD, JSON, LOG, CODE -> "TXT"; IMAGE -> "IMG"
            DOC_LEGACY -> "DOC"; PPT_LEGACY -> "PPT"; XLS_LEGACY -> "XLS"
            UNKNOWN -> "FILE"
        }

    val isLegacy: Boolean
        get() = this == DOC_LEGACY || this == PPT_LEGACY || this == XLS_LEGACY

    val cacheExt: String
        get() = when (this) {
            PDF -> ".pdf"; DOCX -> ".docx"; PPTX -> ".pptx"; XLSX -> ".xlsx"; CSV -> ".csv"
            MD -> ".md"; JSON -> ".json"; IMAGE -> ".img"; else -> ".txt"
        }
}

object KindDetector {
    private val codeExts = setOf(
        "kt", "java", "py", "js", "ts", "c", "h", "cpp", "cs", "go", "rs", "rb", "php",
        "sh", "sql", "xml", "html", "css", "yaml", "yml", "toml", "swift", "dart",
    )

    fun detect(name: String, mime: String?): Kind {
        val ext = name.substringAfterLast('.', "").lowercase()
        when (ext) {
            "pdf" -> return Kind.PDF
            "docx" -> return Kind.DOCX
            "pptx" -> return Kind.PPTX
            "xlsx" -> return Kind.XLSX
            "csv", "tsv" -> return Kind.CSV
            "txt", "text" -> return Kind.TXT
            "md", "markdown" -> return Kind.MD
            "json" -> return Kind.JSON
            "log" -> return Kind.LOG
            "png", "jpg", "jpeg", "webp", "gif", "bmp" -> return Kind.IMAGE
            "doc" -> return Kind.DOC_LEGACY
            "ppt" -> return Kind.PPT_LEGACY
            "xls" -> return Kind.XLS_LEGACY
            in codeExts -> return Kind.CODE
        }
        return when (mime) {
            "application/pdf" -> Kind.PDF
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> Kind.DOCX
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" -> Kind.PPTX
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> Kind.XLSX
            "text/csv" -> Kind.CSV
            "application/msword" -> Kind.DOC_LEGACY
            "application/vnd.ms-powerpoint" -> Kind.PPT_LEGACY
            "application/vnd.ms-excel" -> Kind.XLS_LEGACY
            else -> when {
                mime?.startsWith("text/") == true -> Kind.TXT
                mime?.startsWith("image/") == true -> Kind.IMAGE
                else -> Kind.UNKNOWN
            }
        }
    }
}

/** One row of the on-device recents list. Removing never deletes the file. */
data class OpenRecord(
    val name: String,
    val uri: String,
    val mime: String?,
    val sizeBytes: Long,
    val openedAt: Long,
    val kind: Kind,
)

/** Thrown when the provider grant is gone and no cached body exists. */
class AccessLostException : IOException("Provider grant lost and no cache")

/**
 * Single access point for a document's bytes. Chain: live provider stream → app-private
 * cache copy. Providers like MediaStore hand out non-persistable ACTION_VIEW grants, so
 * the cache is what keeps recents entries openable after the grant dies.
 */
class Source(private val context: Context, private val uriString: String) {

    val uri: Uri = Uri.parse(uriString)
    var usedCache = false
        private set

    private fun cacheFile(): File? {
        val dir = File(context.cacheDir, "open-cache")
        if (!dir.exists()) return null
        val key = MessageDigest.getInstance("SHA-256")
            .digest(uriString.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return dir.listFiles()
            ?.filter { it.name.startsWith(key) && !it.name.endsWith(".tmp") }
            ?.maxByOrNull { it.lastModified() }
    }

    /** The cached body file, when one exists (its extension reveals the format). */
    fun cachedFile(): File? = cacheFile()

    /**
     * Opens the body. Rethrows [AccessLostException] when both provider and cache fail so
     * callers can show the honest "File unavailable" state.
     */
    fun body(): InputStream {
        for (candidate in accessCandidates()) {
            val direct = try {
                context.contentResolver.openInputStream(candidate)
            } catch (e: SecurityException) {
                null
            } catch (e: FileNotFoundException) {
                null
            }
            if (direct != null) {
                usedCache = false
                return direct
            }
        }
        val cached = cacheFile() ?: throw AccessLostException()
        usedCache = true
        return try {
            cached.inputStream()
        } catch (e: Exception) {
            usedCache = false
            throw AccessLostException()
        }
    }

    fun zip(): java.util.zip.ZipInputStream = java.util.zip.ZipInputStream(java.io.BufferedInputStream(body()))

    /** ParcelFileDescriptor across the access forms (raw first, encoded twin on denial). */
    fun openDescriptor(mode: String = "r"): android.os.ParcelFileDescriptor? {
        for (candidate in accessCandidates()) {
            try {
                context.contentResolver.openFileDescriptor(candidate, mode)?.let { return it }
            } catch (_: SecurityException) {
            } catch (_: FileNotFoundException) {
            }
        }
        return null
    }

    /** Cheap live-provider probe used by Handoff to decide share routing. */
    fun providerReadable(): Boolean = try {
        context.contentResolver.openInputStream(uri)?.close()
        true
    } catch (_: Exception) {
        false
    }

    fun readBytes(maxBytes: Long = PREVIEW_CAP): ByteArray {
        body().use { input ->
            val out = java.io.ByteArrayOutputStream()
            val buf = ByteArray(64 * 1024)
            var read = 0L
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                read += n
                if (read > maxBytes) throw IOException("Body exceeds preview cap")
                out.write(buf, 0, n)
            }
            return out.toByteArray()
        }
        throw IOException("Unreachable")
    }

    /** Live provider name+size, or null when the URI can no longer be queried. */
    fun liveMeta(): Pair<String, Long>? {
        for (candidate in accessCandidates()) {
            val meta = try {
                context.contentResolver.query(
                    candidate,
                    arrayOf(android.provider.OpenableColumns.DISPLAY_NAME, android.provider.OpenableColumns.SIZE),
                    null, null, null,
                )?.use { cursor ->
                    val nameIdx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    val sizeIdx = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
                    if (cursor.moveToFirst() && nameIdx >= 0) {
                        val name = cursor.getString(nameIdx)
                        val size = if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) cursor.getLong(sizeIdx) else -1L
                        if (!name.isNullOrBlank()) name to size else null
                    } else null
                }
            } catch (_: Exception) {
                null
            }
            if (meta != null) return meta
        }
        return null
    }

    /**
     * Access forms to try, raw first. Some provider builds register the picker grant
     * against the percent-encoded document id ("document%3A21") while the app holds the
     * raw form ("document:21") — exact-string grant matching denies the raw one. The
     * encoded twin resolves to the same document and satisfies the grant.
     */
    fun accessCandidates(): List<Uri> {
        val forms = mutableListOf(uri)
        val last = uriString.substringAfterLast('/')
        if (last.contains(':') && !last.contains("%3A")) {
            val encoded = uriString.substringBeforeLast('/') + "/" + last.replace(":", "%3A")
            forms += Uri.parse(encoded)
        } else if (last.contains("%3A")) {
            val decoded = uriString.substringBeforeLast('/') + "/" + last.replace("%3A", ":")
            forms += Uri.parse(decoded)
        }
        return forms.distinct()
    }

    /** Best-effort copy of the body into the cache (only while the provider is readable). */
    fun stash(kind: Kind) {
        if (usedCache) return
        try {
            val dir = File(context.cacheDir, "open-cache").apply { mkdirs() }
            val key = digest(uriString)
            val tmp = File(dir, "$key${kind.cacheExt}.tmp")
            body().use { input -> tmp.outputStream().use { input.copyTo(it) } }
            val target = File(dir, "$key${kind.cacheExt}")
            if (!tmp.renameTo(target)) tmp.delete()
            evict(dir)
        } catch (_: Exception) {
            // Best effort only.
        }
    }

    fun purgeCache() {
        val key = digest(uriString)
        File(context.cacheDir, "open-cache").listFiles()?.forEach { file ->
            if (file.name.startsWith(key)) file.delete() // includes stray .tmp orphans
        }
    }

    private fun digest(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    companion object {
        private const val CACHE_CAP_BYTES = 256L * 1024 * 1024

        /** Keeps open-cache under CACHE_CAP_BYTES, oldest files first. */
        private fun evict(dir: File) {
            val files = dir.listFiles()?.filter { !it.name.endsWith(".tmp") } ?: return
            var total = files.sumOf { it.length() }
            if (total <= CACHE_CAP_BYTES) return
            files.sortedBy { it.lastModified() }.forEach { file ->
                if (total <= CACHE_CAP_BYTES) return
                val size = file.length()
                if (file.delete()) total -= size
            }
        }
    }
}
