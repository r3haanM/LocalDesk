package com.localdesk.mobile.read

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material.icons.outlined.ZoomOut
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.localdesk.mobile.R
import com.localdesk.mobile.brand.Charcoal
import com.localdesk.mobile.brand.ChromeIcon
import com.localdesk.mobile.brand.ChromeIndicatorText
import com.localdesk.mobile.brand.LocalIsDark
import com.localdesk.mobile.brand.Red
import com.localdesk.mobile.core.Kind
import com.localdesk.mobile.core.Source

private val chipLight = mapOf<String, Pair<Long, Long>>(
    "PDF" to Pair(0xFFA31F17L, 0xFFFAE1DEL),
    "DOCX" to Pair(0xFF1E4E8CL, 0xFFDBE7F8L),
    "PPTX" to Pair(0xFF9C4A10L, 0xFFFCE9D9L),
    "XLSX" to Pair(0xFF14602FL, 0xFFD7F2E2L),
    "CSV" to Pair(0xFF0F766EL, 0xFFCCECE7L),
    "TXT" to Pair(0xFF3C4855L, 0xFFE5E7EAL),
    "IMG" to Pair(0xFF5B3A99L, 0xFFEBE3F6L),
)

private val chipDark = mapOf<String, Pair<Long, Long>>(
    "PDF" to Pair(0xFFFFB3ABL, 0xFF52160FL),
    "DOCX" to Pair(0xFFA9CCF5L, 0xFF12304EL),
    "PPTX" to Pair(0xFFFFB68CL, 0xFF55250AL),
    "XLSX" to Pair(0xFF8FDFB4L, 0xFF0F3B20L),
    "CSV" to Pair(0xFF7DD3C0L, 0xFF0C3B36L),
    "TXT" to Pair(0xFFB9C6D4L, 0xFF222B33L),
    "IMG" to Pair(0xFFC6B4EEL, 0xFF2A1E45L),
)

private fun chipColors(label: String, dark: Boolean): Pair<Long, Long> =
    (if (dark) chipDark else chipLight)[label] ?: (0xFF4B4640L to 0xFFE8E5E1L)

/** Format chip, tile or pill variant; pill inside the charcoal reader bar (always dark). */
@Composable
fun FormatChip(label: String, forceDark: Boolean, tile: Boolean = false, modifier: Modifier = Modifier) {
    val (fg, bg) = chipColors(label, dark = forceDark || LocalIsDark.current)
    if (tile) {
        Box(
            modifier = modifier
                .size(40.dp)
                .background(Color(bg), RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = Color(fg))
        }
    } else {
        Box(
            modifier = modifier.background(Color(bg), RoundedCornerShape(50)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = Color(fg),
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

@Composable
fun Kind.ChipPill(forceDark: Boolean, modifier: Modifier = Modifier) =
    FormatChip(chip, forceDark = forceDark, modifier = modifier)

@Composable
fun Kind.ChipTile(modifier: Modifier = Modifier) =
    FormatChip(chip, forceDark = false, tile = true, modifier = modifier)

@Composable
fun PreviewBadge(modifier: Modifier = Modifier) {
    val dark = LocalIsDark.current
    val bg = if (dark) Color(0xFF3B2D0E) else Color(0xFFF7E8C8)
    val fg = if (dark) Color(0xFFF0D08F) else Color(0xFF6E4A0E)
    Row(
        modifier = modifier
            .height(26.dp)
            .background(bg, RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.preview_badge),
            style = MaterialTheme.typography.labelMedium,
            color = fg,
        )
    }
}

/** Purges the cached body when a recents entry is removed. Best effort. */
fun OpenCachePurge(context: android.content.Context, uriString: String) {
    runCatching { Source(context, uriString).purgeCache() }
}

/** Zoom + pan shared between the pinch gestures and the floating toolbar buttons. */
class ZoomState {
    var scale by mutableFloatStateOf(1f)
    var px by mutableFloatStateOf(0f)
    var py by mutableFloatStateOf(0f)
    fun reset() {
        scale = 1f; px = 0f; py = 0f
    }
}

/**
 * Adobe-style floating toolbar — the SAME charcoal pill every reader pane:
 * optional prev/next nav · indicator (long-press = zoom slider) · optional zoom pair.
 * Always visible, docked bottom-center by the caller.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun ReaderToolbar(
    indicator: String,
    modifier: Modifier = Modifier,
    navPrev: (() -> Unit)? = null,
    prevEnabled: Boolean = true,
    navNext: (() -> Unit)? = null,
    nextEnabled: Boolean = true,
    zoomOut: (() -> Unit)? = null,
    zoomOutEnabled: Boolean = true,
    zoomIn: (() -> Unit)? = null,
    zoomInEnabled: Boolean = true,
    zoomValue: Float? = null,
    zoomRange: ClosedFloatingPointRange<Float> = 1f..4f,
    onZoomSlider: ((Float) -> Unit)? = null,
) {
    var sliderOpen by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    Row(
        modifier = modifier
            .shadow(10.dp, RoundedCornerShape(50))
            .background(Charcoal.copy(alpha = 0.94f), RoundedCornerShape(50))
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (navPrev != null) {
            IconButton(onClick = navPrev, enabled = prevEnabled, modifier = Modifier.size(48.dp)) {
                Icon(
                    Icons.Outlined.ChevronLeft,
                    contentDescription = stringResource(R.string.cd_prev_page),
                    tint = ChromeIcon,
                )
            }
        }
        Box {
            Text(
                text = indicator,
                style = MaterialTheme.typography.labelMedium,
                color = ChromeIndicatorText,
                modifier = Modifier
                    .padding(horizontal = 10.dp)
                    .combinedClickable(
                        onClick = {},
                        onLongClick = { if (onZoomSlider != null) sliderOpen = true },
                    ),
            )
            if (onZoomSlider != null && zoomValue != null) {
                androidx.compose.material3.DropdownMenu(
                    expanded = sliderOpen,
                    onDismissRequest = { sliderOpen = false },
                ) {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                        androidx.compose.material3.Slider(
                            value = zoomValue,
                            onValueChange = onZoomSlider,
                            valueRange = zoomRange,
                            modifier = Modifier.width(220.dp),
                        )
                    }
                }
            }
        }
        if (navNext != null) {
            IconButton(onClick = navNext, enabled = nextEnabled, modifier = Modifier.size(48.dp)) {
                Icon(
                    Icons.Outlined.ChevronRight,
                    contentDescription = stringResource(R.string.cd_next_page),
                    tint = ChromeIcon,
                )
            }
        }
        if (navPrev != null && zoomOut != null) {
            Box(
                Modifier
                    .width(1.dp)
                    .height(24.dp)
                    .background(ChromeIcon.copy(alpha = 0.25f)),
            )
        }
        if (zoomOut != null) {
            IconButton(onClick = zoomOut, enabled = zoomOutEnabled, modifier = Modifier.size(48.dp)) {
                Icon(
                    Icons.Outlined.ZoomOut,
                    contentDescription = stringResource(R.string.cd_zoom_out),
                    tint = ChromeIcon,
                )
            }
        }
        if (zoomIn != null) {
            IconButton(onClick = zoomIn, enabled = zoomInEnabled, modifier = Modifier.size(48.dp)) {
                Icon(
                    Icons.Outlined.ZoomIn,
                    contentDescription = stringResource(R.string.cd_zoom_in),
                    tint = ChromeIcon,
                )
            }
        }
    }
}
