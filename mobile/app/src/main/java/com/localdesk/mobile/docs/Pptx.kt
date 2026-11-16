package com.localdesk.mobile.docs

import android.graphics.Bitmap
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

/**
 * PPTX parser → true slide canvases. Shapes keep their authored a:xfrm positions (EMU →
 * fractions), text carries per-run size/color (srgbClr + schemeClr via theme1.xml), slide
 * backgrounds come from p:bg, pictures resolve through slide rels. Two passes over the
 * archive. Rule: compare [tag]() — namespaces-off names are qualified ("p:sp").
 */
object Pptx {

    private const val MAX_SLIDES = 80
    private const val MAX_SHAPES = 48
    const val EMU_PER_INCH = 914400f

    fun parse(openZip: () -> ZipInputStream): List<Slide> {
        var presentation: ByteArray? = null
        var theme: ByteArray? = null
        val slideBytes = sortedMapOf<Int, ByteArray>()
        val slideRels = sortedMapOf<Int, ByteArray>()

        openZip().use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                Regex("^ppt/slides/slide(\\d+)\\.xml$").matchEntire(entry.name)?.let {
                    slideBytes[it.groupValues[1].toInt()] = read(zip)
                }
                Regex("^ppt/slides/_rels/slide(\\d+)\\.xml\\.rels$").matchEntire(entry.name)?.let {
                    slideRels[it.groupValues[1].toInt()] = read(zip)
                }
                when (entry.name) {
                    "ppt/presentation.xml" -> presentation = read(zip)
                    "ppt/theme/theme1.xml" -> theme = read(zip)
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }

        val themeColors = theme?.let { themeColors(it) } ?: defaults()
        val (widthEmu, heightEmu) = presentation?.let { slideSize(it) } ?: (12192000L to 6858000L)

        class PicRef(val rid: String, val x: Float, val y: Float, val w: Float, val h: Float)
        val picRefs = HashMap<Int, MutableList<PicRef>>()
        val slides = mutableListOf<Slide>()

        for ((number, bytes) in slideBytes) {
            if (slides.size >= MAX_SLIDES) break
            val rels = slideRels[number]?.let { rels(it) } ?: emptyMap()
            val shapes = mutableListOf<SlideShape>()

            val parser = parser(bytes)
            var event = parser.eventType
            var inSp = false
            var inPic = false
            var inBody = false
            var inBg = false
            var inRun = false
            var fillSource = false
            var inFrame = false
            var inTbl = false
            var frameChart = false
            val tblRows = mutableListOf<MutableList<StringBuilder>>()
            var tblCell = StringBuilder()

            var x = -1f; var y = -1f; var w = -1f; var h = -1f
            var placed = false
            var title = false
            var shapeFill: Long? = null
            var slideBg: Long? = null
            var rounded = false
            var geometry = false
            var picRid: String? = null

            val paras = mutableListOf<SlidePara>()
            val runs = mutableListOf<SlideRun>()
            var runText = StringBuilder()
            var runSize: Float? = null
            var runBold = false
            var runItalic = false
            var runColor: Long? = null
            var bullet: String? = null
            var center = false

            fun flush() {
                if (shapes.size >= MAX_SHAPES) return
                val fx = if (placed) x else -1f
                val fy = if (placed) y else -1f
                val fw = if (placed) w else -1f
                val fh = if (placed) h else -1f
                val textParas = paras.filter { p -> p.runs.any { it.text.isNotBlank() } }
                when {
                    inPic -> {
                        val target = picRid?.let { rels[it] }?.let { mediaPath(it) }
                        if (target != null) {
                            picRefs.getOrPut(number) { mutableListOf() } += PicRef(target, fx, fy, fw, fh)
                            shapes += SlideShape.Picture(fx, fy, fw, fh, null)
                        }
                    }
                    textParas.isNotEmpty() -> shapes += SlideShape.Text(fx, fy, fw, fh, title, shapeFill, textParas)
                    shapeFill != null && geometry && placed -> shapes += SlideShape.Block(fx, fy, fw, fh, shapeFill!!, rounded)
                }
                paras.clear()
            }

            while (event != XmlPullParser.END_DOCUMENT) {
                when (event) {
                    XmlPullParser.START_TAG -> when (tag(parser.name)) {
                        "sp" -> { inSp = true; inBody = false; title = false; shapeFill = null; rounded = false; geometry = false; placed = false; paras.clear() }
                        "pic" -> { inPic = true; inBody = false; picRid = null; placed = false }
                        "graphicFrame" -> { inFrame = true; inTbl = false; frameChart = false; tblRows.clear(); placed = false; x = -1f; y = -1f; w = -1f; h = -1f }
                        "txBody" -> if (!inFrame) inBody = true
                        "bg" -> inBg = true
                        "xfrm" -> placed = true
                        "off" -> if (placed && (inSp || inPic || inFrame)) {
                            x = (attr(parser, "x")?.toLongOrNull() ?: 0L) / widthEmu.toFloat()
                            y = (attr(parser, "y")?.toLongOrNull() ?: 0L) / heightEmu.toFloat()
                        }
                        "ext" -> if (placed && (inSp || inPic || inFrame)) {
                            w = (attr(parser, "cx")?.toLongOrNull() ?: 0L) / widthEmu.toFloat()
                            h = (attr(parser, "cy")?.toLongOrNull() ?: 0L) / heightEmu.toFloat()
                        }
                        "tbl" -> if (inFrame) inTbl = true
                        "tr" -> if (inFrame && inTbl) tblRows.add(mutableListOf())
                        "tc" -> if (inFrame && inTbl) tblCell = StringBuilder()
                        "graphicData" -> if (inFrame) frameChart = (attr(parser, "uri") ?: "").contains("/chart")
                        "prstGeom" -> { geometry = true; rounded = attr(parser, "prst") == "roundRect" }
                        "ph" -> title = attr(parser, "type") == "title" || attr(parser, "type") == "ctrTitle"
                        "p" -> if (inBody) { runs.clear(); bullet = null; center = false }
                        "pPr" -> if (inBody) center = attr(parser, "algn") == "ctr"
                        "buChar" -> bullet = attr(parser, "char") ?: "•"
                        "buAutoNum" -> bullet = "1."
                        "buNone" -> bullet = null
                        "r" -> if (inBody) {
                            inRun = true
                            runText = StringBuilder()
                            runSize = null; runBold = false; runItalic = false; runColor = null
                        }
                        "rPr" -> if (inRun) {
                            runSize = (attr(parser, "sz")?.toIntOrNull() ?: 0) / 100f
                            runBold = attr(parser, "b") == "1" || attr(parser, "b") == "true"
                            runItalic = attr(parser, "i") == "1" || attr(parser, "i") == "true"
                        }
                        "solidFill" -> if (inRun || (inSp && !inBody) || inBg) fillSource = true
                        "srgbClr" -> if (fillSource) {
                            attr(parser, "val")?.takeIf { it.length >= 6 }?.let {
                                val argb = it.takeLast(6).toLongOrNull(16)?.plus(0xFF000000L)
                                when {
                                    inRun -> runColor = argb
                                    inSp && !inBody -> shapeFill = argb
                                    inBg -> slideBg = argb
                                }
                            }
                            fillSource = false
                        }
                        "schemeClr" -> if (fillSource) {
                            themeColors[attr(parser, "val")]?.let { argb ->
                                when {
                                    inRun -> runColor = argb
                                    inSp && !inBody -> shapeFill = argb
                                    inBg -> slideBg = argb
                                }
                            }
                            fillSource = false
                        }
                        "t" -> when {
                            inRun -> runText.append(parser.nextText())
                            inFrame && inTbl -> tblCell.append(parser.nextText())
                        }
                        "blip" -> if (inPic) picRid = attr(parser, "r:embed") ?: attr(parser, "embed")
                    }
                    XmlPullParser.END_TAG -> when (tag(parser.name)) {
                        "r" -> {
                            if (inRun) runs += SlideRun(runText.toString(), runSize, runBold, runItalic, runColor)
                            inRun = false
                        }
                        "p" -> if (inBody) paras += SlidePara(runs.toList(), bullet, center)
                        "txBody" -> inBody = false
                        "bg" -> inBg = false
                        "solidFill" -> fillSource = false
                        "sp" -> { flush(); inSp = false }
                        "pic" -> { flush(); inPic = false }
                        "tc" -> if (inFrame && inTbl) tblRows.lastOrNull()?.add(tblCell)
                        "graphicFrame" -> {
                            if (shapes.size < MAX_SHAPES && placed) {
                                when {
                                    tblRows.isNotEmpty() -> shapes += SlideShape.Table(x, y, w, h, tblRows.map { r -> r.map { c -> c.toString() } })
                                    frameChart -> shapes += SlideShape.ChartCard(x, y, w, h)
                                }
                            }
                            inFrame = false; inTbl = false; frameChart = false; tblRows.clear()
                        }
                    }
                }
                event = parser.next()
            }
            if (inSp || inPic) flush()

            slides += Slide(number, widthEmu, heightEmu, slideBg, shapes.toList())
        }

        // Decode every referenced picture, then attach in declaration order per slide.
        val decoded = HashMap<String, Bitmap>()
        val allTargets = picRefs.values.flatten().map { it.rid }.toSet()
        if (allTargets.isNotEmpty()) {
            openZip().use { zip ->
                var entry = zip.nextEntry
                while (entry != null && decoded.size < allTargets.size) {
                    if (entry.name in allTargets) {
                        Docx.decode(entry.name, read(zip), 1024)?.let { decoded[entry.name] = it }
                    }
                    zip.closeEntry()
                    entry = zip.nextEntry
                }
            }
        }

        return slides.map { slide ->
            val refs = picRefs[slide.number] ?: emptyList()
            var index = 0
            slide.copy(shapes = slide.shapes.map { shape ->
                if (shape is SlideShape.Picture && index < refs.size) {
                    val ref = refs[index++]
                    SlideShape.Picture(shape.x, shape.y, shape.w, shape.h, decoded[ref.rid])
                } else shape
            })
        }
    }

