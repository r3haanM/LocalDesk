package com.localdesk.mobile.docs

import java.io.ByteArrayOutputStream
import java.util.zip.Inflater

/**
 * Dependency-free PDF text extraction over raw document bytes.
 *
 * Scans indirect objects, walks each page's /Contents streams (FlateDecode), and
 * interprets the text-showing operators (Tj, TJ, quote ops) with Td/TD/Tm/T-star/TL line
 * positioning. Decodes literal + hex strings; honors /ToUnicode CMaps when a font
 * carries one, otherwise falls back to a WinAnsi-style latin mapping (standard-14
 * approximation — noted limitation for embedded subset fonts).
 *
 * Output: per-page lines with top-down y fractions + line-height fractions, enough
 * for in-document search, page-copy, and line-granular selection overlays. This is
 * an extraction approximation, not a full layout engine — good for search/copy,
 * not for pixel-perfect selection rectangles.
 */
object PdfText {

    private const val MAX_BYTES = 8L * 1024 * 1024

    data class Line(val yFrac: Float, val hFrac: Float, val text: String)
    data class PageText(val lines: List<Line>) {
        val plain: String by lazy { lines.joinToString("\n") { it.text } }
    }
    data class Doc(val pages: List<PageText>) {
        val pageCount: Int get() = pages.size
    }

    class TooLargeException : Exception("PDF exceeds text-extraction cap")

