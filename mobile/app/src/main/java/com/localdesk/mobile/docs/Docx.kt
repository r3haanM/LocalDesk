package com.localdesk.mobile.docs

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

/**
 * DOCX parser → unified blocks. Handles: styled runs (bold/italic/underline/strike/color/
 * highlight/size), headings, list markers from numbering.xml (decimals counted), alignment,
 * indents, tables with grid fractions, and images via document rels. Two passes over the
 * archive (forward-only streams). Rule: XmlPullParser with namespaces OFF returns QUALIFIED
 * names ("w:p") — always compare [tag]().
 */
object Docx {

    private const val MAX_BLOCKS = 6000

    private val highlights = mapOf(
        "yellow" to 0xFFFF00L, "green" to 0x00FF00L, "cyan" to 0x00FFFFL,
        "magenta" to 0xFF00FFL, "blue" to 0x0000FFL, "red" to 0xFF0000L,
        "darkBlue" to 0x00008BL, "darkCyan" to 0x008B8BL, "darkGreen" to 0x006400L,
        "darkMagenta" to 0x8B008BL, "darkRed" to 0x8B0000L, "darkYellow" to 0x808000L,
        "darkGray" to 0xA9A9A9L, "lightGray" to 0xD3D3D3L, "black" to 0x000000L, "white" to 0xFFFFFFL,
    )

