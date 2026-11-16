package com.localdesk.mobile.docs

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.zip.ZipInputStream

/**
 * CSV (RFC-4180 state machine) + XLSX (workbook → rels → ALL sheets → sharedStrings →
 * styles for number/date formats + column widths + merges + frozen panes + chart count).
 * Caps: 20 sheets × 3000 rows × 60 columns, 48 MB per zip entry.
 */
object Grid {

    const val MAX_ROWS = 3000
    const val MAX_COLUMNS = 60
    private const val MAX_SHEETS = 20

    fun csv(text: String): WorkbookData =
        WorkbookData(listOf(SheetData("Sheet 1", parseCsv(text), emptyList())))

    fun parseCsv(text: String): GridData {
        val rows = mutableListOf<List<String>>()
        val cell = StringBuilder()
        val row = mutableListOf<String>()
        var quoted = false
        var i = 0
        while (i < text.length) {
            val c = text[i]
            when {
                quoted -> if (c == '"') {
                    if (i + 1 < text.length && text[i + 1] == '"') { cell.append('"'); i++ } else quoted = false
                } else cell.append(c)
                c == '"' -> quoted = true
                c == ',' -> { row += cell.toString(); cell.clear() }
                c == '\r' -> Unit
                c == '\n' -> {
                    row += cell.toString(); cell.clear()
                    if (row.any { it.isNotEmpty() }) rows += row.toList()
                    row.clear()
                }
                else -> cell.append(c)
            }
            i++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) {
            row += cell.toString()
            if (row.any { it.isNotEmpty() }) rows += row.toList()
        }
        return GridData(rows.take(MAX_ROWS).map { it.take(MAX_COLUMNS) }, rows.size > MAX_ROWS)
    }

    fun xlsx(openZip: () -> ZipInputStream): WorkbookData {
        var workbook: ByteArray? = null
        var rels: ByteArray? = null
        var shared: ByteArray? = null
        var styles: ByteArray? = null
        val sheetRels = linkedMapOf<String, ByteArray>() // "xl/worksheets/_rels/sheetN.xml.rels"

        openZip().use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                when (entry.name) {
                    "xl/workbook.xml" -> workbook = read(zip)
                    "xl/_rels/workbook.xml.rels" -> rels = read(zip)
                    "xl/sharedStrings.xml" -> shared = read(zip)
                    "xl/styles.xml" -> styles = read(zip)
                }
                if (entry.name.startsWith("xl/worksheets/_rels/")) sheetRels[entry.name] = read(zip)
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
        val wb = workbook ?: throw IllegalStateException("xl/workbook.xml missing")
        val relBytes = rels ?: throw IllegalStateException("workbook rels missing")

        val sheetList = sheetEntries(wb).take(MAX_SHEETS)
        if (sheetList.isEmpty()) throw IllegalStateException("no sheets in workbook")
        val relMap = relsMap(relBytes)

        val numFormats = styles?.let { numFormats(it) } ?: NumFormats()
        val sharedStrings = shared?.let { sharedStrings(it) } ?: emptyList()

        fun normalizeXl(t: String): String =
            if (t.startsWith("/")) t.removePrefix("/") else if (t.startsWith("xl/")) t else "xl/$t"

        val wantedPaths = HashSet(sheetList.mapNotNull { (_, rid) -> relMap[rid]?.let { normalizeXl(it) } })
        val sheetBytes = linkedMapOf<String, ByteArray>()
        val relsBytes = linkedMapOf<String, ByteArray>()
        openZip().use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                if (entry.name in wantedPaths) sheetBytes[entry.name] = read(zip)
                if (entry.name.startsWith("xl/worksheets/_rels/")) relsBytes[entry.name] = read(zip)
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }

