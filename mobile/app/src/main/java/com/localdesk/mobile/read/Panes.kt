package com.localdesk.mobile.read

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.InsertChart
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material.icons.outlined.ZoomOut
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.localdesk.mobile.R
import com.localdesk.mobile.brand.Charcoal
import com.localdesk.mobile.brand.ChromeIcon
import com.localdesk.mobile.brand.ChromeIndicatorText
import com.localdesk.mobile.brand.Ink
import com.localdesk.mobile.brand.InkSoft
import com.localdesk.mobile.brand.Paper
import com.localdesk.mobile.brand.PdfCanvas
import com.localdesk.mobile.brand.Red
import com.localdesk.mobile.docs.DocBlock
import com.localdesk.mobile.docs.DocTable
import com.localdesk.mobile.core.PdfHighlight
import com.localdesk.mobile.docs.PdfText
import com.localdesk.mobile.docs.Slide
import com.localdesk.mobile.docs.SlideShape
import com.localdesk.mobile.docs.StyledPara
import com.localdesk.mobile.docs.StyledRun
import com.localdesk.mobile.docs.WorkbookData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

private val MonoStyle = TextStyle(
    fontFamily = FontFamily.Monospace,
    fontSize = 14.sp,
    lineHeight = 20.sp,
)

/** Uniform text scaling for reflow-style zoom (DocPane). */
private fun TextStyle.scaled(f: Float): TextStyle = copy(
    fontSize = fontSize * f,
    lineHeight = lineHeight * f,
)

/** Whole-content zoom transform shared by the spatial panes — pinch + toolbar drive one state. */
@Composable
private fun rememberContentZoom(zoom: ZoomState) =
    rememberTransformableState { zoomChange, panChange, _ ->
        zoom.scale = (zoom.scale * zoomChange).coerceIn(1f, 4f)
        if (zoom.scale > 1f) { zoom.px += panChange.x; zoom.py += panChange.y } else { zoom.px = 0f; zoom.py = 0f }
        val maxX = 2000f * (zoom.scale - 1f)
        val maxY = 4000f * (zoom.scale - 1f)
        zoom.px = zoom.px.coerceIn(-maxX, maxX)
        zoom.py = zoom.py.coerceIn(-maxY, maxY)
    }

private fun Modifier.zoomLayer(zoom: ZoomState): Modifier = graphicsLayer {
    scaleX = zoom.scale
    scaleY = zoom.scale
    translationX = zoom.px
    translationY = zoom.py
}

/** Zoom-only toolbar (percent indicator + long-press slider) docked bottom-center. */
@Composable
private fun BoxScope.ZoomToolbar(zoom: ZoomState, modifier: Modifier = Modifier, max: Float = 4f) {
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    ReaderToolbar(
        indicator = stringResource(R.string.zoom_percent, (zoom.scale * 100f).roundToInt()),
        zoomOut = { zoom.scale = (zoom.scale / 1.4f).coerceAtLeast(1f); if (zoom.scale <= 1f) zoom.reset() },
        zoomOutEnabled = zoom.scale > 1f,
        zoomIn = { zoom.scale = (zoom.scale * 1.4f).coerceAtMost(max) },
        zoomInEnabled = zoom.scale < max,
        zoomValue = zoom.scale,
        zoomRange = 1f..max,
        onZoomSlider = { zoom.scale = it },
        modifier = modifier
            .align(Alignment.BottomCenter)
            .padding(bottom = navBottom + 14.dp),
    )
}

/**
 * PDF pane — CONTINUOUS vertical reading: pages stacked at full width with 8 dp gutters.
 * Two-phase zoom (live layer scale, sharper re-render at settle), pinch + pan, double-tap
 * reset, tap toggles chrome. Line-granular text selection with copy + persisted highlights
 * (extracted by PdfText). Night mode inverts page bitmaps. Thumbnails dialog for jump.
 */