    fun parse(openZip: () -> ZipInputStream): DocxDoc {
        var document: ByteArray? = null
        var rels: ByteArray? = null
        var numbering: ByteArray? = null
        var footnotes: ByteArray? = null
        var headerTarget: String? = null
        var footerTarget: String? = null

        openZip().use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                when (entry.name) {
                    "word/document.xml" -> document = read(entry.name, zip)
                    "word/_rels/document.xml.rels" -> rels = read(entry.name, zip)
                    "word/numbering.xml" -> numbering = read(entry.name, zip)
                    "word/footnotes.xml" -> footnotes = read(entry.name, zip)
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
        val docBytes = document ?: throw IllegalStateException("word/document.xml missing")
        val relMap = rels?.let { parseRels(it) } ?: emptyMap()
        val linkMap = rels?.let { parseLinks(it) } ?: emptyMap()
        val formats = numbering?.let { parseNumbering(it) } ?: emptyMap()

        if (rels != null) {
            val relTypes = parseRelTypes(rels!!)
            headerTarget = relTypes.entries.firstOrNull { it.value == "header" }?.key
            footerTarget = relTypes.entries.firstOrNull { it.value == "footer" }?.key
        }

        val (blocks, imageTargets) = parseBody(docBytes, formats, relMap, linkMap)

        val decoded = HashMap<String, DocImage>()
        if (imageTargets.isNotEmpty()) {
            openZip().use { zip ->
                var entry = zip.nextEntry
                while (entry != null && decoded.size < imageTargets.size) {
                    if (imageTargets.containsKey(entry.name)) {
                        decoded[entry.name] = DocImage(decode(entry.name, read(entry.name, zip), 2048), imageTargets[entry.name] ?: 1.414f)
                    }
                    zip.closeEntry()
                    entry = zip.nextEntry
                }
            }
        }

        val body = blocks.map { block ->
            when (block) {
                is Pending -> DocBlock.Image(decoded[block.target] ?: DocImage(null, block.aspect))
                is DocBlock -> block
                else -> block as DocBlock
            }
        }.take(MAX_BLOCKS)

        fun renderExtra(target: String?): List<DocBlock> {
            if (target == null) return emptyList()
            val path = mediaPath(target)
            return openZip().let {
                var found: ByteArray? = null
                it.use { zip ->
                    var entry = zip.nextEntry
                    while (entry != null) {
                        if (entry.name == path) { found = read(entry.name, zip); break }
                        zip.closeEntry()
                        entry = zip.nextEntry
                    }
                }
                val bytes = found ?: return@let emptyList()
                parseBody(bytes, formats, relMap, linkMap).first
                    .map { b -> if (b is Pending) DocBlock.Image(decoded[b.target] ?: DocImage(null, b.aspect)) else b as? DocBlock ?: DocBlock.Para(StyledPara(emptyList())) }
                    .filterIsInstance<DocBlock>()
                    .take(60)
            }
        }

        val notes = footnotes?.let { fn -> footnoteTexts(fn).take(40) } ?: emptyList()
        val footerBlocks = renderExtra(footerTarget).toMutableList()
        if (notes.isNotEmpty()) {
            footerBlocks += DocBlock.Para(StyledPara(runs = listOf(StyledRun("Notes", bold = true)), heading = 2))
            notes.forEachIndexed { i, note ->
                footerBlocks += DocBlock.Para(StyledPara(runs = listOf(StyledRun("${i + 1}. $note"))))
            }
        }

        return DocxDoc(body, renderExtra(headerTarget), footerBlocks)
    }

    data class DocxDoc(val blocks: List<DocBlock>, val header: List<DocBlock>, val footer: List<DocBlock>)

    /** "1. text" per real footnote (ids < 1 are separators). */
    private fun footnoteTexts(bytes: ByteArray): List<String> {
        val parser = parser(bytes)
        var event = parser.eventType
        val out = mutableListOf<String>()
        var id = -1
        val sb = StringBuilder()
        var inNote = false
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (tag(parser.name)) {
                    "footnote" -> {
                        id = attr(parser, "w:id")?.toIntOrNull() ?: -1
                        inNote = id >= 1
                        sb.clear()
                    }
                    "t" -> if (inNote) sb.append(parser.nextText())
                }
                XmlPullParser.END_TAG -> if (tag(parser.name) == "footnote") {
                    if (inNote && sb.isNotBlank()) out += sb.toString().trim()
                    inNote = false
                }
            }
            event = parser.next()
        }
        return out
    }

    /** External link rels (rid -> url) — excluded from the media rel map. */
    private fun parseLinks(bytes: ByteArray): Map<String, String> {
        val parser = parser(bytes)
        val map = HashMap<String, String>()
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && tag(parser.name) == "Relationship") {
                val type = attr(parser, "Type") ?: ""
                if (type.endsWith("/hyperlink")) {
                    val id = attr(parser, "Id") ?: ""
                    val target = attr(parser, "Target") ?: ""
                    if (id.isNotEmpty()) map[id] = target
                }
            }
            event = parser.next()
        }
        return map
    }

    private fun parseRelTypes(bytes: ByteArray): Map<String, String> {
        val parser = parser(bytes)
        val map = HashMap<String, String>()
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && tag(parser.name) == "Relationship") {
                val id = attr(parser, "Id") ?: ""
                val type = attr(parser, "Type") ?: ""
                if (id.isNotEmpty()) map[id] = type.substringAfterLast('/')
            }
            event = parser.next()
        }
        return map
    }

    private class Pending(val target: String, val aspect: Float)

    private class RunProps {
        var bold = false; var italic = false; var underline = false; var strike = false
        var color: Long? = null; var highlight: Long? = null; var size: Float? = null
        fun reset() { bold = false; italic = false; underline = false; strike = false; color = null; highlight = null; size = null }
    }

    private class ParaState {
        val spans = mutableListOf<StyledRun>()
        var heading = 0; var list = false; var numId = -1; var level = 0
        var center = false; var right = false; var indent = 0
        fun clear() { spans.clear(); heading = 0; list = false; numId = -1; level = 0; center = false; right = false; indent = 0 }
    }

    private fun parseBody(
        bytes: ByteArray,
        formats: Map<Int, Map<Int, String>>,
        rels: Map<String, String>,
        links: Map<String, String>,
    ): Pair<List<Any>, Map<String, Float>> {
        val parser = parser(bytes)
        val out = mutableListOf<Any>()
        val images = HashMap<String, Float>()
        val counters = HashMap<String, Int>()

        val para = ParaState()
        var inPara = false
        var inRun = false
        val props = RunProps()
        var runText = StringBuilder()
        var linkTarget: String? = null
        val linkStack = ArrayDeque<String?>()

        var tableDepth = 0
        val rows = mutableListOf<MutableList<StyledPara>>()
        val cell = mutableListOf<StyledRun>()
        var inCell = false
        val widths = mutableListOf<Float>()
        var inGrid = false
        var pendingAspect = 1.414f

        fun flush() {
            val hasText = para.spans.any { it.text.isNotBlank() }
            if (!hasText && para.heading == 0) return
            val marker = when {
                para.list && para.numId >= 0 -> markerFor(formats, counters, para.numId, para.level)
                para.list -> "•"
                else -> null
            }
            out += DocBlock.Para(
                StyledPara(
                    runs = para.spans.toList(), heading = para.heading, marker = marker,
                    indent = para.indent, center = para.center, right = para.right,
                ),
            )
        }

        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (tag(parser.name)) {
                    "p" -> if (tableDepth == 0) { para.clear(); inPara = true }
                    "pStyle" -> if (tableDepth == 0) {
                        para.heading = when (attr(parser, "w:val")) {
                            "Title", "Heading1" -> 1
                            "Heading2" -> 2
                            "Heading3", "Heading4", "Heading5", "Heading6" -> 3
                            else -> 0
                        }
                    }
                    "numPr" -> if (tableDepth == 0) para.list = true
                    "ilvl" -> if (tableDepth == 0) para.level = (attr(parser, "w:val")?.toIntOrNull() ?: 0).coerceIn(0, 5)
                    "numId" -> if (tableDepth == 0) para.numId = attr(parser, "w:val")?.toIntOrNull() ?: -1
                    "jc" -> if (tableDepth == 0) {
                        para.center = attr(parser, "w:val") == "center"
                        para.right = attr(parser, "w:val") == "right"
                    }
                    "ind" -> if (tableDepth == 0) {
                        val left = attr(parser, "w:left") ?: attr(parser, "w:start") ?: "0"
                        para.indent = ((left.toIntOrNull() ?: 0) / 720).coerceIn(0, 6)
                    }
                    "r" -> { inRun = true; props.reset(); runText = StringBuilder() }
                    "b" -> if (inRun) props.bold = on(parser)
                    "i" -> if (inRun) props.italic = on(parser)
                    "u" -> if (inRun) props.underline = attr(parser, "w:val")?.let { it != "none" } ?: true
                    "strike" -> if (inRun) props.strike = on(parser)
                    "color" -> if (inRun) attr(parser, "w:val")?.takeIf { it != "auto" && it.length >= 6 }?.let { props.color = it.takeLast(6).toLongOrNull(16) }
                    "highlight" -> if (inRun) props.highlight = highlights[attr(parser, "w:val")]
                    "sz" -> if (inRun) props.size = (attr(parser, "w:val")?.toIntOrNull() ?: 0) / 2f
                    "t" -> if (inRun) runText.append(parser.nextText())
                    "tab" -> if (inRun) runText.append("    ")
                    "br" -> if (inRun) runText.append('\n')
                    "extent" -> {
                        val cx = attr(parser, "cx")?.toLongOrNull() ?: 0L
                        val cy = attr(parser, "cy")?.toLongOrNull() ?: 0L
                        if (cx > 0 && cy > 0) pendingAspect = cx.toFloat() / cy
                    }
                    "blip" -> {
                        val rid = attr(parser, "r:embed") ?: attr(parser, "embed")
                        val target = rid?.let { rels[it] }?.let { mediaPath(it) }
                        if (target != null && images.size < 30) {
                            val aspect = if (pendingAspect > 0f) pendingAspect else 1.414f
                            images[target] = aspect
                            if (tableDepth == 0) {
                                flush(); inPara = false
                                out += Pending(target, aspect)
                            }
                        }
                    }
                    "hyperlink" -> { linkStack.addLast(linkTarget); linkTarget = attr(parser, "r:id")?.let { links[it] } }
                    "footnoteReference" -> if (inRun) runText.append("[${attr(parser, "w:id") ?: ""}]")
                    "tbl" -> { tableDepth++; if (tableDepth == 1) { rows.clear(); widths.clear() } }
                    "tblGrid" -> inGrid = tableDepth == 1
                    "gridCol" -> if (inGrid) widths += (attr(parser, "w:w")?.toFloatOrNull() ?: 100f).coerceAtLeast(1f)
                    "tr" -> if (tableDepth == 1) rows.add(mutableListOf())
                    "tc" -> if (tableDepth == 1) { inCell = true; cell.clear() }
                }
                XmlPullParser.END_TAG -> when (tag(parser.name)) {
                    "r" -> {
                        if (runText.isNotEmpty()) {
                            val span = StyledRun(
                                text = runText.toString(), bold = props.bold, italic = props.italic,
                                underline = props.underline, strike = props.strike,
                                colorArgb = props.color, highlightArgb = props.highlight, sizeSp = props.size,
                                link = linkTarget,
                            )
                            if (inCell) cell += span else if (inPara) para.spans += span
                        }
                        inRun = false
                    }
                    "hyperlink" -> linkTarget = linkStack.removeLastOrNull()
                    "p" -> if (tableDepth > 0) {
                        if (inCell && cell.isNotEmpty()) cell += StyledRun("\n")
                    } else if (inPara) {
                        flush(); inPara = false
                    }
                    "tc" -> if (tableDepth == 1) {
                        if (cell.isNotEmpty() && cell.last().text == "\n") cell.removeAt(cell.size - 1)
                        rows.lastOrNull()?.add(StyledPara(runs = cell.toList()))
                        inCell = false
                    }
                    "tblGrid" -> inGrid = false
                    "tbl" -> {
                        if (tableDepth == 1 && rows.isNotEmpty()) {
                            val total = widths.sum()
                            val cols = rows.maxOf { it.size }.coerceAtLeast(1)
                            val fractions = if (widths.isEmpty() || total <= 0f) {
                                List(cols) { 1f / cols }
                            } else widths.map { it / total }
                            out += DocBlock.Table(DocTable(rows.map { it.toList() }, fractions))
                        }
                        tableDepth = (tableDepth - 1).coerceAtLeast(0)
                    }
                }
            }
            event = parser.next()
        }
        if (inPara) flush()

        val targets = HashMap<String, Float>()
        images.forEach { (path, aspect) -> targets[mediaPath(path)] = aspect }
        return out to targets
    }

    private fun markerFor(formats: Map<Int, Map<Int, String>>, counters: HashMap<String, Int>, numId: Int, level: Int): String {
        val fmt = formats[numId]?.get(level) ?: formats[numId]?.get(0) ?: "bullet"
        val key = "$numId:$level"
        return when (fmt) {
            "bullet" -> when (level % 3) { 1 -> "◦"; 2 -> "▪"; else -> "•" }
            "decimal" -> { val n = (counters[key] ?: 0) + 1; counters[key] = n; "$n." }
            "lowerLetter" -> { val n = (counters[key] ?: 0) + 1; counters[key] = n; "${'a' + ((n - 1) % 26)}." }
            "upperLetter" -> { val n = (counters[key] ?: 0) + 1; counters[key] = n; "${'A' + ((n - 1) % 26)}." }
            "lowerRoman" -> "i."
            "upperRoman" -> "I."
            else -> "•"
        }
    }

    private fun mediaPath(target: String): String = when {
        target.startsWith("/") -> target.removePrefix("/").let { if (it.startsWith("word/")) it else "word/$it" }
        target.startsWith("word/") -> target
        else -> "word/$target"
    }

    private fun parseRels(bytes: ByteArray): Map<String, String> {
        val parser = parser(bytes)
        val map = HashMap<String, String>()
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && tag(parser.name) == "Relationship") {
                val id = attr(parser, "Id")
                val target = attr(parser, "Target")
                if (id != null && target != null && attr(parser, "TargetMode") != "External") map[id] = target
            }
            event = parser.next()
        }
        return map
    }

    /** numId → (ilvl → numFmt). abstractNumId is an ATTRIBUTE of w:num. */
    private fun parseNumbering(bytes: ByteArray): Map<Int, Map<Int, String>> {
        val parser = parser(bytes)
        val abstracts = HashMap<Int, Map<Int, String>>()
        val result = HashMap<Int, Map<Int, String>>()
        var abstractId = -1
        var level = 0
        val fmts = HashMap<Int, String>()
        var numId = -1
        var numAbstract = -1

        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (tag(parser.name)) {
                    "abstractNum" -> { abstractId = attr(parser, "w:abstractNumId")?.toIntOrNull() ?: -1; fmts.clear() }
                    "lvl" -> level = attr(parser, "w:ilvl")?.toIntOrNull() ?: 0
                    "numFmt" -> if (abstractId >= 0) fmts[level] = attr(parser, "w:val") ?: "bullet"
                    "num" -> { numId = attr(parser, "w:numId")?.toIntOrNull() ?: -1; numAbstract = -1 }
                    "abstractNumId" -> if (numId >= 0) numAbstract = attr(parser, "w:val")?.toIntOrNull() ?: -1
                }
                XmlPullParser.END_TAG -> when (tag(parser.name)) {
                    "abstractNum" -> { if (abstractId >= 0) abstracts[abstractId] = fmts.toMap(); abstractId = -1 }
                    "num" -> {
                        if (numId >= 0 && numAbstract >= 0) abstracts[numAbstract]?.let { result[numId] = it }
                        numId = -1
                    }
                }
            }
            event = parser.next()
        }
        return result
    }

    private fun on(parser: XmlPullParser): Boolean = attr(parser, "w:val")?.let { it != "0" && it != "false" } ?: true

    fun decode(name: String, bytes: ByteArray, maxDim: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        val max = maxOf(bounds.outWidth, bounds.outHeight)
        while (max / (sample * 2) >= maxDim) sample *= 2
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    }

    private val maxEntryBytes = 48L * 1024 * 1024

    /** One zip entry with a hard ceiling — crafted/huge archives can't OOM the reader. */
    private fun read(name: String, zip: ZipInputStream): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
            val n = zip.read(buf)
            if (n < 0) break
            total += n
            if (total > maxEntryBytes) throw java.io.IOException("Zip entry too large")
            out.write(buf, 0, n)
        }
        return out.toByteArray()
    }

    private fun parser(bytes: ByteArray): XmlPullParser {
        val p = Xml.newPullParser()
        p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        p.setInput(ByteArrayInputStream(bytes), null)
        return p
    }

    private fun tag(name: String): String = name.substringAfterLast(':')

    private fun attr(parser: XmlPullParser, name: String): String? {
        val short = name.substringAfterLast(':')
        for (i in 0 until parser.attributeCount) {
            val n = parser.getAttributeName(i)
            if (n == name || n.substringAfterLast(':') == short) return parser.getAttributeValue(i)
        }
        return null
    }
}
