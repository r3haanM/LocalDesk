package com.localdesk.mobile.docs

import android.graphics.Bitmap

/** Unified block model rendered by DOCX and Markdown readers. */
data class StyledRun(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val underline: Boolean = false,
    val strike: Boolean = false,
    val colorArgb: Long? = null,
    val highlightArgb: Long? = null,
    val sizeSp: Float? = null,
    val link: String? = null, // external hyperlink target when the run sits inside w:hyperlink
)

data class StyledPara(
    val runs: List<StyledRun>,
    val heading: Int = 0,        // 0 body, 1..3
    val marker: String? = null,  // list bullet / "1."
    val indent: Int = 0,
    val center: Boolean = false,
    val right: Boolean = false,
)

data class DocTable(val rows: List<List<StyledPara>>, val colFractions: List<Float>)

data class DocImage(val bitmap: Bitmap?, val aspect: Float)

sealed interface DocBlock {
    data class Para(val para: StyledPara) : DocBlock
    data class Table(val table: DocTable) : DocBlock
    data class Image(val image: DocImage) : DocBlock
}

/** One slide of a deck, positioned on its authored canvas. */
data class SlideRun(
    val text: String,
    val sizePt: Float?,
    val bold: Boolean,
    val italic: Boolean,
    val colorArgb: Long?,
)

data class SlidePara(val runs: List<SlideRun>, val bullet: String?, val center: Boolean)

sealed interface SlideShape {
    val x: Float; val y: Float; val w: Float; val h: Float // canvas fractions, -1 = unknown

    data class Text(
        override val x: Float, override val y: Float, override val w: Float, override val h: Float,
        val title: Boolean,
        val bg: Long?,
        val paras: List<SlidePara>,
    ) : SlideShape

    data class Picture(
        override val x: Float, override val y: Float, override val w: Float, override val h: Float,
        val bitmap: Bitmap?,
    ) : SlideShape

    data class Block(
        override val x: Float, override val y: Float, override val w: Float, override val h: Float,
        val colorArgb: Long,
        val rounded: Boolean,
    ) : SlideShape

    /** Native a:tbl inside a graphicFrame — rows of plain cell strings. */
    data class Table(
        override val x: Float, override val y: Float, override val w: Float, override val h: Float,
        val rows: List<List<String>>,
    ) : SlideShape

    /** Chart graphicFrame — content intentionally not rendered; labeled card instead. */
    data class ChartCard(
        override val x: Float, override val y: Float, override val w: Float, override val h: Float,
    ) : SlideShape
}

data class Slide(
    val number: Int,
    val widthEmu: Long,
    val heightEmu: Long,
    val bg: Long?,
    val shapes: List<SlideShape>,
) {
    val positioned: Boolean
        get() = shapes.isNotEmpty() && shapes.all { it.x >= 0f }
}

data class GridData(val rows: List<List<String>>, val truncated: Boolean)

/** One worksheet of a workbook (CSV files produce a single-sheet workbook). */
data class SheetData(
    val name: String,
    val grid: GridData,
    val colDp: List<Float> = emptyList(),  // authored column widths, dp
    val frozenCols: Int = 0,               // xSplit frozen-pane columns
    val charts: Int = 0,                   // drawing-attached charts (not rendered)
)

data class WorkbookData(val sheets: List<SheetData>)