@Composable
fun PdfPane(
    model: ReaderModel,
    pages: Int,
    aspects: List<Float>,
    pdfText: PdfText.Doc?,
    highlights: List<PdfHighlight>,
    showThumbs: Boolean,
    onDismissThumbs: () -> Unit,
    onAddHighlight: (PdfHighlight) -> Unit,
    chromeVisible: Boolean,
    onToggleChrome: () -> Unit,
    listState: LazyListState,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current
    var scale by remember { mutableFloatStateOf(1f) }
    var offX by remember { mutableFloatStateOf(0f) }
    var offY by remember { mutableFloatStateOf(0f) }
    // Two-phase zoom: the layer tracks the gesture live; pages re-render sharper at settle.
    var settledScale by remember { mutableFloatStateOf(1f) }
    val transform = rememberTransformableState { zoomChange, panChange, _ ->
        scale = (scale * zoomChange).coerceIn(1f, 4f)
        if (scale > 1f) { offX += panChange.x; offY += panChange.y } else { offX = 0f; offY = 0f }
        val maxX = 2000f * (scale - 1f)
        val maxY = 4000f * (scale - 1f)
        offX = offX.coerceIn(-maxX, maxX)
        offY = offY.coerceIn(-maxY, maxY)
    }
    LaunchedEffect(scale) {
        kotlinx.coroutines.delay(200)   // settle debounce: re-render sharper after the gesture stops
        settledScale = scale
    }
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    var sel by remember { mutableStateOf<PdfSel?>(null) }
    var selAnchor by remember { mutableStateOf<PdfSel?>(null) }
    val paneHeight = remember { mutableIntStateOf(0) }

    fun pdfSelFor(off: androidx.compose.ui.geometry.Offset): PdfSel? {
        if (pdfText == null || pdfText.pages.isEmpty()) return null
        val info = listState.layoutInfo
        val item = info.visibleItemsInfo.firstOrNull {
            off.y >= it.offset && off.y < it.offset + it.size
        } ?: return null
        // invert the zoom-layer transform: pointer coords are viewport-space
        val pivot = paneHeight.intValue / 2f
        val yList = pivot + (off.y - pivot) / scale
        val frac = ((yList - item.offset) / item.size.coerceAtLeast(1)).coerceIn(0f, 1f)
        val lines = pdfText.pages.getOrNull(item.index)?.lines ?: return null
        var nearest = 0
        lines.forEachIndexed { i, l ->
            if (kotlin.math.abs(l.yFrac - frac) < kotlin.math.abs(lines[nearest].yFrac - frac)) nearest = i
        }
        return PdfSel(item.index, nearest, nearest)
    }

    Box(modifier.fillMaxSize().background(PdfCanvas).onSizeChanged { paneHeight.intValue = it.height }) {
        LazyColumn(
            state = listState,
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(
                top = statusTop + 56.dp + 8.dp,
                bottom = navBottom + 64.dp,
            ),
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures(
                        onTap = { onToggleChrome() },
                        onDoubleTap = { scale = 1f; offX = 0f; offY = 0f; settledScale = 1f },
                    )
                }
                .pointerInput(pdfText) {
                    detectDragGesturesAfterLongPress(
                        onDragStart = { off ->
                            if (pdfText != null && pdfText.pages.isNotEmpty()) {
                                pdfSelFor(off)?.let { selAnchor = it; sel = it }
                            }
                        },
                        onDrag = { change, _ ->
                            if (selAnchor != null) {
                                pdfSelFor(change.position)?.let { cur ->
                                    val a = selAnchor!!
                                    sel = if (cur.page != a.page) a else PdfSel(
                                        a.page,
                                        minOf(a.from, cur.to),
                                        maxOf(a.from, cur.to),
                                    )
                                }
                            }
                        },
                    )
                }
                .transformable(transform)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offX
                    translationY = offY
                },
        ) {
            items(pages, key = { it }) { index ->
                val aspect = aspects.getOrNull(index)?.takeIf { it > 0f } ?: (1f / 1.414f)
                // A lone page that is shorter than the viewport floats centered (Acrobat
                // single-page behaviour) instead of sticking to the top with a void below.
                val soloCenter = pages == 1
                BoxWithConstraints(
                    Modifier
                        .fillMaxWidth()
                        .then(if (soloCenter) Modifier.fillParentMaxHeight() else Modifier),
                ) {
                    val pageWidth = maxWidth
                    val pageHeight = pageWidth / aspect
                    val centered = soloCenter && pageHeight < maxHeight
                    val density = LocalDensity.current
                    val renderWidth = remember(pageWidth, settledScale) {
                        with(density) { (pageWidth * settledScale).toPx() }.toInt().coerceIn(1, 2200)
                    }
                    val bitmap by produceState<androidx.compose.ui.graphics.ImageBitmap?>(
                        initialValue = null, index, renderWidth,
                    ) {
                        value = withContext(Dispatchers.IO) { model.renderPage(index, renderWidth) }
                    }
                    val lines = pdfText?.pages?.getOrNull(index)?.lines
                    Box(
                        Modifier
                            .width(pageWidth)
                            .height(pageHeight)
                            .then(if (centered) Modifier.align(Alignment.Center) else Modifier)
                            .shadow(2.dp, RectangleShape)
                            .background(Paper),
                        contentAlignment = Alignment.Center,
                    ) {
                        val drawn = bitmap
                        if (drawn != null) {
                            Image(
                                bitmap = drawn,
                                contentDescription = stringResource(R.string.cd_pdf_page, index + 1),
                                contentScale = ContentScale.Fit,
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            CircularProgressIndicator(color = Red, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                        }
                        // persisted highlights (BUG-03c partial — app-side, view-only)
                        highlights.filter { it.page == index }.forEach { h ->
                            val lo = minOf(h.from, h.to); val hi = maxOf(h.from, h.to)
                            lines?.let { ls ->
                                (lo..hi).forEach { i ->
                                    ls.getOrNull(i)?.let { l ->
                                        Box(
                                            Modifier
                                                .offset(y = (l.yFrac * pageHeight.value - l.hFrac * pageHeight.value / 2).dp)
                                                .fillMaxWidth()
                                                .height((l.hFrac * pageHeight.value).dp)
                                                .background(Color(0x26F59E0B)),
                                        )
                                    }
                                }
                            }
                        }
                        // active selection strips
                        sel?.takeIf { it.page == index }?.let { s ->
                            lines?.let { ls ->
                                (s.from..s.to).forEach { i ->
                                    ls.getOrNull(i)?.let { l ->
                                        Box(
                                            Modifier
                                                .offset(y = (l.yFrac * pageHeight.value - l.hFrac * pageHeight.value / 2).dp)
                                                .fillMaxWidth()
                                                .height((l.hFrac * pageHeight.value).dp)
                                                .background(Color(0x3310B981)),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Reading-progress hairline docked just below the chrome — visible in all states.
        val progress by androidx.compose.runtime.remember {
            androidx.compose.runtime.derivedStateOf {
                val info = listState.layoutInfo
                val first = info.visibleItemsInfo.firstOrNull()
                if (first == null || pages == 0) 0f
                else {
                    val inItem = if (first.size > 0) (-first.offset.toFloat() / first.size).coerceIn(0f, 1f) else 0f
                    (first.index + inItem) / pages.toFloat()
                }
            }
        }
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .offset(y = statusTop + 56.dp)
                .fillMaxWidth()
                .height(3.dp)
                .background(PdfCanvas),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(progress.coerceIn(0f, 1f))
                    .height(3.dp)
                    .background(Red),
            )
        }

        // selection action chips: copy / persist highlight / clear
        sel?.let { s ->
            val lines = pdfText?.pages?.getOrNull(s.page)?.lines
            val selText = lines
                ?.subList(minOf(s.from, s.to), minOf(s.to + 1, lines.size))
                ?.joinToString("\n") { it.text }
                ?: ""
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = navBottom + 14.dp + 76.dp)
                    .shadow(8.dp, RoundedCornerShape(50))
                    .background(Charcoal.copy(alpha = 0.94f), RoundedCornerShape(50))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = {
                    clipboard.setText(AnnotatedString(selText))
                    sel = null; selAnchor = null
                }) { Text(stringResource(R.string.sel_copy), color = ChromeIcon) }
                TextButton(onClick = {
                    onAddHighlight(PdfHighlight(model.uriString, s.page, s.from, s.to))
                    sel = null; selAnchor = null
                }) { Text(stringResource(R.string.sel_highlight), color = ChromeIcon) }
                IconButton(onClick = { sel = null; selAnchor = null }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Outlined.Close, contentDescription = null, tint = ChromeIcon)
                }
            }
        }

        // Adobe-style floating toolbar: navigate · indicator (long-press = slider) · zoom.
        ReaderToolbar(
            navPrev = {
                scope.launch {
                    listState.animateScrollToItem((listState.firstVisibleItemIndex - 1).coerceAtLeast(0))
                }
            },
            prevEnabled = listState.firstVisibleItemIndex > 0,
            indicator = stringResource(
                R.string.page_indicator,
                (listState.firstVisibleItemIndex + 1).coerceAtMost(pages),
                pages,
            ),
            navNext = {
                scope.launch {
                    listState.animateScrollToItem((listState.firstVisibleItemIndex + 1).coerceAtMost(pages - 1))
                }
            },
            nextEnabled = listState.firstVisibleItemIndex < pages - 1,
            zoomOut = {
                scale = (scale / 1.4f).coerceAtLeast(1f)
                if (scale <= 1f) { offX = 0f; offY = 0f }
                settledScale = scale
            },
            zoomOutEnabled = scale > 1f,
            zoomIn = { scale = (scale * 1.4f).coerceAtMost(4f); settledScale = scale },
            zoomInEnabled = scale < 4f,
            zoomValue = scale,
            onZoomSlider = {
                scale = it.coerceIn(1f, 4f)
                if (scale <= 1f) { offX = 0f; offY = 0f }
                settledScale = scale
            },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = navBottom + 14.dp),
        )

        // page thumbnails — jump-to-page (BUG-03e)
        if (showThumbs) {
            androidx.compose.ui.window.Dialog(onDismissRequest = onDismissThumbs) {
                Box(
                    Modifier
                        .size(340.dp, 560.dp)
                        .background(Charcoal, RoundedCornerShape(16.dp)),
                ) {
                    Column(Modifier.fillMaxSize()) {
                        Row(
                            Modifier.fillMaxWidth().padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                stringResource(R.string.menu_thumbnails),
                                style = MaterialTheme.typography.titleMedium,
                                color = ChromeIcon,
                                modifier = Modifier.weight(1f),
                            )
                            IconButton(onClick = onDismissThumbs, modifier = Modifier.size(40.dp)) {
                                Icon(Icons.Outlined.Close, contentDescription = null, tint = ChromeIcon)
                            }
                        }
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(3),
                            contentPadding = PaddingValues(8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            items(pages) { i ->
                                var thumb by remember(i) {
                                    mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null)
                                }
                                LaunchedEffect(i) {
                                    thumb = withContext(Dispatchers.IO) { model.renderPage(i, 160) }
                                }
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    modifier = Modifier
                                        .clipToBounds()
                                        .background(Paper, RoundedCornerShape(6.dp))
                                        .clickable {
                                            scope.launch { listState.animateScrollToItem(i) }
                                            onDismissThumbs()
                                        }
                                        .padding(2.dp),
                                ) {
                                    thumb?.let {
                                        Image(it, contentDescription = stringResource(R.string.cd_pdf_page, i + 1), modifier = Modifier.fillMaxWidth())
                                    } ?: Box(Modifier.fillMaxWidth().height(120.dp))
                                    Text(
                                        "${i + 1}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class PdfSel(val page: Int, val from: Int, val to: Int)

/**
 * Text pane — plain text zooms by FONT SCALE (reflow): spatial layers under a selection
 * container render blank, and reflow reads better for prose anyway.
 */
@Composable
fun TextPane(text: String, code: Boolean, mono: Boolean, listState: LazyListState, padding: PaddingValues) {
    val zoom = remember { ZoomState() }
    val transform = rememberTransformableState { zoomChange, _, _ ->
        zoom.scale = (zoom.scale * zoomChange).coerceIn(1f, 3f)
    }
    Box(Modifier.fillMaxSize()) {
        SelectionContainer(Modifier.fillMaxSize()) {
            LazyColumn(
                state = listState,
                contentPadding = padding,
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) { detectTapGestures(onDoubleTap = { zoom.reset() }) }
                    .transformable(transform),
            ) {
                item {
                    val base = if (mono || code) MonoStyle else MaterialTheme.typography.bodyLarge
                    Text(
                        text = text,
                        style = base.copy(
                            fontSize = base.fontSize * zoom.scale,
                            lineHeight = base.lineHeight * zoom.scale,
                        ),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
        }
        ZoomToolbar(zoom, max = 3f)
    }
}

/** DOCX / markdown blocks — reflow zoom, selectable text, optional header/footer blocks. */
@Composable
fun DocPane(
    blocks: List<DocBlock>,
    markdown: Boolean,
    mono: Boolean,
    header: List<DocBlock>,
    footer: List<DocBlock>,
    listState: LazyListState,
    padding: PaddingValues,
) {
    val zoom = remember { ZoomState() }
    val transform = rememberTransformableState { zoomChange, _, _ ->
        zoom.scale = (zoom.scale * zoomChange).coerceIn(1f, 3f)
    }
    Box(Modifier.fillMaxSize()) {
        SelectionContainer(Modifier.fillMaxSize()) {
            LazyColumn(
                state = listState,
                contentPadding = padding,
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) { detectTapGestures(onDoubleTap = { zoom.reset() }) }
                    .transformable(transform),
            ) {
                if (header.isNotEmpty()) {
                    items(header.size) { i -> BlockRow(header[i], mono, zoom.scale) }
                    item {
                        HorizontalDivider(
                            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }
                }
                items(blocks.size, key = { it }) { index -> BlockRow(blocks[index], mono, zoom.scale) }
                if (footer.isNotEmpty()) {
                    item {
                        HorizontalDivider(
                            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }
                    items(footer.size) { i -> BlockRow(footer[i], mono, zoom.scale) }
                }
            }
        }
        ZoomToolbar(zoom, max = 3f)
    }
}

@Composable
private fun BlockRow(block: DocBlock, mono: Boolean = false, fontScale: Float = 1f) {
    when (block) {
        is DocBlock.Para -> ParaRow(block.para, mono, fontScale)
        is DocBlock.Table -> TableGrid(block.table, mono, fontScale)
        is DocBlock.Image -> ImageRow(block.image)
    }
}

@Composable
private fun ParaRow(para: StyledPara, mono: Boolean = false, fontScale: Float = 1f) {
    val base = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 3.dp)
    val annotated = styledPara(para)
    val align = when {
        para.center -> TextAlign.Center
        para.right -> TextAlign.End
        else -> TextAlign.Start
    }
    val bodyStyle = MaterialTheme.typography.bodyLarge.scaled(fontScale)
    val monoScaled = MonoStyle.copy(fontSize = MonoStyle.fontSize * fontScale, lineHeight = MonoStyle.lineHeight * fontScale)
    if (para.heading > 0) {
        val face = if (mono) monoScaled else when (para.heading) {
            1 -> MaterialTheme.typography.titleLarge.scaled(fontScale)
            2 -> MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.W600).scaled(fontScale)
            else -> MaterialTheme.typography.titleSmall.scaled(fontScale)
        }
        Text(
            text = annotated,
            style = face,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = align,
            modifier = base.padding(top = if (para.heading == 1) 12.dp else 8.dp),
        )
    } else if (para.marker != null) {
        Row(modifier = base) {
            Box(Modifier.width((16 + para.indent * 14).dp)) {
                Text(para.marker ?: "•", style = bodyStyle, color = Red)
            }
            Text(
                text = annotated,
                style = if (mono) monoScaled else bodyStyle,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f),
            )
        }
    } else {
        Text(
            text = annotated,
            style = if (mono) monoScaled else bodyStyle,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = align,
            modifier = base,
        )
    }
}

private fun styledPara(para: StyledPara): AnnotatedString {
    val builder = buildAnnotatedString {
        para.runs.forEach { run ->
            pushStyle(
                SpanStyle(
                    fontWeight = if (run.bold) FontWeight.W700 else null,
                    fontStyle = if (run.italic) FontStyle.Italic else null,
                    textDecoration = when {
                        run.link != null -> TextDecoration.Underline
                        run.underline && run.strike -> TextDecoration.Underline + TextDecoration.LineThrough
                        run.underline -> TextDecoration.Underline
                        run.strike -> TextDecoration.LineThrough
                        else -> null
                    },
                    color = when {
                        run.link != null -> Color(0xFF0B57D0)
                        else -> run.colorArgb?.let { Color(0xFF000000L or it) } ?: Color.Unspecified
                    },
                    background = run.highlightArgb?.let { Color(0xFF000000L or it) } ?: Color.Unspecified,
                    fontSize = run.sizeSp?.sp ?: androidx.compose.ui.unit.TextUnit.Unspecified,
                ),
            )
            append(run.text)
            pop()
        }
    }
    return builder
}

@Composable
private fun TableGrid(table: DocTable, mono: Boolean = false, fontScale: Float = 1f) {
    if (table.rows.isEmpty()) return
    val cols = table.rows.maxOf { it.size }.coerceAtLeast(1)
    val fractions = table.colFractions.ifEmpty { List(cols) { 1f / cols } }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium),
    ) {
        table.rows.forEachIndexed { rowIndex, row ->
            Row(Modifier.fillMaxWidth()) {
                row.forEachIndexed { colIndex, cell ->
                    val fraction = fractions.getOrElse(colIndex) { 1f / fractions.size }
                    Box(
                        Modifier
                            .weight(fraction)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                    ) {
                        Text(
                            text = styledPara(cell),
                            style = if (mono) {
                                MonoStyle.copy(fontSize = MonoStyle.fontSize * fontScale, lineHeight = MonoStyle.lineHeight * fontScale)
                            } else MaterialTheme.typography.bodySmall.scaled(fontScale),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
            if (rowIndex < table.rows.size - 1) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 1.dp)
            }
        }
    }
}

@Composable
private fun ImageRow(image: com.localdesk.mobile.docs.DocImage) {
    val bitmap = image.bitmap ?: return
    val aspect = if (image.aspect > 0f) image.aspect else 1.414f
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = null,
            modifier = Modifier.fillMaxWidth().aspectRatio(aspect),
        )
    }
}

/** PPTX: positioned slide canvases; unpositioned slides fall back to a stacked card. */
@Composable
fun SlidesPane(slides: List<Slide>, listState: LazyListState, padding: PaddingValues) {
    val scope = rememberCoroutineScope()
    val zoom = remember { ZoomState() }
    val transform = rememberContentZoom(zoom)
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            state = listState,
            contentPadding = padding,
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) { detectTapGestures(onDoubleTap = { zoom.reset() }) }
                .transformable(transform)
                .zoomLayer(zoom),
        ) {
            items(slides, key = { it.number }) { slide ->
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text(
                        text = "SLIDE ${slide.number}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 6.dp),
                    )
                    if (slide.positioned) SlideCanvas(slide) else SlideStacked(slide)
                }
            }
        }
        ReaderToolbar(
            navPrev = {
                scope.launch {
                    listState.animateScrollToItem((listState.firstVisibleItemIndex - 1).coerceAtLeast(0))
                }
            },
            prevEnabled = listState.firstVisibleItemIndex > 0,
            indicator = stringResource(
                R.string.page_indicator,
                (listState.firstVisibleItemIndex + 1).coerceAtMost(slides.size),
                slides.size,
            ),
            navNext = {
                scope.launch {
                    listState.animateScrollToItem((listState.firstVisibleItemIndex + 1).coerceAtMost(slides.size - 1))
                }
            },
            nextEnabled = listState.firstVisibleItemIndex < slides.size - 1,
            zoomOut = { zoom.scale = (zoom.scale / 1.4f).coerceAtLeast(1f); if (zoom.scale <= 1f) zoom.reset() },
            zoomOutEnabled = zoom.scale > 1f,
            zoomIn = { zoom.scale = (zoom.scale * 1.4f).coerceAtMost(4f) },
            zoomInEnabled = zoom.scale < 4f,
            zoomValue = zoom.scale,
            onZoomSlider = { zoom.scale = it.coerceIn(1f, 4f) },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = navBottom + 14.dp),
        )
    }
}

@Composable
private fun SlideCanvas(slide: Slide) {
    BoxWithConstraints(
        Modifier
            .fillMaxWidth()
            .aspectRatio(slide.widthEmu.toFloat() / slide.heightEmu.toFloat())
            .shadow(3.dp, RoundedCornerShape(4.dp))
            .background(slide.bg?.let { Color(it) } ?: Paper, RoundedCornerShape(4.dp)),
    ) {
        val widthDp = maxWidth
        val heightDp = maxHeight
        val perInch = widthDp.value / (slide.widthEmu / com.localdesk.mobile.docs.Pptx.EMU_PER_INCH)

        slide.shapes.forEach { shape ->
            val placement = Modifier
                .offset(x = (shape.x * widthDp.value).dp, y = (shape.y * heightDp.value).dp)
                .width(((shape.w * widthDp.value).dp).coerceAtLeast(1.dp))
                .height(((shape.h * heightDp.value).dp).coerceAtLeast(1.dp))
            when (shape) {
                is SlideShape.Block -> Box(
                    modifier = placement.background(
                        Color(shape.colorArgb),
                        if (shape.rounded) RoundedCornerShape(12.dp) else RoundedCornerShape(0.dp),
                    ),
                )
                is SlideShape.Picture -> shape.bitmap?.let {
                    Image(bitmap = it.asImageBitmap(), contentDescription = null, modifier = placement)
                }
                is SlideShape.Text -> Box(
                    modifier = placement.background(shape.bg?.let { Color(it) } ?: Color.Transparent),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Column(Modifier.padding(horizontal = 4.dp)) {
                        shape.paras.forEach { para ->
                            if (para.runs.none { it.text.isNotBlank() }) return@forEach
                            Text(
                                text = slideText(para, shape.title, perInch),
                                color = para.runs.firstOrNull { it.colorArgb != null }?.colorArgb
                                    ?.let { Color(it) } ?: MaterialTheme.colorScheme.onSurface,
                                textAlign = if (para.center) TextAlign.Center else TextAlign.Start,
                                maxLines = 8,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
                is SlideShape.Table -> Box(modifier = placement) {
                    val colCount = shape.rows.maxOfOrNull { it.size } ?: 1
                    Column(
                        Modifier
                            .fillMaxSize()
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    ) {
                        shape.rows.forEach { row ->
                            Row(Modifier.fillMaxWidth()) {
                                (0 until colCount).forEach { c ->
                                    Box(
                                        Modifier
                                            .weight(1f)
                                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                            .padding(horizontal = 3.dp, vertical = 2.dp),
                                    ) {
                                        Text(
                                            text = row.getOrElse(c) { "" },
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            maxLines = 3,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                is SlideShape.ChartCard -> Box(
                    modifier = placement
                        .background(MaterialTheme.colorScheme.surfaceContainerHighest, RoundedCornerShape(8.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Outlined.InsertChart,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = stringResource(R.string.chart_card),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(6.dp),
                        )
                    }
                }
            }
        }
    }
}

private fun slideText(para: com.localdesk.mobile.docs.SlidePara, title: Boolean, perInch: Float): AnnotatedString {
    val builder = buildAnnotatedString {
        if (para.bullet != null) append("${para.bullet} ")
        para.runs.forEach { run ->
            val pt = run.sizePt ?: if (title) 32f else 18f
            pushStyle(
                SpanStyle(
                    fontWeight = if (run.bold) FontWeight.W700 else null,
                    fontStyle = if (run.italic) FontStyle.Italic else null,
                    color = run.colorArgb?.let { Color(it) } ?: Color.Unspecified,
                    fontSize = ((pt / 72f) * perInch).sp,
                ),
            )
            append(run.text)
            pop()
        }
    }
    return builder
}

@Composable
private fun SlideStacked(slide: Slide) {
    val lines = slide.shapes.flatMap { shape ->
        (shape as? SlideShape.Text)?.paras?.map { p -> p.runs.joinToString("") { it.text } } ?: emptyList()
    }.filter { it.isNotBlank() }
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .shadow(3.dp, RoundedCornerShape(4.dp))
            .background(Paper, RoundedCornerShape(4.dp))
            .padding(16.dp),
    ) {
        Column {
            Text(
                text = lines.firstOrNull() ?: "Slide ${slide.number}",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(8.dp))
            lines.drop(1).take(6).forEach { line ->
                Text(line, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
            }
        }
    }
}

/** CSV / XLSX: sheet tabs (multi-sheet), sticky header, frozen columns, zebra rows, chart card. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SheetPane(workbook: WorkbookData, listState: LazyListState, padding: PaddingValues) {
    val scope = rememberCoroutineScope()
    val zoom = remember { ZoomState() }
    val transform = rememberContentZoom(zoom)
    var active by remember { androidx.compose.runtime.mutableIntStateOf(0) }
    val sheet = workbook.sheets[active.coerceIn(0, workbook.sheets.lastIndex)]
    val hScroll = rememberScrollState()
    val widths = remember(sheet) {
        if (sheet.colDp.isNotEmpty()) {
            sheet.colDp
        } else {
            val cols = sheet.grid.rows.maxOfOrNull { it.size } ?: 0
            (0 until cols).map { col ->
                var longest = 0
                sheet.grid.rows.forEach { row -> longest = maxOf(longest, row.getOrElse(col) { "" }.length) }
                ((longest.coerceAtMost(26) * 7).toFloat()).coerceIn(88f, 220f)
            }
        }
    }
    val frozen = sheet.frozenCols.coerceIn(0, (sheet.grid.rows.maxOfOrNull { it.size } ?: 1) - 1)

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            state = listState,
            contentPadding = padding,
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) { detectTapGestures(onDoubleTap = { zoom.reset() }) }
                .transformable(transform)
                .zoomLayer(zoom),
        ) {
            if (workbook.sheets.size > 1) {
                stickyHeader(key = "tabs") {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        workbook.sheets.forEachIndexed { i, s ->
                            val selected = i == active
                            Text(
                                text = s.name,
                                style = MaterialTheme.typography.labelMedium,
                                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .clickable {
                                        active = i
                                        scope.launch { listState.scrollToItem(0) }
                                    }
                                    .background(
                                        if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                                        RoundedCornerShape(50),
                                    )
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            )
                            if (i < workbook.sheets.lastIndex) Spacer(Modifier.width(6.dp))
                        }
                    }
                }
            }
            stickyHeader(key = "head") {
                SheetRow(sheet.grid.rows.firstOrNull() ?: emptyList(), widths, frozen, hScroll, header = true, zebra = false)
            }
            if (sheet.grid.rows.size > 1) {
                items(sheet.grid.rows.size - 1, key = { it + 1 }) { index ->
                    SheetRow(sheet.grid.rows[index + 1], widths, frozen, hScroll, header = false, zebra = index % 2 == 1)
                }
            }
            if (sheet.charts > 0) {
                item(key = "charts") {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(12.dp)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.InsertChart,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.chart_card),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (sheet.grid.truncated) {
                item(key = "tail") {
                    Text(
                        text = stringResource(R.string.rows_truncated, sheet.grid.rows.size),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }
        ZoomToolbar(zoom)
    }
}

@Composable
private fun SheetRow(
    cells: List<String>,
    widths: List<Float>,
    frozen: Int,
    hScroll: androidx.compose.foundation.ScrollState,
    header: Boolean,
    zebra: Boolean,
) {
    val bg = when {
        header -> MaterialTheme.colorScheme.surfaceContainerHighest
        zebra -> MaterialTheme.colorScheme.surfaceContainerLow
        else -> MaterialTheme.colorScheme.surface
    }
    val pinned = frozen.coerceAtMost(cells.size)
    Row(
        Modifier
            .fillMaxWidth()
            .height(44.dp)
            .background(bg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (pinned > 0) {
            Row(Modifier.width(widths.take(pinned).sum().dp)) {
                cells.take(pinned).forEachIndexed { index, cell ->
                    if (index > 0) Box(Modifier.width(1.dp).height(44.dp).background(MaterialTheme.colorScheme.outlineVariant))
                    Box(Modifier.width((widths.getOrElse(index) { 88f }).dp).padding(horizontal = 12.dp)) {
                        SheetCell(cell, header)
                    }
                }
            }
            Box(Modifier.width(1.dp).height(44.dp).background(MaterialTheme.colorScheme.outlineVariant))
        }
        Row(
            Modifier
                .weight(1f)
                .horizontalScroll(hScroll),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            cells.drop(pinned).forEachIndexed { index, cell ->
                val col = pinned + index
                if (col > pinned) Box(Modifier.width(1.dp).height(44.dp).background(MaterialTheme.colorScheme.outlineVariant))
                Box(Modifier.width((widths.getOrElse(col) { 88f }).dp).padding(horizontal = 12.dp)) {
                    SheetCell(cell, header)
                }
            }
        }
    }
}

@Composable
private fun SheetCell(cell: String, header: Boolean) {
    Text(
        text = cell,
        style = if (header) MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.W600)
        else MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurface,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun ImagePane(bitmap: androidx.compose.ui.graphics.ImageBitmap, edge: Color, onTap: () -> Unit) {
    val context = LocalContext.current
    androidx.compose.runtime.DisposableEffect(edge) {
        val controller = com.localdesk.mobile.core.Handoff.findActivity(context)?.window
            ?.let { androidx.core.view.WindowCompat.getInsetsController(it, it.decorView) }
        controller?.isAppearanceLightStatusBars = edge.luminance() > 0.5f
        onDispose { controller?.isAppearanceLightStatusBars = false }
    }
    val zoom = remember { ZoomState() }
    Box(Modifier.fillMaxSize().background(edge)) {
        ZoomPane(Modifier.fillMaxSize(), onTap = onTap, state = zoom) {
            Image(
                bitmap = bitmap,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        }
        ZoomToolbar(zoom)
    }
}

/**
 * Pinch-zoom pane shared by images. Single finger at scale 1 is NOT consumed
 * (scroll passes through); pinch or zoomed pan is handled here. Zoom state is
 * hoistable so the floating toolbar drives the same scale.
 */
@Composable
fun ZoomPane(
    modifier: Modifier = Modifier,
    onTap: () -> Unit = {},
    maxScale: Float = 4f,
    state: ZoomState = remember { ZoomState() },
    content: @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit,
) {
    val zoom = state
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }

    Box(
        modifier = modifier
            .clipToBounds()
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { onTap() },
                    onDoubleTap = { zoom.reset() },
                )
            }
            .pointerInput(maxScale) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        val gesture = event.calculateZoom()
                        val pan = event.calculatePan()
                        if (zoom.scale > 1f || gesture != 1f) {
                            zoom.scale = (zoom.scale * gesture).coerceIn(1f, maxScale)
                            if (zoom.scale > 1f) { zoom.px += pan.x; zoom.py += pan.y } else { zoom.px = 0f; zoom.py = 0f }
                            val maxX = size.width * (zoom.scale - 1f) / 2f
                            val maxY = size.height * (zoom.scale - 1f) / 2f
                            zoom.px = zoom.px.coerceIn(-maxX, maxX)
                            zoom.py = zoom.py.coerceIn(-maxY, maxY)
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .onSizeChanged { size = it }
                .graphicsLayer {
                    scaleX = zoom.scale
                    scaleY = zoom.scale
                    translationX = zoom.px
                    translationY = zoom.py
                },
            content = content,
        )
    }
}
