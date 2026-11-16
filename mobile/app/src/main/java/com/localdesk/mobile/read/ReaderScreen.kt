package com.localdesk.mobile.read

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.localdesk.mobile.MobileApp
import com.localdesk.mobile.core.PdfHighlight
import com.localdesk.mobile.R
import com.localdesk.mobile.brand.ChromeBar
import com.localdesk.mobile.brand.ChromeIcon
import com.localdesk.mobile.core.Handoff
import com.localdesk.mobile.core.Kind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Universal reader shell: auto-hiding charcoal top bar (back, format chip, title, share,
 * overflow), format-dispatched pane, pinned simplified-preview badge. Chrome hides on
 * downward scroll / page swipe; tap brings it back.
 */
@Composable
fun ReaderScreen(uriString: String, isDark: Boolean, onBack: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as MobileApp
    val activity = remember { Handoff.findActivity(context) }

    val model: ReaderModel = viewModel(
        key = uriString,
        factory = viewModelFactory {
            initializer { ReaderModel(context.applicationContext as android.app.Application, uriString) }
        },
    )
    val state by model.ui.collectAsState()
    val ready = state as? ReaderState.Ready

    var chromeVisible by rememberSaveable { mutableStateOf(true) }
    var mono by rememberSaveable { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var aboutOpen by remember { mutableStateOf(false) }
    var searchOpen by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var showThumbs by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val slidesListState = rememberLazyListState()
    val pdfListState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Reader status bar: light icons over charcoal chrome in both themes.
    DisposableEffect(isDark) {
        val controller = activity?.window?.let { window ->
            WindowCompat.getInsetsController(window, window.decorView)
        }
        controller?.isAppearanceLightStatusBars = false
        onDispose { controller?.isAppearanceLightStatusBars = !isDark }
    }

    // Scroll-driven chrome for the scrolling panes.
    val density = LocalDensity.current
    val hideAt = with(density) { 8.dp.toPx() }
    val showAt = with(density) { 2.dp.toPx() }
    LaunchedEffect(pdfListState) {
        var prevIndexP = 0
        var prevOffsetP = 0
        snapshotFlow { pdfListState.firstVisibleItemIndex to pdfListState.firstVisibleItemScrollOffset }
            .collect { (index, offset) ->
                when {
                    index > prevIndexP || (index == prevIndexP && offset > prevOffsetP + hideAt) ->
                        chromeVisible = false
                    index < prevIndexP || (index == prevIndexP && offset < prevOffsetP - showAt) ->
                        chromeVisible = true
                }
                prevIndexP = index
                prevOffsetP = offset
            }
    }
    LaunchedEffect(listState) {
        var prevIndex = 0
        var prevOffset = 0
        snapshotFlow { listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset }
            .collect { (index, offset) ->
                when {
                    index > prevIndex || (index == prevIndex && offset > prevOffset + hideAt) ->
                        chromeVisible = false
                    index < prevIndex || (index == prevIndex && offset < prevOffset - showAt) ->
                        chromeVisible = true
                }
                prevIndex = index
                prevOffset = offset
            }
    }

    fun share() {
        val current = activity ?: return
        Handoff.share(current, Handoff.outbound(current, model.source), model.mime, current.getString(R.string.share_title))
    }

    fun openWith() {
        val current = activity ?: return
        Handoff.openWith(current, Handoff.outbound(current, model.source), model.mime)
    }

    fun remove() {
        scope.launch(Dispatchers.IO) {
            app.library.remove(uriString)
            OpenCachePurge(context, uriString)
        }
        onBack()
    }

    val statusBarTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val barTop = statusBarTop + 56.dp
    val scrollPadding = androidx.compose.foundation.layout.PaddingValues(
        top = barTop + if (ready?.badge == true) 36.dp else 0.dp,
        bottom = 24.dp,
    )

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when (val current = state) {
            ReaderState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            is ReaderState.Failure -> FailurePane(
                info = current.info,
                onOpenWith = { openWith() },
                onRemove = { remove() },
                modifier = Modifier.fillMaxSize(),
            )
            is ReaderState.Ready -> {
                Box(Modifier.fillMaxSize()) {
                    when (val doc = current.doc) {
                        is Doc.Pdf -> PdfPane(
                            model = model,
                            pages = doc.pages,
                            aspects = doc.aspects,
                            pdfText = model.pdfText,
                            highlights = model.highlights.collectAsState().value,
                            showThumbs = showThumbs,
                            onDismissThumbs = { showThumbs = false },
                            onAddHighlight = { h -> scope.launch(Dispatchers.IO) { app.library.addHighlight(h) } },
                            chromeVisible = chromeVisible,
                            onToggleChrome = { chromeVisible = !chromeVisible },
                            listState = pdfListState,
                            modifier = Modifier.fillMaxSize(),
                        )
                        is Doc.Picture -> ImagePane(
                            bitmap = doc.bitmap,
                            edge = doc.edge,
                            onTap = { chromeVisible = !chromeVisible },
                        )
                        is Doc.Handoff -> HandoffPane(
                            kind = doc.kind,
                            onOpenWith = { openWith() },
                            modifier = Modifier.fillMaxSize(),
                        )
                        is Doc.Text -> TextPane(doc.text, doc.code, mono, listState, scrollPadding)
                        is Doc.Document -> DocPane(doc.blocks, doc.markdown, mono, doc.header, doc.footer, listState, scrollPadding)
                        is Doc.Deck -> SlidesPane(doc.slides, slidesListState, scrollPadding)
                        is Doc.GridDoc -> SheetPane(doc.data, listState, scrollPadding)
                    }
                    if (model.cachedCopy) {
                        Row(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(top = statusBarTop + 4.dp, end = 8.dp)
                                .background(
                                    MaterialTheme.colorScheme.surfaceContainerHighest,
                                    MaterialTheme.shapes.small,
                                )
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.cached_copy),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (current.badge) {
                        val badgeTop by androidx.compose.animation.core.animateDpAsState(
                            targetValue = if (chromeVisible) barTop + 8.dp else statusBarTop + 8.dp,
                            label = "badgeTop",
                        )
                        PreviewBadge(
                            modifier = Modifier
                                .align(Alignment.TopStart)
                                .padding(start = 16.dp, top = badgeTop),
                        )
                    }
                }
            }
        }

        ReaderBar(
            visible = chromeVisible,
            title = model.title,
            kind = model.kind,
            onBack = onBack,
            menuOpen = menuOpen,
            onMenuToggle = { menuOpen = !menuOpen },
            onMenuDismiss = { menuOpen = false },
            monoItem = ready?.monoToggle == true,
            aboutItem = ready?.badge == true,
            onMono = { mono = !mono; menuOpen = false },
            onAbout = { aboutOpen = true; menuOpen = false },
            onShare = { menuOpen = false; share() },
            onOpenWith = { menuOpen = false; openWith() },
            onRemove = { menuOpen = false; removeFromRecents(scope, app, uriString) { onBack() } },
            searchItem = (ready?.doc as? Doc.Pdf) != null,
            thumbsItem = (ready?.doc as? Doc.Pdf) != null,
            onSearch = { menuOpen = false; searchOpen = true },
            onThumbs = { menuOpen = false; showThumbs = true },
            modifier = Modifier.align(Alignment.TopCenter),
        )

        if (searchOpen) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { searchOpen = false },
                title = { Text(stringResource(R.string.menu_search)) },
                text = {
                    Column {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            singleLine = true,
                            placeholder = { Text(stringResource(R.string.search_hint)) },
                        )
                        val hits = remember(searchQuery, model.pdfText) {
                            val q = searchQuery.trim()
                            val doc = model.pdfText ?: return@remember emptyList<Pair<Int, String>>()
                            if (q.length < 2) return@remember emptyList()
                            doc.pages.flatMapIndexed { page, pt ->
                                val plain = pt.plain
                                val out = mutableListOf<Pair<Int, String>>()
                                var from = 0
                                while (true) {
                                    val i = plain.indexOf(q, from, ignoreCase = true)
                                    if (i < 0) break
                                    val a = (i - 24).coerceAtLeast(0)
                                    val b = (i + q.length + 24).coerceAtMost(plain.length)
                                    out += (page + 1) to plain.substring(a, b).replace('\n', ' ')
                                    from = i + q.length
                                    if (out.size >= 50) break
                                }
                                out
                            }
                        }
                        Text(
                            text = when {
                                searchQuery.trim().length < 2 -> ""
                                hits.isEmpty() -> stringResource(R.string.search_no_hits)
                                else -> stringResource(R.string.search_matches, hits.size)
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 6.dp),
                        )
                        Column(
                            Modifier
                                .heightIn(max = 280.dp)
                                .verticalScroll(rememberScrollState()),
                        ) {
                            hits.forEach { (pageNo, snippet) ->
                                Text(
                                    text = "${stringResource(R.string.search_page, pageNo)} · …$snippet…",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            searchOpen = false
                                            scope.launch { pdfListState.animateScrollToItem(pageNo - 1) }
                                        }
                                        .padding(vertical = 6.dp),
                                )
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { searchOpen = false }) { Text(stringResource(R.string.ok)) }
                },
            )
        }
        if (aboutOpen) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { aboutOpen = false },
                title = { Text(stringResource(R.string.preview_badge)) },
                text = { Text(stringResource(R.string.preview_badge_detail)) },
                confirmButton = {
                    TextButton(onClick = { aboutOpen = false }) { Text(stringResource(R.string.ok)) }
                },
            )
        }
    }
}

