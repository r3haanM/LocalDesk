package com.localdesk.mobile.lib

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay
import com.localdesk.mobile.R
import com.localdesk.mobile.brand.Ink
import com.localdesk.mobile.brand.InkSoft
import com.localdesk.mobile.brand.NightBg
import com.localdesk.mobile.brand.NightCard
import com.localdesk.mobile.brand.NightInk
import com.localdesk.mobile.brand.NightInkSoft
import com.localdesk.mobile.brand.NightLine
import com.localdesk.mobile.brand.PaperLine
import com.localdesk.mobile.brand.PaperWarm
import com.localdesk.mobile.brand.PaperWhite
import com.localdesk.mobile.brand.RadiusCard
import com.localdesk.mobile.brand.RedDeep
import com.localdesk.mobile.core.HumanBytes
import com.localdesk.mobile.core.HumanTime
import com.localdesk.mobile.core.OpenRecord
import com.localdesk.mobile.core.ThemePref
import com.localdesk.mobile.read.FormatChip

/**
 * Library v3 — modern home: brand gradient header with the white brand symbol,
 * an overlapping search pill, a hero card for the most-recent document, compact cards
 * with staggered entrance, theme menu, emerald FAB.
 */
@Composable
fun LibraryScreen(
    dark: Boolean,
    themePref: ThemePref,
    onThemeChange: (ThemePref) -> Unit,
    onOpen: (String) -> Unit,
) {
    val model: LibraryModel = viewModel()
    val records by model.records.collectAsState()
    val query by model.query.collectAsState()
    var menuOpen by remember { mutableStateOf(false) }

    val browse = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (!uris.isNullOrEmpty()) {
            model.addPicked(uris.toList()) { metas ->
                metas.firstOrNull()?.let { onOpen(it.uri) }
            }
        }
    }

    val visible = remember(records, query) { model.visible(records) }
    val bg = if (dark) NightBg else PaperWarm
    val ink = if (dark) NightInk else Ink
    val inkSoft = if (dark) NightInkSoft else InkSoft
    val cardBg = if (dark) NightCard else Color.White
    val line = if (dark) NightLine else PaperLine

    Box(Modifier.fillMaxSize().background(bg)) {
        Column(Modifier.fillMaxSize()) {
            // ---- Brand gradient header ----
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color(0xFF142C23), Color(0xFF0A1712))))
                    .padding(bottom = 46.dp),
            ) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(start = 20.dp, end = 8.dp, top = 10.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painter = painterResource(R.drawable.ic_brand_symbol_white),
                            contentDescription = null,
                            modifier = Modifier.size(34.dp),
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = stringResource(R.string.app_name),
                                style = MaterialTheme.typography.headlineSmall,
                                color = PaperWhite,
                            )
                            Text(
                                text = stringResource(R.string.tagline),
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF9CCDB4),
                            )
                        }
                        Box {
                            IconButton(onClick = { menuOpen = true }) {
                                Icon(
                                    Icons.Outlined.MoreVert,
                                    contentDescription = stringResource(R.string.action_more),
                                    tint = PaperWhite,
                                )
                            }
                            DropdownMenu(
                                expanded = menuOpen,
                                onDismissRequest = { menuOpen = false },
                                shape = MaterialTheme.shapes.large,
                                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                            ) {
                                ThemeItem(ThemePref.SYSTEM, themePref) { menuOpen = false; onThemeChange(it) }
                                ThemeItem(ThemePref.LIGHT, themePref) { menuOpen = false; onThemeChange(it) }
                                ThemeItem(ThemePref.DARK, themePref) { menuOpen = false; onThemeChange(it) }
                            }
                        }
                    }
                }
            }

            // ---- Overlapping search pill ----
            SearchPill(
                value = query,
                onValueChange = model::search,
                dark = dark,
                modifier = Modifier
                    .fillMaxWidth()
                    .offset(y = (-26).dp)
                    .padding(horizontal = 20.dp),
            )
            Spacer(Modifier.height(if (records.isEmpty()) 0.dp else 6.dp))

            if (records.isEmpty()) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    EmptyLibrary(onBrowse = { browse.launch(browseMimes()) }, dark = dark)
                }
            } else {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.library_section),
                        style = MaterialTheme.typography.titleSmall,
                        color = ink,
                    )
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier
                            .size(22.dp)
                            .background(Color(0xFF10B981).copy(alpha = 0.15f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = visible.size.toString(),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF059669),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                }

                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        start = 20.dp, end = 20.dp, top = 8.dp, bottom = 100.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (visible.isEmpty()) {
                        item(key = "none") {
                            Text(
                                text = stringResource(R.string.library_empty_search),
                                style = MaterialTheme.typography.bodyMedium,
                                color = inkSoft,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                            )
                        }
                    } else {
                        items(visible, key = { it.uri }) { record ->
                            val index = visible.indexOf(record)
                            StaggerIn(index) {
                                if (index == 0) {
                                    HeroRecordCard(
                                        record = record,
                                        dark = dark,
                                        onClick = {
                                            model.opened(record)
                                            onOpen(record.uri)
                                        },
                                        onRemove = { model.remove(record) },
                                    )
                                } else {
                                    RecordCard(
                                        record = record,
                                        dark = dark,
                                        onClick = {
                                            model.opened(record)
                                            onOpen(record.uri)
                                        },
                                        onRemove = { model.remove(record) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        androidx.compose.material3.ExtendedFloatingActionButton(
            onClick = { browse.launch(browseMimes()) },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(end = 20.dp, bottom = 20.dp),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(18.dp),
            containerColor = Color(0xFF059669),
            contentColor = PaperWhite,
            elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 4.dp, pressedElevation = 8.dp),
        ) {
            Icon(
                Icons.Outlined.FolderOpen,
                contentDescription = stringResource(R.string.cd_browse),
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.library_browse), style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun ThemeItem(pref: ThemePref, current: ThemePref, onPick: (ThemePref) -> Unit) {
    val label = when (pref) {
        ThemePref.SYSTEM -> stringResource(R.string.menu_theme_system)
        ThemePref.LIGHT -> stringResource(R.string.menu_theme_light)
        ThemePref.DARK -> stringResource(R.string.menu_theme_dark)
    }
    DropdownMenuItem(
        text = { Text(label) },
        leadingIcon = {
            if (current == pref) {
                Icon(Icons.Outlined.Check, contentDescription = null, modifier = Modifier.size(16.dp))
            }
        },
        onClick = { onPick(pref) },
    )
}

@Composable
private fun SearchPill(value: String, onValueChange: (String) -> Unit, dark: Boolean, modifier: Modifier = Modifier) {
    val pillBg = if (dark) NightCard else Color.White
    val inkSoft = if (dark) NightInkSoft else InkSoft
    Box(
        modifier = modifier
            .shadow(8.dp, RoundedCornerShape(50))
            .clip(RoundedCornerShape(50))
            .background(pillBg)
            .height(52.dp)
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Outlined.Search,
                contentDescription = stringResource(R.string.cd_search),
                tint = inkSoft,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(12.dp))
            Box {
                if (value.isEmpty()) {
                    Text(
                        stringResource(R.string.library_search_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = inkSoft,
                    )
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        color = if (dark) NightInk else Ink,
                    ),
                    cursorBrush = SolidColor(Color(0xFF059669)),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** Featured card for the most-recent document: taller, brand watermark, overflow menu. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HeroRecordCard(record: OpenRecord, dark: Boolean, onClick: () -> Unit, onRemove: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    val cardBg = if (dark) NightCard else Color.White
    val ink = if (dark) NightInk else Ink
    val inkSoft = if (dark) NightInkSoft else InkSoft

    Box(
        Modifier
            .fillMaxWidth()
            .shadow(10.dp, RoundedCornerShape(20.dp))
            .clip(RoundedCornerShape(20.dp))
            .background(cardBg)
            .combinedClickable(onClick = onClick, onLongClick = { menuOpen = true }),
    ) {
        Image(
            painter = painterResource(R.drawable.ic_brand_app),
            contentDescription = null,
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 4.dp)
                .size(110.dp),
            alpha = 0.07f,
        )
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                FormatChip(record.kind.chip, forceDark = dark, tile = true)
                Spacer(Modifier.weight(1f))
                Box {
                    IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Outlined.MoreVert,
                            contentDescription = stringResource(R.string.action_more),
                            tint = inkSoft,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    DropdownMenu(
                        expanded = menuOpen,
                        onDismissRequest = { menuOpen = false },
                        shape = MaterialTheme.shapes.large,
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    ) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.action_remove)) },
                            onClick = { menuOpen = false; onRemove() },
                        )
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = record.name,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.W700),
                color = ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(7.dp).background(com.localdesk.mobile.brand.Green, CircleShape))
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "${HumanBytes.format(record.sizeBytes)} · Opened ${HumanTime.ago(record.openedAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = inkSoft,
                )
            }
        }
        Icon(
            Icons.AutoMirrored.Outlined.KeyboardArrowRight,
            contentDescription = null,
            tint = inkSoft,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(12.dp),
        )
    }
}