    /** Extract all pages. Throws [TooLargeException] when the bytes exceed the cap. */
    fun extract(bytes: ByteArray): Doc {
        if (bytes.size > MAX_BYTES) throw TooLargeException()
        val latin = String(bytes, kotlin.text.Charsets.ISO_8859_1)

        // ---- pass 1: object table (number+generation -> body between obj..endobj) ----
        val objects = HashMap<String, String>() // "n g" -> body (dict + stream bytes kept separately)
        val streams = HashMap<String, ByteArray>()
        val objRegex = Regex("(\\d+)\\s+(\\d+)\\s+obj")
        var idx = 0
        while (idx < latin.length) {
            val m = objRegex.find(latin, idx) ?: break
            val key = m.groupValues[1] + " " + m.groupValues[2]
            val bodyStart = m.range.last + 1
            val endObj = latin.indexOf("endobj", bodyStart)
            if (endObj < 0) break
            val body = latin.substring(bodyStart, endObj)
            idx = endObj + 6
            val streamAt = body.indexOf("stream")
            if (streamAt >= 0) {
                objects[key] = body.substring(0, streamAt)
                var s = streamAt + 6
                if (s < body.length && body[s] == '\r') s++
                if (s < body.length && body[s] == '\n') s++
                val e = body.lastIndexOf("endstream")
                if (e > s) streams[key] = body.substring(s, e).toByteArray(kotlin.text.Charsets.ISO_8859_1)
            } else {
                objects[key] = body
            }
        }

        // ---- pass 1.5: object streams (/Type /ObjStm) — modern writers pack the page
        // dictionaries inside compressed object streams; unpack them into the table ----
        for ((key, body) in objects.toList()) {
            if (!body.contains("/ObjStm")) continue
            val raw = streams[key] ?: continue
            val data = String(inflate(raw), kotlin.text.Charsets.ISO_8859_1)
            val header = data.substringBefore(data.firstOrNull { it == ' ' }?.toString() ?: " ").trim()
            val count = intOf(body, "/N") ?: continue
            val dataStart = intOf(body, "/First") ?: continue
            val first = listOf(count, dataStart)
            if (first.size < 2) continue
            val ints = data.substring(0, dataStart).trim().split(Regex("\\s+")).filter { it.isNotBlank() }.map { it.toInt() }
            for (i in 0 until count) {
                val num = ints.getOrNull(i * 2) ?: continue
                val off = ints.getOrNull(i * 2 + 1) ?: continue
                val endOff = ints.getOrNull((i + 1) * 2 + 1) ?: (data.length - dataStart)
                val objBody = data.substring(dataStart + off, dataStart + endOff)
                val objKey = "$num 0"
                if (!objects.containsKey(objKey)) objects[objKey] = objBody
            }
        }

        // ---- pass 2: page objects in document order ----
        data class Page(val contents: List<String>, val mediaBox: FloatArray, val fonts: Map<String, String>)
        val pages = mutableListOf<Page>()
        val fontMaps = HashMap<String, Map<Int, String>>() // font object key -> code map

        for ((key, body) in objects) {
            if (!body.contains("/Type") || !body.contains("/Page")) continue
            if (body.contains("/Pages") && !body.contains("/Kids")) continue
            val contents = refsOf(body, "/Contents")
            if (contents.isEmpty()) continue
            val mediaBox = floatArrayOf(body, "/MediaBox") ?: floatArrayOf(0f, 0f, 612f, 792f)
            val fonts = HashMap<String, String>()
            val resRef = refOf(body, "/Resources")
            if (resRef != null) {
                val resBody = objects[resRef] ?: ""
                // /Font may be inline or indirect
                val inline = resBody.substringAfter("/Font", "")
                if (inline.contains("<<")) {
                    nameRefPairs(inline.substringAfter("<<", "").substringBefore(">>"))
                        .forEach { (name, ref) -> fonts[name] = ref }
                }
                val fontRef = refOf(resBody, "/Font")
                if (fontRef != null) {
                    val fontDict = objects[fontRef] ?: ""
                    nameRefPairs(fontDict.substringAfter("<<", "").substringBefore(">>"))
                        .forEach { (name, ref) -> fonts[name] = ref }
                }
            }
            pages += Page(contents, mediaBox, fonts)
        }

        // ---- pass 3: fonts -> code maps (ToUnicode CMaps) ----
        fun codeMap(fontKey: String): Map<Int, String> {
            fontMaps[fontKey]?.let { return it }
            val body = objects[fontKey] ?: return emptyMap<Int, String>()
            val toUni = refOf(body, "/ToUnicode") ?: run {
                fontMaps[fontKey] = emptyMap()
                return emptyMap<Int, String>()
            }
            val raw = streams[toUni] ?: run {
                fontMaps[fontKey] = emptyMap()
                return emptyMap<Int, String>()
            }
            val data = String(inflate(raw), kotlin.text.Charsets.ISO_8859_1)
            val map = HashMap<Int, String>()
            val bfchar = Regex("beginbfchar(.*?)endbfchar", RegexOption.DOT_MATCHES_ALL)
            val bfrange = Regex("beginbfrange(.*?)endbfrange", RegexOption.DOT_MATCHES_ALL)
            bfchar.findAll(data).forEach { m ->
                Regex("<([0-9A-Fa-f]+)>\\s*<([0-9A-Fa-f]+)>").findAll(m.groupValues[1]).forEach { h ->
                    val code = h.groupValues[1].toInt(16)
                    map[code] = utf16(h.groupValues[2])
                }
            }
            bfrange.findAll(data).forEach { m ->
                val triples = Regex("<([0-9A-Fa-f]+)>\\s*<([0-9A-Fa-f]+)>\\s*<([0-9A-Fa-f]+)>")
                    .findAll(m.groupValues[1])
                val pairs = Regex("<([0-9A-Fa-f]+)>\\s*\\[(.*?)\\]").findAll(m.groupValues[1])
                triples.forEach { h ->
                    var code = h.groupValues[1].toInt(16)
                    val end = h.groupValues[2].toInt(16)
                    var dst = h.groupValues[3]
                    while (code <= end) {
                        map[code] = utf16(dst)
                        code++
                        dst = incrementHex(dst)
                    }
                }
                pairs.forEach { p ->
                    val code = p.groupValues[1].toInt(16)
                    val dst = Regex("<([0-9A-Fa-f]+)>").find(p.groupValues[2])?.groupValues[1]
                    if (dst != null) map[code] = utf16(dst)
                }
            }
            fontMaps[fontKey] = map
            return map
        }

        // ---- pass 4: per-page content interpretation ----
        val out = pages.map { page ->
            val sb = ByteArrayOutputStream()
            val raw = page.contents.mapNotNull { ref -> streams[ref] }.map { inflate(it) }
            val content = raw.concat() ?: return@map PageText(emptyList())
            PageText(interpret(content, page.mediaBox, page.fonts) { fontKey -> codeMap(fontKey) })
        }
        android.util.Log.d("PdfText", "pages=${out.size} lines0=${out.firstOrNull()?.lines?.size ?: -1} sample=${out.firstOrNull()?.lines?.firstOrNull()?.text ?: "-"}")
        return Doc(out)
    }

    // ---- content-stream interpreter ----
    private class LineAcc {
        val parts = StringBuilder()
        var x = 0f; var y = 0f; var size = 11f
    }