        val sheets = sheetList.mapNotNull { (name, rid) ->
            val target = relMap[rid] ?: return@mapNotNull null
            val path = normalizeXl(target)
            val bytes = sheetBytes[path] ?: return@mapNotNull null
            val drawingRels = relsBytes["xl/worksheets/_rels/" + path.substringAfterLast('/') + ".rels"]
            val charts = drawingRels?.let { dr ->
                val drawingTarget = relsMap(dr).values.firstOrNull { it.contains("drawing") } ?: return@let 0
                val drawingPath = normalizeXl(drawingTarget.removePrefix("../"))
                sheetBytes[drawingPath]?.toString(kotlin.text.Charsets.ISO_8859_1)
                    ?.split("graphicFrame")?.size?.minus(1)?.coerceAtLeast(0) ?: 0
            } ?: 0
            SheetData(
                name = name,
                grid = sheet(bytes, sharedStrings, numFormats),
                frozenCols = frozenCols(bytes),
                charts = charts,
            )
        }
        return WorkbookData(sheets)
    }

    // ---- workbook ----
    private data class SheetEntry(val name: String, val rid: String)

    private fun sheetEntries(bytes: ByteArray): List<SheetEntry> {
        val parser = parser(bytes)
        var event = parser.eventType
        val out = mutableListOf<SheetEntry>()
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && tag(parser.name) == "sheet") {
                val name = attr(parser, "name") ?: "Sheet"
                val rid = attr(parser, "r:id") ?: attr(parser, "id") ?: ""
                out += SheetEntry(name, rid)
            }
            event = parser.next()
        }
        return out
    }

    private fun relsMap(bytes: ByteArray): Map<String, String> {
        val parser = parser(bytes)
        var event = parser.eventType
        val out = linkedMapOf<String, String>()
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && tag(parser.name) == "Relationship") {
                val id = attr(parser, "Id") ?: ""
                val target = attr(parser, "Target") ?: ""
                if (id.isNotEmpty()) out[id] = target
            }
            event = parser.next()
        }
        return out
    }

    // ---- styles: number formats + column widths + merges are read from the sheet ----
    class NumFormats(val custom: Map<Int, String> = emptyMap()) {
        fun code(id: Int?): String? = when (id) {
            null -> null
            in 14..22, in 45..47, in 27..36 -> "date" // built-in date/time formats
            else -> custom[id]
        }
    }

    private fun numFormats(bytes: ByteArray): NumFormats {
        val parser = parser(bytes)
        var event = parser.eventType
        val custom = linkedMapOf<Int, String>()
        var inNumFmt = false
        var fmtId = -1
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> if (tag(parser.name) == "numFmt") {
                    inNumFmt = true
                    fmtId = attr(parser, "numFmtId")?.toIntOrNull() ?: -1
                }
                XmlPullParser.END_TAG -> if (tag(parser.name) == "numFmt") inNumFmt = false
                XmlPullParser.TEXT -> if (inNumFmt && fmtId >= 0) custom[fmtId] = parser.text
            }
            event = parser.next()
        }
        return NumFormats(custom)
    }

    private fun isDateCode(code: String?): Boolean {
        if (code == null) return false
        if (code == "date") return true
        val cleaned = code.replace(Regex("\\[[^]]*]"), "").replace("\"[^\"]*\"", "")
        return cleaned.any { it in "yYdD" } || (cleaned.contains('m') && cleaned.contains(':'))
    }

    private fun isPercent(code: String?): Boolean = code?.contains('%') == true

    private fun formatValue(raw: String, code: String?): String {
        val v = raw.toDoubleOrNull() ?: return raw
        if (isDateCode(code)) {
            val days = v.toLong()
            val frac = v - days
            val date = LocalDate.of(1899, 12, 30).plusDays(days)
            return if (frac > 0.0005) {
                val secs = (frac * 86400).toInt()
                val time = LocalTime.of(secs / 3600, (secs % 3600) / 60, secs % 60)
                date.format(DateTimeFormatter.ISO_DATE) + " " + time.format(DateTimeFormatter.ofPattern("HH:mm"))
            } else date.format(DateTimeFormatter.ISO_DATE)
        }
        return when {
            isPercent(code) -> trimZeros(String.format(java.util.Locale.US, "%.2f%%", v * 100))
            code?.contains("0.00") == true -> String.format(java.util.Locale.US, "%.2f", v)
            else -> trimZeros(if (kotlin.math.abs(v) >= 1e10) String.format(java.util.Locale.US, "%.4E", v) else String.format(java.util.Locale.US, "%.4f", v))
        }
    }

    private fun trimZeros(s: String): String = s.replace(Regex("0+$"), "").replace(Regex("\\.$"), "")

    private fun sharedStrings(bytes: ByteArray): List<String> {
        val parser = parser(bytes)
        val out = mutableListOf<String>()
        val sb = StringBuilder()
        var inItem = false
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> if (tag(parser.name) == "si") { inItem = true; sb.clear() }
                XmlPullParser.TEXT -> if (inItem) sb.append(parser.text)
                XmlPullParser.END_TAG -> if (tag(parser.name) == "si") { out += sb.toString(); inItem = false }
            }
            event = parser.next()
        }
        return out
    }

    private fun frozenCols(bytes: ByteArray): Int {
        val parser = parser(bytes)
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && tag(parser.name) == "pane") {
                val xs = attr(parser, "xSplit")?.toIntOrNull() ?: 0
                if (xs > 0) return xs.coerceAtMost(MAX_COLUMNS)
            }
            event = parser.next()
        }
        return 0
    }

    /** "BC12" -> 0-based column index. */
    fun columnOf(ref: String): Int {
        var index = 0
        for (ch in ref) {
            if (ch !in 'A'..'Z') break
            index = index * 26 + (ch - 'A' + 1)
        }
        return (index - 1).coerceAtLeast(0)
    }

    private fun columnWidths(bytes: ByteArray): List<Float> {
        val parser = parser(bytes)
        var event = parser.eventType
        val out = mutableListOf<Float>()
        var min = 0; var max = 0; var width = 0f; var inCol = false
        data class Col(val min: Int, val max: Int, val width: Float)
        val cols = mutableListOf<Col>()
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> if (tag(parser.name) == "col") {
                    inCol = true
                    min = attr(parser, "min")?.toIntOrNull() ?: 0
                    max = attr(parser, "max")?.toIntOrNull() ?: min
                    width = attr(parser, "width")?.toFloatOrNull() ?: 8.43f
                }
                XmlPullParser.END_TAG -> if (tag(parser.name) == "col") {
                    inCol = false
                    cols += Col(min, max, width)
                }
            }
            event = parser.next()
        }
        val lastCol = cols.maxOfOrNull { it.max } ?: 0
        for (c in 1..lastCol) {
            val col = cols.firstOrNull { c >= it.min && c <= it.max }
            out += ((col?.width ?: 8.43f) * 3f).coerceIn(56f, 320f)
        }
        if (out.isEmpty()) out += 100f
        return out
    }

    private fun sheet(bytes: ByteArray, shared: List<String>, formats: NumFormats): GridData {
        val colDp = columnWidths(bytes)
        val colCount = colDp.size
        val parser = parser(bytes)
        val rowMap = linkedMapOf<Int, MutableList<Pair<String, Int?>>>() // col -> (value, styleId)
        var row = -1
        var cellType = "n"
        var cellRef = ""
        var cellStyle: Int? = null
        var collect = false

        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (tag(parser.name)) {
                    "row" -> {
                        row = (attr(parser, "r")?.toIntOrNull() ?: (rowMap.size + 1)) - 1
                        if (row in 0 until MAX_ROWS) rowMap.getOrPut(row) { mutableListOf() }
                    }
                    "c" -> {
                        cellRef = attr(parser, "r") ?: ""
                        cellType = attr(parser, "t") ?: "n"
                        cellStyle = attr(parser, "s")?.toIntOrNull()
                        collect = false
                    }
                    "v" -> collect = true
                    "t" -> if (cellType == "inlineStr") collect = true
                }
                XmlPullParser.TEXT -> if (collect && row >= 0 && rowMap.containsKey(row)) {
                    val col = columnOf(cellRef)
                    if (col < MAX_COLUMNS) {
                        val code = cellStyle?.let { formats.code(it) }
                        val value = when (cellType) {
                            "s" -> shared.getOrNull(parser.text.toIntOrNull() ?: -1) ?: ""
                            "b" -> if (parser.text == "1") "TRUE" else "FALSE"
                            "str", "inlineStr" -> parser.text
                            else -> if (cellStyle != null) formatValue(parser.text, code) else parser.text
                        }
                        val cells = rowMap[row]!!
                        while (cells.size <= col) cells += "" to null
                        cells[col] = value to cellStyle
                    }
                }
                XmlPullParser.END_TAG -> when (tag(parser.name)) {
                    "v", "t" -> collect = false
                    "c" -> { cellType = "n"; cellRef = ""; cellStyle = null }
                }
            }
            event = parser.next()
        }

        val cols = maxOf(rowMap.values.maxOfOrNull { it.size } ?: 0, colCount)
        val rows = rowMap.keys.sorted().map { key ->
            val cells = rowMap[key] ?: emptyList()
            (0 until cols).map { cells.getOrElse(it) { "" to null }.first }
        }

        // mergeCells: keep the anchor value, blank covered cells
        val merged = applyMerges(bytes, rows)
        val truncated = merged.size >= MAX_ROWS || cols >= MAX_COLUMNS
        return GridData(merged.take(MAX_ROWS).map { it.take(MAX_COLUMNS) }, truncated)
    }

    private fun applyMerges(bytes: ByteArray, rows: List<List<String>>): List<List<String>> {
        val parser = parser(bytes)
        var event = parser.eventType
        data class Merge(val r1: Int, val c1: Int, val r2: Int, val c2: Int)
        val merges = mutableListOf<Merge>()
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && tag(parser.name) == "mergeCell") {
                val ref = attr(parser, "ref") ?: continue
                val parts = ref.split(":")
                if (parts.size == 2) {
                    val (r1, c1) = rcOf(parts[0])
                    val (r2, c2) = rcOf(parts[1])
                    merges += Merge(r1, c1, r2, c2)
                }
            }
            event = parser.next()
        }
        if (merges.isEmpty()) return rows
        val out = rows.map { it.toMutableList() }
        merges.forEach { m ->
            for (r in m.r1..minOf(m.r2, out.lastIndex)) {
                for (c in m.c1..minOf(m.c2, out[r].size - 1)) {
                    if (!(r == m.r1 && c == m.c1)) out[r][c] = ""
                }
            }
        }
        return out
    }

    private fun rcOf(ref: String): Pair<Int, Int> {
        val letters = ref.takeWhile { it in 'A'..'Z' }
        val digits = ref.drop(letters.length)
        return ((digits.toIntOrNull() ?: 1) - 1) to (columnOf(letters))
    }

    private val maxEntryBytes = 48L * 1024 * 1024

    /** One zip entry with a hard ceiling. */
    private fun read(zip: ZipInputStream): ByteArray {
        val out = ByteArrayOutputStream()
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