/** Compact card for older entries. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RecordCard(record: OpenRecord, dark: Boolean, onClick: () -> Unit, onRemove: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    val cardBg = if (dark) NightCard else Color.White
    val ink = if (dark) NightInk else Ink
    val inkSoft = if (dark) NightInkSoft else InkSoft

    Row(
        Modifier
            .fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .background(cardBg)
            .combinedClickable(onClick = onClick, onLongClick = { menuOpen = true })
            .padding(start = 12.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FormatChip(record.kind.chip, forceDark = dark, tile = true)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = record.name,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.W600),
                color = ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (System.currentTimeMillis() - record.openedAt < 24 * 60 * 60 * 1000L) {
                    Box(Modifier.size(6.dp).background(com.localdesk.mobile.brand.Green, CircleShape))
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    text = "${HumanBytes.format(record.sizeBytes)} · Opened ${HumanTime.ago(record.openedAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = inkSoft,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                contentDescription = null,
                tint = inkSoft,
            )
            DropdownMenu(
                expanded = menuOpen,
                onDismissRequest = { menuOpen = false },
                shape = MaterialTheme.shapes.large,
                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            ) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.action_remove)) },
                    onClick = { menuOpen = false; onRemove() },
                )
            }
        }
    }
}

/** Staggered entrance: each item fades + rises, 55 ms apart. */
@Composable
fun StaggerIn(index: Int, content: @Composable () -> Unit) {
    val alpha = remember { Animatable(0f) }
    val rise = remember { Animatable(36f) }
    androidx.compose.runtime.LaunchedEffect(index) {
        delay(index * 55L)
        alpha.animateTo(1f, tween(320, easing = FastOutSlowInEasing))
        rise.animateTo(0f, tween(320, easing = FastOutSlowInEasing))
    }
    Box(Modifier.graphicsLayer { this.alpha = alpha.value; translationY = rise.value }) { content() }
}

@Composable
private fun EmptyLibrary(onBrowse: () -> Unit, dark: Boolean) {
    Column(
        Modifier.padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            painter = painterResource(R.drawable.ic_brand_symbol),
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            alpha = 0.85f,
        )
        Spacer(Modifier.height(20.dp))
        Text(
            text = stringResource(R.string.library_empty_title),
            style = MaterialTheme.typography.headlineSmall,
            color = if (dark) NightInk else Ink,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.library_empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = if (dark) NightInkSoft else InkSoft,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
        Spacer(Modifier.height(24.dp))
        androidx.compose.material3.Button(
            onClick = onBrowse,
            shape = MaterialTheme.shapes.small,
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                containerColor = Color(0xFF059669),
                contentColor = PaperWhite,
            ),
            modifier = Modifier.height(48.dp),
        ) {
            Text(stringResource(R.string.library_browse_files), style = MaterialTheme.typography.labelLarge)
        }
    }
}