private fun removeFromRecents(scope: kotlinx.coroutines.CoroutineScope, app: MobileApp, uriString: String, done: () -> Unit) {
    scope.launch(Dispatchers.IO) {
        app.library.remove(uriString)
        OpenCachePurge(app, uriString)
    }
    done()
}

@Composable
private fun ReaderBar(
    visible: Boolean,
    title: String,
    kind: Kind?,
    onBack: () -> Unit,
    menuOpen: Boolean,
    onMenuToggle: () -> Unit,
    onMenuDismiss: () -> Unit,
    monoItem: Boolean,
    aboutItem: Boolean,
    searchItem: Boolean,
    thumbsItem: Boolean,
    onSearch: () -> Unit,
    onThumbs: () -> Unit,
    onMono: () -> Unit,
    onAbout: () -> Unit,
    onShare: () -> Unit,
    onOpenWith: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val alpha by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = androidx.compose.animation.core.tween(
            durationMillis = if (visible) 180 else 160,
            easing = androidx.compose.animation.core.FastOutSlowInEasing,
        ),
        label = "barAlpha",
    )
    val tyPx = with(LocalDensity.current) { 24.dp.toPx() }
    val ty by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (visible) 0f else -tyPx,
        animationSpec = androidx.compose.animation.core.tween(
            durationMillis = if (visible) 180 else 160,
            easing = androidx.compose.animation.core.FastOutSlowInEasing,
        ),
        label = "barTy",
    )
    androidx.compose.foundation.layout.Row(
        modifier = modifier
            .fillMaxWidth()
            .background(com.localdesk.mobile.brand.Charcoal)
            .graphicsLayer { this.alpha = alpha; this.translationY = ty }
            .statusBarsPadding()
            .height(56.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
            Icon(
                imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = stringResource(R.string.action_back),
                tint = com.localdesk.mobile.brand.ChromeIcon,
            )
        }
        androidx.compose.foundation.layout.Spacer(Modifier.size(12.dp))
        if (kind != null && visible) {
            FormatChip(kind.chip, forceDark = true)
            androidx.compose.foundation.layout.Spacer(Modifier.size(8.dp))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = ChromeIcon,
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onShare, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Outlined.Share, contentDescription = stringResource(R.string.action_share), tint = com.localdesk.mobile.brand.ChromeIcon)
        }
        Box {
            IconButton(onClick = onMenuToggle, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Outlined.MoreVert, contentDescription = stringResource(R.string.action_more), tint = com.localdesk.mobile.brand.ChromeIcon)
            }
            DropdownMenu(
                expanded = menuOpen,
                onDismissRequest = onMenuDismiss,
                shape = MaterialTheme.shapes.large,
                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            ) {
                if (searchItem) DropdownMenuItem(
                    text = { Text(stringResource(R.string.menu_search)) },
                    onClick = onSearch,
                )
                if (thumbsItem) DropdownMenuItem(
                    text = { Text(stringResource(R.string.menu_thumbnails)) },
                    onClick = onThumbs,
                )
                if (monoItem) DropdownMenuItem(
                    text = { Text(stringResource(R.string.menu_mono)) },
                    onClick = onMono,
                )
                if (aboutItem) DropdownMenuItem(
                    text = { Text(stringResource(R.string.menu_about_preview)) },
                    onClick = onAbout,
                )
                DropdownMenuItem(text = { Text(stringResource(R.string.menu_share)) }, onClick = onShare)
                DropdownMenuItem(text = { Text(stringResource(R.string.menu_open_with)) }, onClick = onOpenWith)
                DropdownMenuItem(text = { Text(stringResource(R.string.menu_remove)) }, onClick = onRemove)
            }
        }
        androidx.compose.foundation.layout.Spacer(Modifier.size(4.dp))
    }
}

