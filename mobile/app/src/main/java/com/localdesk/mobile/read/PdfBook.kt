package com.localdesk.mobile.read

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.LruCache
import kotlin.math.roundToInt

/**
 * Thread-safe PdfRenderer wrapper. PdfRenderer is single-threaded — all calls serialize on
 * [lock]. Pages render at fit-width (retina ×2, capped) and cache by width+index.
 */
class PdfBook(pfd: ParcelFileDescriptor, private val cache: LruCache<String, Bitmap>) {

    private val renderer: PdfRenderer
    private val fd: ParcelFileDescriptor
    private val lock = Any()
    private val maxRenderWidth = 2200
    private val maxTexturePx = 4096f

    init {
        try {
            renderer = PdfRenderer(pfd)
            fd = pfd
        } catch (t: Throwable) {
            runCatching { pfd.close() }
            throw t
        }
    }

    val pages: Int get() = synchronized(lock) { renderer.pageCount }

    fun aspects(): List<Float> = synchronized(lock) {
        (0 until renderer.pageCount).map { i ->
            // Page is NOT AutoCloseable below API 35 — use{} would crash. close() only.
            val page = renderer.openPage(i)
            try {
                if (page.height > 0) page.width.toFloat() / page.height.toFloat() else 1f / 1.414f
            } finally {
                page.close()
            }
        }
    }

    fun page(index: Int, targetWidth: Int): Bitmap? = synchronized(lock) {
        if (index < 0 || index >= renderer.pageCount) return@synchronized null
        val key = "$targetWidth-p$index"
        cache.get(key)?.let { return@synchronized it }

        // Page is NOT AutoCloseable below API 35 — try/finally, never use{}.
        val page = renderer.openPage(index)
        try {
            var scale = targetWidth.toFloat() / page.width
            val capped = (page.width * scale).roundToInt().coerceAtMost(maxRenderWidth)
            scale = capped.toFloat() / page.width
            // Cap height too: tall pages must stay under the GPU texture limit.
            scale = minOf(scale, maxTexturePx / page.height)
            val w = (page.width * scale).roundToInt().coerceAtLeast(1)
            val h = (page.height * scale).roundToInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(android.graphics.Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            cache.put(key, bitmap)
            bitmap
        } finally {
            page.close()
        }
    }

    fun close() = synchronized(lock) {
        runCatching { renderer.close() }
        runCatching { fd.close() }
    }

    companion object {
        fun decode(context: Context, bytes: ByteArray, maxDim: Int): Bitmap? {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            val max = maxOf(bounds.outWidth, bounds.outHeight)
            while (max / (sample * 2) >= maxDim) sample *= 2
            return BitmapFactory.decodeByteArray(
                bytes, 0, bytes.size,
                BitmapFactory.Options().apply { inSampleSize = sample },
            )
        }
    }
}