    private fun interpret(
        content: ByteArray,
        mediaBox: FloatArray,
        fonts: Map<String, String>,
        codeMap: (String) -> Map<Int, String>,
    ): List<Line> {
        val lines = mutableListOf<Line>()
        val text = String(content, kotlin.text.Charsets.ISO_8859_1)
        val pageH = (mediaBox[3] - mediaBox[1]).coerceAtLeast(1f)
        val pageW = (mediaBox[2] - mediaBox[0]).coerceAtLeast(1f)
        val acc = LineAcc()
        var inText = false
        var leading = 12f
        var fontKey = ""
        val stack = ArrayDeque<Any>() // numbers + decoded strings + array markers

        fun flushLine() {
            val t = acc.parts.toString().trim()
            if (t.isNotEmpty()) {
                val yFrac = ((pageH - acc.y) / pageH).coerceIn(0f, 1f)
                val hFrac = ((acc.size * 1.2f) / pageH).coerceIn(0.005f, 0.2f)
                lines += Line(yFrac, hFrac, t)
            }
            acc.parts.clear()
        }

        var i = 0
        val n = text.length
        while (i < n) {
            val c = text[i]
            when {
                c.isWhitespace() -> i++
                c == '(' -> {
                    val (bytes, next) = literalString(text, i)
                    stack.addLast(bytes); i = next
                }
                c == '<' && i + 1 < n && text[i + 1] != '<' -> {
                    val (bytes, next) = hexString(text, i)
                    stack.addLast(bytes); i = next
                }
                c == '[' -> { stack.addLast(ArrayMark); i++ }
                c == ']' -> i++
                c == '/' -> {
                    val e = consumeUntilWs(text, i + 1)
                    stack.addLast(Name(text.substring(i + 1, e))); i = e
                }
                c == '<' -> { // dict start — skip to matching >> (operators never live inside)
                    val e = text.indexOf(">>", i)
                    i = if (e < 0) n else e + 2
                }
                c == '-' || c == '+' || c == '.' || c.isDigit() -> {
                    val e = consumeUntilWs(text, i)
                    text.substring(i, e).toFloatOrNull()?.let { stack.addLast(it) }
                    i = e
                }
                c.isLetter() -> {
                    val e = consumeUntilWs(text, i)
                    val op = text.substring(i, e).trimEnd('*')
                    // operand helpers index from the END of the stack: 0 = last pushed
                    val str = { k: Int -> (stack.elementAtOrNull(stack.size - 1 - k) as? ByteArray) }
                    val num = { k: Int -> (stack.elementAtOrNull(stack.size - 1 - k) as? Float) }
                    when (op) {
                        "BT" -> { inText = true; flushLine() }
                        "ET" -> { if (inText) flushLine(); inText = false }
                        "Tf" -> {
                            fontKey = when (val f = stack.elementAtOrNull(stack.size - 2)) {
                                is Name -> fonts[f.value] ?: ""
                                else -> ""
                            }
                            acc.size = num(1) ?: acc.size
                        }
                        "Tm" -> {
                            val f2 = num(0) ?: 0f  // Tm a b c d e f — f is last
                            val e2 = num(1) ?: 0f
                            if (inText && acc.parts.isNotEmpty() && kotlin.math.abs(f2 - acc.y) > 0.5f) flushLine()
                            acc.x = e2; acc.y = f2
                        }
                        "Td" -> {
                            val ty = num(0) ?: 0f  // Td tx ty — ty is last
                            val tx = num(1) ?: 0f
                            if (inText && acc.parts.isNotEmpty() && kotlin.math.abs(ty) > 0.5f) flushLine()
                            acc.x += tx; acc.y += ty
                        }
                        "TD" -> {
                            val ty = num(0) ?: 0f
                            leading = -ty
                            if (inText && acc.parts.isNotEmpty() && kotlin.math.abs(ty) > 0.5f) flushLine()
                            acc.y += ty
                        }
                        "TL" -> { leading = num(0) ?: leading }
                        "T*" -> { if (inText && acc.parts.isNotEmpty()) flushLine(); acc.y -= leading }
                        "Tj" -> str(0)?.let { acc.parts.append(decodeString(it, fontKey, codeMap)) }
                        "'" -> { if (inText) flushLine(); acc.y -= leading; str(0)?.let { acc.parts.append(decodeString(it, fontKey, codeMap)) } }
                        "\"\"" -> {
                            str(0)?.let { acc.parts.append(decodeString(it, fontKey, codeMap)) }
                            if (inText) flushLine(); acc.y -= leading
                        }
                        "TJ" -> {
                            // array of strings + kerning numbers: big negative kern ≈ space
                            val buf = StringBuilder()
                            var idx = stack.indexOfLast { it is ArrayMark }
                            if (idx < 0) idx = 0
                            var k = idx + 1
                            while (k < stack.size) {
                                when (val v = stack[k]) {
                                    is ByteArray -> buf.append(decodeString(v, fontKey, codeMap))
                                    is Float -> if (buf.isNotEmpty() && v < -150f) buf.append(' ')
                                }
                                k++
                            }
                            acc.parts.append(buf)
                        }
                    }
                    stack.clear()
                    i = e
                }
                else -> i++
            }
        }
        if (acc.parts.isNotEmpty()) flushLine()
        // merge lines that share (nearly) the same y — wrap artefacts of TJ splits
        val merged = mutableListOf<Line>()
        for (l in lines) {
            val last = merged.lastOrNull()
            if (last != null && kotlin.math.abs(last.yFrac - l.yFrac) < 0.004f) {
                merged[merged.lastIndex] = last.copy(text = (last.text + " " + l.text).trim())
            } else merged += l
        }
        return merged
    }