@Composable
private fun FailurePane(info: ReaderFailure, onOpenWith: () -> Unit, onRemove: () -> Unit, modifier: Modifier = Modifier) {
    val title = stringResource(info.titleRes)
    val body = info.bodyArg?.let { arg -> stringResource(info.bodyRes, arg) } ?: stringResource(info.bodyRes)
    Column(
        modifier = modifier.padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        Icon(
            imageVector = if (info.lock) Icons.Outlined.Lock else Icons.Outlined.ErrorOutline,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(40.dp),
        )
        androidx.compose.foundation.layout.Spacer(Modifier.size(16.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground, textAlign = TextAlign.Center)
        androidx.compose.foundation.layout.Spacer(Modifier.size(8.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (info.openWith) {
            androidx.compose.foundation.layout.Spacer(Modifier.size(24.dp))
            Button(
                onClick = onOpenWith,
                shape = MaterialTheme.shapes.small,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
                modifier = Modifier.height(48.dp),
            ) {
                Text(stringResource(R.string.action_open_with), style = MaterialTheme.typography.labelLarge)
            }
        }
        if (info.removable) {
            androidx.compose.foundation.layout.Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = onRemove,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.height(48.dp),
            ) {
                Text(stringResource(R.string.action_remove), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun HandoffPane(kind: Kind, onOpenWith: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        FormatChip(kind.chip, forceDark = false, tile = true)
        androidx.compose.foundation.layout.Spacer(Modifier.size(24.dp))
        Text(
            text = if (kind.isLegacy) stringResource(R.string.legacy_title, kind.chip) else stringResource(R.string.unknown_title),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        androidx.compose.foundation.layout.Spacer(Modifier.size(8.dp))
        Text(
            text = if (kind.isLegacy) stringResource(R.string.legacy_body) else stringResource(R.string.unknown_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        androidx.compose.foundation.layout.Spacer(Modifier.size(24.dp))
        Button(
            onClick = onOpenWith,
            shape = MaterialTheme.shapes.small,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
            modifier = Modifier.height(48.dp),
        ) {
            Text(stringResource(R.string.action_open_with), style = MaterialTheme.typography.labelLarge)
        }
    }
}
