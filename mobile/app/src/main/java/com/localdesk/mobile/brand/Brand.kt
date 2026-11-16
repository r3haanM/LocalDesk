package com.localdesk.mobile.brand

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ---- Brand anchors (from the official LocalDesk palette) ----
val Red = Color(0xFFE1322E)        // accent: badges, CTA, sweep
val RedDeep = Color(0xFFC11B1B)    // pressed / swipe
val Charcoal = Color(0xFF1C1B1A)   // reader chrome (both themes)
val Green = Color(0xFF1B7A43)      // secondary only: success dot, logo family
val Paper = Color(0xFFFFFFFF)      // PDF page — never inverted
val Ink = Color(0xFF1C1B1A)
val InkSoft = Color(0xFF57534E)
val PaperWhite = Color(0xFFFFFFFF)
val PaperWarm = Color(0xFFFAF9F7)
val PaperCard = Color(0xFFF4F1EE)
val PaperLine = Color(0xFFD5D0C9)
val NightBg = Color(0xFF171514)
val NightInk = Color(0xFFECE6E1)
val NightInkSoft = Color(0xFFD3CCC5)
val NightCard = Color(0xFF1E1C1B)
val NightLine = Color(0xFF45403B)

val RadiusChip = 6.dp
val RadiusButton = 10.dp
val RadiusCard = 14.dp
val RadiusFab = 16.dp

val AppTypography = Typography(
    headlineLarge = TextStyle(fontSize = 32.sp, lineHeight = 40.sp, fontWeight = FontWeight.W700),
    headlineSmall = TextStyle(fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.W700),
    titleLarge = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.W700),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.W500),
    titleSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.W600),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.25.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.15.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.25.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.W600, letterSpacing = 0.4.sp),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.W600, letterSpacing = 0.4.sp),
    labelSmall = TextStyle(fontSize = 10.sp, lineHeight = 14.sp, fontWeight = FontWeight.W700, letterSpacing = 0.6.sp),
)

// ---- Full Material 3 schemes so every container role stays on-brand ----
fun lightScheme(): androidx.compose.material3.ColorScheme = androidx.compose.material3.lightColorScheme(
    primary = Red,
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFF9DCD8),
    onPrimaryContainer = Color(0xFF8C1611),
    secondary = Color(0xFF4A4541),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFEDE7E1),
    onSecondaryContainer = Color(0xFF3B3631),
    tertiary = Green,
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFCFF3DF),
    onTertiaryContainer = Color(0xFF0A4625),
    error = Color(0xFFB32618),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFF2B8B5),
    onErrorContainer = Color(0xFF410002),
    background = PaperWarm,
    onBackground = Ink,
    surface = PaperWarm,
    onSurface = Ink,
    surfaceVariant = Color(0xFFF0EDE9),
    onSurfaceVariant = InkSoft,
    surfaceDim = Color(0xFFE0DCD7),
    surfaceBright = Color(0xFFFFFEFC),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = PaperCard,
    surfaceContainer = Color(0xFFEFEBE7),
    surfaceContainerHigh = Color(0xFFE9E5E0),
    surfaceContainerHighest = Color(0xFFE3DFD9),
    outline = Color(0xFF847E77),
    outlineVariant = PaperLine,
    inverseSurface = Color(0xFF322F2C),
    inverseOnSurface = Color(0xFFF6F2ED),
    inversePrimary = Color(0xFFFFB3AB),
    scrim = Color(0xFF000000),
)

fun darkScheme(): androidx.compose.material3.ColorScheme = androidx.compose.material3.darkColorScheme(
    primary = Color(0xFFF2635B),
    onPrimary = Color(0xFF4A0E0B),
    primaryContainer = Color(0xFFA8281F),
    onPrimaryContainer = Color(0xFFFFDAD5),
    secondary = Color(0xFFCBC4BE),
    onSecondary = Color(0xFF33302C),
    secondaryContainer = Color(0xFF3B3631),
    onSecondaryContainer = Color(0xFFEDE7E1),
    tertiary = Color(0xFF71C795),
    onTertiary = Color(0xFF00391E),
    tertiaryContainer = Color(0xFF10592F),
    onTertiaryContainer = Color(0xFFB9F2D2),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = NightBg,
    onBackground = NightInk,
    surface = NightBg,
    onSurface = NightInk,
    surfaceVariant = Color(0xFF292523),
    onSurfaceVariant = NightInkSoft,
    surfaceDim = Color(0xFF121110),
    surfaceBright = Color(0xFF3B3733),
    surfaceContainerLowest = Color(0xFF0F0E0D),
    surfaceContainerLow = NightCard,
    surfaceContainer = Color(0xFF242220),
    surfaceContainerHigh = Color(0xFF2A2826),
    surfaceContainerHighest = Color(0xFF35322F),
    outline = Color(0xFF9C948D),
    outlineVariant = NightLine,
    inverseSurface = Color(0xFFFAF9F7),
    inverseOnSurface = Color(0xFF2A2724),
    inversePrimary = Red,
    scrim = Color(0xFF000000),
)

val AppShapes = Shapes(
    small = RoundedCornerShape(RadiusButton),
    medium = RoundedCornerShape(RadiusCard),
    large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

// ---- Reader chrome (theme-independent, Adobe-mood) ----
val ChromeBar = Charcoal
val ChromeIcon = Color(0xFFF4F0EC)
val ChromeIndicatorText = PaperWarm
val ChromeTextDim = Color(0xFFB8B0A8)
val PdfCanvas = Color(0xFF121110)

// Darkness flag for components outside MaterialTheme (chips inside charcoal chrome).
val LocalIsDark = androidx.compose.runtime.staticCompositionLocalOf { false }
