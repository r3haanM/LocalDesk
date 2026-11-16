package com.localdesk.mobile.read

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color as AndroidColor
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.LruCache
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.localdesk.mobile.MobileApp
import com.localdesk.mobile.R
import com.localdesk.mobile.core.AccessLostException
import com.localdesk.mobile.core.Kind
import com.localdesk.mobile.core.KindDetector
import com.localdesk.mobile.core.OpenRecord
import com.localdesk.mobile.core.Source
import com.localdesk.mobile.docs.DocBlock
import com.localdesk.mobile.docs.Docx
import com.localdesk.mobile.core.PdfHighlight
import com.localdesk.mobile.docs.PdfText
import com.localdesk.mobile.docs.Markdown
import com.localdesk.mobile.docs.Grid
import com.localdesk.mobile.docs.Pptx
import com.localdesk.mobile.docs.Slide
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileNotFoundException

sealed interface Doc {
    data class Pdf(val pages: Int, val aspects: List<Float>) : Doc
    data class Text(val text: String, val code: Boolean) : Doc
    data class Document(
        val blocks: List<DocBlock>,
        val markdown: Boolean,
        val header: List<DocBlock> = emptyList(),
        val footer: List<DocBlock> = emptyList(),
    ) : Doc
    data class Deck(val slides: List<Slide>) : Doc
    data class GridDoc(val data: com.localdesk.mobile.docs.WorkbookData) : Doc
    data class Picture(val bitmap: ImageBitmap, val edge: Color) : Doc
    data class Handoff(val kind: Kind) : Doc
}

data class ReaderFailure(
    @androidx.annotation.StringRes val titleRes: Int,
    @androidx.annotation.StringRes val bodyRes: Int,
    val bodyArg: String? = null,
    val openWith: Boolean = false,
    val removable: Boolean = false,
    val lock: Boolean = false,
)

sealed interface ReaderState {
    data object Loading : ReaderState
    data class Failure(val info: ReaderFailure) : ReaderState
    data class Ready(val doc: Doc, val badge: Boolean, val monoToggle: Boolean = false) : ReaderState
}

/**
 * Dispatches one document to its on-device reader. Resilience chain: provider bytes →
 * cached bytes, provider metadata → recents metadata, honest failures when both are gone.
 */
class OversizeException : java.io.IOException("Body exceeds preview cap")

class ReaderModel(app: Application, val uriString: String) : AndroidViewModel(app) {

    private val context = app
    val source = Source(app, uriString)
    private val library = (context as MobileApp).library

    var title: String by mutableStateOf("Document")
        private set
    var kind: Kind? by mutableStateOf(Kind.UNKNOWN)
        private set
    var mime: String? by mutableStateOf(null)
        private set

    var pdfBook: PdfBook? = null
        private set

