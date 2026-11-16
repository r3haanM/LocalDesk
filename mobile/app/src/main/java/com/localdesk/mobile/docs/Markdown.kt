package com.localdesk.mobile.docs

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp

/** Minimal Markdown → unified blocks (headings, emphasis, lists, quotes, fences, rules). */
object Markdown {

    fun parse(src: String): List<DocBlock> {
        val blocks = mutableListOf<DocBlock>()
        val lines = src.lines()
        var i = 0
        while (i < lines.size) {
            val t = lines[i].trim()
            when {
                t.startsWith("```") -> {
                    val body = StringBuilder()
                    i++
                    while (i < lines.size && !lines[i].trim().startsWith("```")) {
                        body.append(lines[i]).append('\n')
                        i++
                    }
                    i++
                    blocks += DocBlock.Para(StyledPara(runs = listOf(StyledRun(body.toString().trimEnd('\n')))))
                }
                t.isEmpty() -> i++
                t.startsWith("#") -> {
                    val level = t.takeWhile { it == '#' }.length.coerceIn(1, 3)
                    blocks += DocBlock.Para(
                        StyledPara(runs = listOf(StyledRun(t.dropWhile { it == '#' }.trim())), heading = level),
                    )
                    i++
                }
                t == "---" || t == "***" || t == "___" -> {
                    blocks += DocBlock.Para(StyledPara(runs = listOf(StyledRun("---")), heading = -1))
                    i++
                }
                t.startsWith(">") -> {
                    val quote = StringBuilder()
                    while (i < lines.size && lines[i].trim().startsWith(">")) {
                        quote.append(lines[i].trim().dropWhile { it == '>' }.trim()).append(' ')
                        i++
                    }
                    blocks += DocBlock.Para(StyledPara(runs = listOf(StyledRun(quote.toString().trim()))))
                }
                t.startsWith("- ") || t.startsWith("* ") || t.startsWith("+ ") -> {
                    while (i < lines.size) {
                        val item = lines[i].trim()
                        if (item.startsWith("- ") || item.startsWith("* ") || item.startsWith("+ ")) {
                            blocks += DocBlock.Para(
                                StyledPara(runs = listOf(styled(item.substring(2).trim())), marker = "•"),
                            )
                            i++
                        } else break
                    }
                }
                Regex("^\\d{1,3}[.)] ").containsMatchIn(t) -> {
                    while (i < lines.size && Regex("^\\d{1,3}[.)] ").containsMatchIn(lines[i].trim())) {
                        val item = lines[i].trim()
                        val marker = item.substringBefore('.', "").trim().ifEmpty { "1" }
                        val content = item.substringAfter('.', "").trim()
                            .ifEmpty { item.substringAfter(')', "").trim() }
                        blocks += DocBlock.Para(
                            StyledPara(runs = listOf(styled(content)), marker = "$marker."),
                        )
                        i++
                    }
                }
                else -> {
                    val text = StringBuilder(t)
                    i++
                    while (i < lines.size && lines[i].trim().isNotEmpty() && !isBlockStart(lines[i])) {
                        text.append(' ').append(lines[i].trim())
                        i++
                    }
                    blocks += DocBlock.Para(StyledPara(runs = listOf(styled(text.toString()))))
                }
            }
        }
        return blocks
    }

    /** One styled run covering a whole line, with **bold** / *italic* / `code` inline spans. */
    fun styled(text: String): StyledRun = StyledRun(text)

    fun inline(text: String): AnnotatedString {
        val builder = AnnotatedString.Builder()
        val patterns = listOf(
            Regex("`([^`]+)`") to SpanStyle(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
            Regex("\\*\\*(.+?)\\*\\*") to SpanStyle(fontWeight = FontWeight.W700),
            Regex("(?<!\\*)\\*([^*\\s][^*]*?)\\*(?!\\*)") to SpanStyle(fontStyle = FontStyle.Italic),
        )
        var i = 0
        while (i < text.length) {
            var best: MatchResult? = null
            var bestStyle: SpanStyle? = null
            var bestStart = Int.MAX_VALUE
            for ((regex, style) in patterns) {
                val match = regex.find(text, i)
                if (match != null && match.range.first < bestStart) {
                    best = match; bestStyle = style; bestStart = match.range.first
                }
            }
            val found = best
            val style = bestStyle
            if (found == null || style == null) {
                builder.append(text.substring(i))
                break
            }
            builder.append(text.substring(i, found.range.first))
            builder.pushStyle(style)
            builder.append(found.groupValues[1])
            builder.pop()
            i = found.range.last + 1
        }
        return builder.toAnnotatedString()
    }

    fun runStyle(run: StyledRun, fallbackColor: androidx.compose.ui.graphics.Color): SpanStyle = SpanStyle(
        fontWeight = if (run.bold) FontWeight.W700 else null,
        fontStyle = if (run.italic) FontStyle.Italic else null,
        textDecoration = when {
            run.underline && run.strike -> TextDecoration.Underline + TextDecoration.LineThrough
            run.underline -> TextDecoration.Underline
            run.strike -> TextDecoration.LineThrough
            else -> null
        },
        color = run.colorArgb?.let { androidx.compose.ui.graphics.Color(0xFF000000L or it) } ?: fallbackColor,
        background = run.highlightArgb?.let { androidx.compose.ui.graphics.Color(0xFF000000L or it) }
            ?: androidx.compose.ui.graphics.Color.Unspecified,
        fontSize = run.sizeSp?.sp ?: androidx.compose.ui.unit.TextUnit.Unspecified,
    )

    private fun isBlockStart(line: String): Boolean {
        val t = line.trim()
        return t.startsWith("#") || t.startsWith("```") || t.startsWith(">") ||
            t.startsWith("- ") || t.startsWith("* ") || t.startsWith("+ ") ||
            t == "---" || t == "***" || t == "___" ||
            Regex("^\\d{1,3}[.)] ").containsMatchIn(t)
    }
}