    private object ArrayMark
    private class Name(val value: String)

    private fun consumeUntilWs(t: String, from: Int): Int {
        var i = from
        while (i < t.length && !t[i].isWhitespace() && t[i] != '[' && t[i] != ']' && t[i] != '<' && t[i] != '(') i++
        return i
    }

    /** Literal string with escape + balanced-paren handling. Returns (bytes, nextIndex). */
    private fun literalString(t: String, start: Int): Pair<ByteArray, Int> {
        val out = ByteArrayOutputStream()
        var depth = 1
        var i = start + 1
        while (i < t.length && depth > 0) {
            val c = t[i]
            when (c) {
                '\\' -> {
                    i++
                    if (i >= t.length) break
                    when (val e = t[i]) {
                        'n' -> out.write(10)
                        'r' -> out.write(13)
                        't' -> out.write(9)
                        'b' -> out.write(8)
                        'f' -> out.write(12)
                        '(' -> out.write('('.code)
                        ')' -> out.write(')'.code)
                        '\\' -> out.write('\\'.code)
                        else -> if (e in '0'..'7') {
                            var oct = ""; var k = 0
                            while (k < 3 && i < t.length && t[i] in '0'..'7') { oct += t[i]; i++ }
                            out.write(oct.toInt(8)); i--
                        } else out.write(e.code)
                    }
                    i++
                }
                '(' -> { depth++; out.write(c.code); i++ }
                ')' -> { depth--; if (depth > 0) out.write(c.code); i++ }
                else -> { out.write(c.code); i++ }
            }
        }
        return out.toByteArray() to i
    }

    /** Hex string <..>. Returns (bytes, nextIndex). */
    private fun hexString(t: String, start: Int): Pair<ByteArray, Int> {
        val out = ByteArrayOutputStream()
        var i = start + 1
        var hi = -1
        while (i < t.length) {
            val c = t[i]
            if (c == '>') { i++; break }
            val v = hexVal(c)
            if (v >= 0) {
                if (hi < 0) hi = v else { out.write(hi * 16 + v); hi = -1 }
            }
            i++
        }
        if (hi >= 0) out.write(hi * 16)
        return out.toByteArray() to i
    }

    private fun hexVal(c: Char): Int = when (c) {
        in '0'..'9' -> c - '0'
        in 'a'..'f' -> c - 'a' + 10
        in 'A'..'F' -> c - 'A' + 10
        else -> -1
    }

    private fun decodeString(bytes: ByteArray, fontKey: String, codeMap: (String) -> Map<Int, String>): String {
        val map = codeMap(fontKey)
        if (map.isNotEmpty()) {
            val sb = StringBuilder()
            var i = 0
            val twoByte = map.keys.any { it > 0xFF }
            while (i < bytes.size) {
                if (twoByte && i + 1 < bytes.size) {
                    val code = (bytes[i].toInt() and 0xFF) * 256 + (bytes[i + 1].toInt() and 0xFF)
                    sb.append(map[code] ?: "?")
                    i += 2
                } else {
                    sb.append(map[bytes[i].toInt() and 0xFF] ?: cp1252(bytes[i].toInt() and 0xFF))
                    i++
                }
            }
            return sb.toString()
        }
        val sb = StringBuilder(bytes.size)
        bytes.forEach { sb.append(cp1252(it.toInt() and 0xFF)) }
        return sb.toString()
    }