    private val bitmapCache = object : LruCache<String, Bitmap>(
        ((Runtime.getRuntime().maxMemory() / 8) / 1024).toInt().coerceAtLeast(1),
    ) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount / 1024
    }

    private val state = MutableStateFlow<ReaderState>(ReaderState.Loading)
    val ui: StateFlow<ReaderState> = state.asStateFlow()

    var pdfText by mutableStateOf<PdfText.Doc?>(null)
        private set
    var cachedCopy by mutableStateOf(false)
        private set

    val highlights: StateFlow<List<PdfHighlight>> = library.highlights
        .map { list ->
            list.filter { android.net.Uri.decode(it.uri) == android.net.Uri.decode(uriString) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private var hasLiveMeta = false
    private var hasRecordMeta = false

    init {
        viewModelScope.launch(Dispatchers.IO) { load() }
    }

    private suspend fun load() {
        val library = (context as MobileApp).library
        val live = source.liveMeta()
        hasLiveMeta = live != null
        val record = if (live == null) library.findByUri(uriString) else null
        hasRecordMeta = record != null
        val cached = source.cachedFile()

        // Stale-cache guard: the provider copy has a different size than the cached one —
        // the source file changed since the cache was stashed. Purge and fail honestly.
        if (!hasLiveMeta && cached != null && record != null && record.sizeBytes > 0 && cached.length() != record.sizeBytes) {
            source.purgeCache()
            state.value = failChanged()
            return
        }

        if (!hasLiveMeta && !hasRecordMeta && cached == null) {
            state.value = failGrant()
            return
        }

        mime = source.accessCandidates().firstNotNullOfOrNull { candidate ->
            try { context.contentResolver.getType(candidate) } catch (_: Exception) { null }
        } ?: record?.mime

        val name = live?.first
            ?: record?.name
            ?: cached?.let { file ->
                val ext = file.name.substringAfterLast('.', "")
                if (ext.isNotEmpty()) "Document.$ext" else "Document"
            }
            ?: source.uri.lastPathSegment?.takeUnless { seg -> seg.all { it.isDigit() } }
            ?: "Document"
        val size = live?.second ?: record?.sizeBytes ?: cached?.length() ?: -1L
        title = name
        kind = KindDetector.detect(name, mime)
        val k = kind ?: Kind.UNKNOWN

        try {
            when (k) {
                Kind.PDF -> readPdf()
                Kind.DOCX -> {
                    val parsed = Docx.parse { source.zip() }
                    publish(Doc.Document(parsed.blocks, markdown = false, header = parsed.header, footer = parsed.footer), badge = true)
                }
                Kind.PPTX -> publish(Doc.Deck(Pptx.parse { source.zip() }), badge = true)
                Kind.XLSX -> publish(Doc.GridDoc(Grid.xlsx { source.zip() }), badge = true)
                Kind.CSV -> publish(Doc.GridDoc(Grid.csv(String(source.readBytes(), Charsets.UTF_8))), badge = true)
                Kind.TXT -> publish(Doc.Text(String(source.readBytes(), Charsets.UTF_8), code = false))
                Kind.MD -> publish(
                    Doc.Document(Markdown.parse(String(source.readBytes(), Charsets.UTF_8)), markdown = true),
                    badge = false, monoToggle = true,
                )
                Kind.JSON, Kind.LOG, Kind.CODE ->
                    publish(Doc.Text(String(source.readBytes(), Charsets.UTF_8), code = true), monoToggle = true)
                Kind.IMAGE -> readImage()
                Kind.DOC_LEGACY, Kind.PPT_LEGACY, Kind.XLS_LEGACY, Kind.UNKNOWN ->
                    publish(Doc.Handoff(k))
            }
            if (k == Kind.PDF && state.value is ReaderState.Ready) {
                pdfText = runCatching { PdfText.extract(source.readBytes()) }.onFailure { android.util.Log.d("PdfText", "extract err: $it") }.getOrNull()
            }
            cachedCopy = source.usedCache

            viewModelScope.launch(Dispatchers.IO + NonCancellable) {
                try {
                    if (hasLiveMeta || hasRecordMeta) {
                        library.upsert(
                            OpenRecord(name, uriString, mime, size, System.currentTimeMillis(), k),
                        )
                    } else {
                        library.touch(uriString)
                    }
                    source.stash(k)
                } catch (_: Exception) {
                }
            }
        } catch (e: AccessLostException) {
            state.value = failGrant()
        } catch (e: SecurityException) {
            state.value = if (k == Kind.PDF) failLocked() else failGrant()
        } catch (e: FileNotFoundException) {
            state.value = failGrant()
        } catch (e: java.util.zip.ZipException) {
            state.value = failNotDoc(k)
        } catch (e: IllegalStateException) {
            state.value = failNotDoc(k)
        } catch (e: OversizeException) {
            state.value = ReaderState.Failure(
                ReaderFailure(
                    titleRes = R.string.err_big_title,
                    bodyRes = R.string.err_big_body,
                    bodyArg = com.localdesk.mobile.core.HumanBytes.format(com.localdesk.mobile.core.PREVIEW_CAP),
                    removable = true,
                ),
            )
        } catch (e: java.io.IOException) {
            state.value = if (k == Kind.PDF) failLocked() else failGeneric()
        } catch (_: Exception) {
            state.value = failGeneric()
        }
    }

    private fun publish(doc: Doc, badge: Boolean = false, monoToggle: Boolean = false) {
        state.value = ReaderState.Ready(doc, badge, monoToggle)
    }

    private fun readPdf() {
        // Access forms aware — some provider builds hold the grant on the encoded twin only.
        val pfd: ParcelFileDescriptor? = source.openDescriptor("r")
        if (pfd != null) {
            try {
                openBook(PdfBook(pfd, bitmapCache))
                return
            } catch (e: SecurityException) {
                state.value = failLocked()
                return
            } catch (e: java.io.IOException) {
                state.value = failCorrupt()
                return
            }
        }
        val cached = source.cachedFile() ?: run {
            state.value = failGrant()
            return
        }
        try {
            openBook(PdfBook(ParcelFileDescriptor.open(cached, ParcelFileDescriptor.MODE_READ_ONLY), bitmapCache))
        } catch (_: Exception) {
            state.value = failCorrupt()
        }
    }

    private fun openBook(book: PdfBook) {
        val count = book.pages
        if (count == 0) {
            book.close()
            state.value = ReaderState.Failure(
                ReaderFailure(
                    titleRes = R.string.err_empty_title,
                    bodyRes = R.string.err_empty_body,
                    removable = true,
                ),
            )
            return
        }
        pdfBook = book
        publish(Doc.Pdf(count, book.aspects()))
    }

    fun renderPage(index: Int, widthPx: Int): ImageBitmap? =
        pdfBook?.page(index, widthPx)?.asImageBitmap()

    private fun readImage() {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        source.body().use { stream -> BitmapFactory.decodeStream(stream, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw java.io.IOException("Not an image")

        val maxDim = maxOf(bounds.outWidth, bounds.outHeight)
        var sample = 1
        while (maxDim / (sample * 2) >= 2048) sample *= 2

        val bitmap = source.body().use { stream ->
            BitmapFactory.decodeStream(stream, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: throw java.io.IOException("Decode failed")

        publish(Doc.Picture(bitmap.asImageBitmap(), edgeColor(bitmap)))
    }

    private fun edgeColor(bitmap: Bitmap): Color {
        val sample = 16
        val small = Bitmap.createScaledBitmap(bitmap, sample, sample, true)
        var r = 0L; var g = 0L; var b = 0L; var count = 0L
        for (x in 0 until sample) for (y in 0 until sample) {
            if (x == 0 || x == sample - 1 || y == 0 || y == sample - 1) {
                val p = small.getPixel(x, y)
                r += AndroidColor.red(p); g += AndroidColor.green(p); b += AndroidColor.blue(p); count++
            }
        }
        if (count == 0L) return Color.White
        return Color((r / count).toInt(), (g / count).toInt(), (b / count).toInt())
    }

    private fun failGrant() = ReaderState.Failure(
        ReaderFailure(
            titleRes = R.string.err_grant_title,
            bodyRes = R.string.err_grant_body,
            openWith = true,
            removable = true,
        ),
    )

    private fun failChanged() = ReaderState.Failure(
        ReaderFailure(
            titleRes = R.string.err_changed_title,
            bodyRes = R.string.err_changed_body,
            openWith = true,
            removable = true,
        ),
    )

    private fun failCorrupt() = ReaderState.Failure(
        ReaderFailure(
            titleRes = R.string.err_corrupt_title,
            bodyRes = R.string.err_corrupt_body,
            openWith = true,
            removable = true,
        ),
    )

    private fun failNotDoc(kind: Kind) = ReaderState.Failure(
        ReaderFailure(
            titleRes = when (kind) {
                Kind.PPTX, Kind.PPT_LEGACY -> R.string.err_notdoc_pptx
                Kind.XLSX -> R.string.err_notdoc_xlsx
                else -> R.string.err_notdoc_docx
            },
            bodyRes = R.string.err_notdoc_body,
            openWith = true,
            removable = true,
        ),
    )

    private fun failLocked() = ReaderState.Failure(
        ReaderFailure(
            titleRes = R.string.err_locked_title,
            bodyRes = R.string.err_locked_body,
            lock = true,
        ),
    )

    private fun failGeneric() = ReaderState.Failure(
        ReaderFailure(
            titleRes = R.string.err_generic_title,
            bodyRes = R.string.err_generic_body,
            removable = true,
        ),
    )

    override fun onCleared() {
        pdfBook?.close()
        pdfBook = null
    }
}