    private fun slideSize(bytes: ByteArray): Pair<Long, Long> {
        val parser = parser(bytes)
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && tag(parser.name) == "sldSz") {
                return (attr(parser, "cx")?.toLongOrNull() ?: 12192000L) to
                    (attr(parser, "cy")?.toLongOrNull() ?: 6858000L)
            }
            event = parser.next()
        }
        return 12192000L to 6858000L
    }

    private fun themeColors(bytes: ByteArray): Map<String, Long> {
        val parser = parser(bytes)
        val map = HashMap<String, Long>()
        var slot: String? = null
        var inScheme = false
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (tag(parser.name)) {
                    "clrScheme" -> inScheme = true
                    "dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4",
                    "accent5", "accent6", "hlink", "folHlink",
                    -> if (inScheme) slot = tag(parser.name)
                    "srgbClr" -> if (slot != null) {
                        attr(parser, "val")?.takeIf { it.length >= 6 }?.let {
                            map[slot!!] = (it.takeLast(6).toLongOrNull(16) ?: 0L) + 0xFF000000L
                        }
                        slot = null
                    }
                    "sysClr" -> if (slot != null) {
                        attr(parser, "lastClr")?.takeIf { it.length >= 6 }?.let {
                            map[slot!!] = (it.takeLast(6).toLongOrNull(16) ?: 0L) + 0xFF000000L
                        }
                        slot = null
                    }
                }
                XmlPullParser.END_TAG -> if (tag(parser.name) == "clrScheme") inScheme = false
            }
            event = parser.next()
        }
        return map
    }

    private fun defaults(): Map<String, Long> = mapOf(
        "dk1" to 0xFF000000L, "lt1" to 0xFFFFFFFFL,
        "dk2" to 0xFF1C1B1AL, "lt2" to 0xFFE7E6E6L,
        "accent1" to 0xFFE1322EL, "accent2" to 0xFF1B7A43L,
        "accent3" to 0xFF4A4541L, "accent4" to 0xFF5B3A99L,
        "accent5" to 0xFF1E4E8CL, "accent6" to 0xFF9C4A10L,
        "hlink" to 0xFF1E4E8CL, "folHlink" to 0xFF8C1611L,
    )

    /** Slide rel targets are relative to ppt/slides/ — normalize "../media/x" etc. */
    private fun mediaPath(target: String): String {
        val t = target.trim().removePrefix("/")
        if (t.startsWith("ppt/")) return t
        val stack = ArrayDeque(listOf("ppt", "slides"))
        for (part in t.split('/')) {
            when (part) {
                "", "." -> Unit
                ".." -> if (stack.size > 1) stack.removeLast()
                else -> stack.addLast(part)
            }
        }
        return stack.joinToString("/")
    }

    private fun rels(bytes: ByteArray): Map<String, String> {
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

    private val maxEntryBytes = 48L * 1024 * 1024

    /** One zip entry with a hard ceiling. */
    private fun read(zip: ZipInputStream): ByteArray {
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