    /** cp1252 approximation for standard-14 fonts (letters, digits, punctuation, latin-1). */
    private fun cp1252(b: Int): Char = when (b) {
        in 0x20..0x7E -> b.toChar()
        0x80 -> '€'; 0x82 -> '‚'; 0x83 -> 'ƒ'; 0x84 -> '„'; 0x85 -> '…'; 0x86 -> '†'; 0x87 -> '‡'
        0x88 -> 'ˆ'; 0x89 -> '‰'; 0x8A -> 'Š'; 0x8B -> '‹'; 0x8C -> 'Œ'; 0x91 -> '\u2018'
        0x92 -> '\u2019'; 0x93 -> '"'; 0x94 -> '"'; 0x95 -> '•'; 0x96 -> '–'; 0x97 -> '—'
        0x98 -> '˜'; 0x99 -> '™'; 0x9A -> 'š'; 0x9B -> '›'; 0x9C -> 'œ'; 0x9E -> 'ž'; 0x9F -> 'Ÿ'
        else -> b.toChar()
    }

    private fun utf16(hex: String): String {
        val sb = StringBuilder()
        var i = 0
        while (i + 4 <= hex.length) {
            sb.append(hex.substring(i, i + 4).toInt(16).toChar())
            i += 4
        }
        return sb.toString()
    }

    private fun incrementHex(hex: String): String {
        val chars = hex.toCharArray()
        var carry = 1
        for (i in chars.indices.reversed()) {
            if (carry == 0) break
            val v = hexVal(chars[i])
            if (v < 0) break
            val nv = v + carry
            carry = nv / 16
            chars[i] = "0123456789abcdef"[nv % 16]
        }
        return String(chars)
    }

    private fun intOf(dict: String, key: String): Int? {
        val i = dict.indexOf(key)
        if (i < 0) return null
        val m = Regex("[0-9]+").find(dict.substring(i + key.length, minOf(dict.length, i + key.length + 20))) ?: return null
        return m.value.toInt()
    }

    private fun inflate(raw: ByteArray): ByteArray = try {
        val out = ByteArrayOutputStream()
        val inflater = Inflater()
        inflater.setInput(raw)
        val buf = ByteArray(64 * 1024)
        while (!inflater.finished()) {
            val n = inflater.inflate(buf)
            if (n == 0 && inflater.needsInput() || inflater.needsDictionary()) break
            out.write(buf, 0, n)
        }
        inflater.end()
        out.toByteArray()
    } catch (_: Exception) {
        raw // uncompressed or unsupported filter — serve raw bytes
    }

    private fun refOf(dict: String, key: String): String? {
        val i = dict.indexOf(key)
        if (i < 0) return null
        val seg = dict.substring(i, minOf(dict.length, i + 80))
        val m = Regex("([0-9]+)\\s+[0-9]+\\s+R").find(seg) ?: return null
        return m.groupValues[1] + " 0"
    }

    private fun refsOf(dict: String, key: String): List<String> {
        val i = dict.indexOf(key)
        if (i < 0) return emptyList()
        val seg = dict.substring(i, minOf(dict.length, i + 400))
        val out = mutableListOf<String>()
        Regex("([0-9]+)\\s+[0-9]+\\s+R").findAll(seg).forEach { out += it.groupValues[1] + " 0" }
        return out
    }

    private fun floatArrayOf(dict: String, key: String): FloatArray? {
        val i = dict.indexOf(key)
        if (i < 0) return null
        val seg = dict.substring(i, minOf(dict.length, i + 160))
        val m = Regex("\\[\\s*([\\-0-9.\\s]+)\\]").find(seg) ?: return null
        val nums = m.groupValues[1].trim().split(Regex("\\s+")).mapNotNull { it.toFloatOrNull() }
        return if (nums.size == 4) nums.toFloatArray() else null
    }

    private fun nameRefPairs(dict: String): List<Pair<String, String>> {
        val out = mutableListOf<Pair<String, String>>()
        Regex("/(\\w+)\\s+([0-9]+)\\s+[0-9]+\\s+R").findAll(dict).forEach { m ->
            out += m.groupValues[1] to (m.groupValues[2] + " 0")
        }
        return out
    }

    private fun List<ByteArray>.concat(): ByteArray? {
        if (isEmpty()) return null
        if (size == 1) return this[0]
        val out = ByteArray(sumOf { it.size })
        var p = 0
        forEach { b -> b.copyInto(out, p); p += b.size }
        return out
    }
}
