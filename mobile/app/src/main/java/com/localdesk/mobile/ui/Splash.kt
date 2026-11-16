package com.localdesk.mobile.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.localdesk.mobile.R
import com.localdesk.mobile.brand.ChromeTextDim
import com.localdesk.mobile.brand.PaperWhite
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/**
 * Intro - PARTICLE STORM.
 *
 * 130 particles in the icon's own colors streak in from the screen edges and snap into
 * the app-icon silhouette (targets sampled from the actual brand asset, seeded shuffle -
 * identical every launch). Each lock sparks a flash; the real icon solidifies in their
 * place; a light pulse runs through it; the wordmark types in like a machine; a
 * shockwave ring blasts outward and becomes the transition into the Library.
 *
 * Clock-driven: one Animatable timeline (0..1 over ~2.75 s) - every beat derives from it,
 * so the whole choreography is deterministic. Tap to skip; reduced motion shows the
 * final frame and exits in 400 ms.
 */
@Composable
fun IntroSplash(onExit: () -> Unit) {
    val context = LocalContext.current
    val currentOnExit by rememberUpdatedState(onExit)
    val reducedMotion = android.provider.Settings.Global.getFloat(
        context.contentResolver,
        android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,
        1f,
    ) == 0f

    var exitStarted by remember { mutableStateOf(false) }
    val exitAlpha by animateFloatAsState(
        targetValue = if (exitStarted) 0f else 1f,
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "exitAlpha",
    )
    val exitUp by animateFloatAsState(
        targetValue = if (exitStarted) -50f else 0f,
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "exitUp",
    )
    LaunchedEffect(exitStarted) {
        if (exitStarted) {
            delay(270)
            currentOnExit()
        }
    }

    val configuration = LocalConfiguration.current
    val density = LocalDensity.current
    val exitUpPx = with(density) { exitUp.dp.toPx() }
    val screenW = with(density) { configuration.screenWidthDp.dp.toPx() }
    val screenH = with(density) { configuration.screenHeightDp.dp.toPx() }

    // Layout anchors (px): icon center sits high; wordmark below it.
    val iconSizePx = with(density) { 132.dp.toPx() }
    val iconCenterY = screenH * 0.40f
    val iconCenterX = screenW / 2f
    val wordmarkY = iconCenterY + iconSizePx / 2f + with(density) { 30.dp.toPx() }
    val taglineY = wordmarkY + with(density) { 58.dp.toPx() }

    // ---- Particle targets sampled from the ORIGINAL brand asset ----
    data class Particle(
        val sx: Float,
        val sy: Float,
        val nx: Float,
        val ny: Float,
        val color: Color,
        val sizePx: Float,
        val delay: Float,
    )

    val particles = remember {
        val bitmap = android.graphics.BitmapFactory.decodeResource(
            context.resources,
            R.drawable.ic_brand_app,
        )
        val w = bitmap.width
        val h = bitmap.height
        val candidates = mutableListOf<Pair<Float, Pair<Float, Int>>>()
        var yy = 0
        while (yy < h) {
            var xx = 0
            while (xx < w) {
                val pixel = bitmap.getPixel(xx, yy)
                if (android.graphics.Color.alpha(pixel) > 120) {
                    candidates += Pair(xx.toFloat() / w, Pair(yy.toFloat() / h, pixel))
                }
                xx += 3
            }
            yy += 3
        }
        bitmap.recycle()

        val rng = Random(42) // deterministic - identical every launch
        candidates.shuffle(rng)

        val count = minOf(130, candidates.size)
        val edgeRandom = Random(7)
        (0 until count).map { i ->
            val target = candidates[i]
            val nx = target.first
            val nyColor = target.second
            val pixel = nyColor.second
            val side = edgeRandom.nextInt(4)
            val along = edgeRandom.nextFloat()
            val depth = 80f + edgeRandom.nextFloat() * 240f
            val start = when (side) {
                0 -> Pair(-depth / screenW, along)
                1 -> Pair(1f + depth / screenW, along)
                2 -> Pair(along, -depth / screenH)
                else -> Pair(along, 1f + depth / screenH)
            }
            val r = android.graphics.Color.red(pixel)
            val g = android.graphics.Color.green(pixel)
            val b = android.graphics.Color.blue(pixel)
            val boost = 60f
            val color = Color(
                (r + boost).coerceAtMost(255f).roundToInt(),
                (g + boost * 1.2f).coerceAtMost(255f).roundToInt(),
                (b + boost * 1.1f).coerceAtMost(255f).roundToInt(),
            )
            Particle(
                sx = start.first,
                sy = start.second,
                nx = nx,
                ny = nyColor.first,
                color = color,
                sizePx = 1.6f + edgeRandom.nextFloat() * 2.4f,
                delay = edgeRandom.nextFloat(),
            )
        }
    }

    // ---- Master clock: 0..1 over the full timeline (~2.75 s) ----
    val clock = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        if (!reducedMotion) {
            clock.animateTo(1f, tween(2750, easing = LinearEasing))
        } else {
            clock.snapTo(1f)
        }
    }
    val t = clock.value * 2.75f // seconds on the timeline

    fun ease(v: Float): Float {
        val x = v.coerceIn(0f, 1f)
        return 1f - (1f - x) * (1f - x) // ease-out quad
    }

    // ---- Derived beats ----
    val iconAlpha = if (reducedMotion) 1f else ease((t - 1.02f) / 0.32f)
    val particleFade = if (reducedMotion) 0f else (1f - ease((t - 1.02f) / 0.30f)).coerceIn(0f, 1f)
    val pulse = if (reducedMotion) 0f else sin(PI.toFloat() * ((t - 1.15f) / 0.28f).coerceIn(0f, 1f))
    val iconScale = 1f + 0.06f * pulse - 0.20f * ease((t - 1.5f) / 0.35f)
    val iconCenterYNow = iconCenterY - (iconSizePx * 0.10f) * ease((t - 1.5f) / 0.35f)
    val typeProgress = if (reducedMotion) 1f else ((t - 1.5f) / 0.5f).coerceIn(0f, 1f)
    val typedChars = (typeProgress * 9).roundToInt()
    val shockT = if (reducedMotion) 1f else ((t - 1.95f) / 0.55f).coerceIn(0f, 1f)
    val hazeDrift = if (reducedMotion) 0f else sin(t * 1.6f) * 0.03f

    // ---- Exit handoff ----
    LaunchedEffect(t) {
        if (!reducedMotion && clock.value >= 1f && !exitStarted) exitStarted = true
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color(0xFF0E2018), Color(0xFF081210))))
            .graphicsLayer {
                alpha = exitAlpha
                translationY = exitUpPx
            }
            .pointerInput(Unit) { detectTapGestures(onTap = { if (!exitStarted) exitStarted = true }) },
    ) {
        // Ambient haze: two slow drifting emerald glows.
        Canvas(Modifier.fillMaxSize()) {
            val haze = Color(0xFF10B981)
            drawCircle(
                brush = Brush.radialGradient(listOf(haze.copy(alpha = 0.07f), Color.Transparent)),
                radius = size.width * 0.55f,
                center = Offset(size.width * (0.28f + hazeDrift), size.height * 0.30f),
            )
            drawCircle(
                brush = Brush.radialGradient(listOf(haze.copy(alpha = 0.05f), Color.Transparent)),
                radius = size.width * 0.5f,
                center = Offset(size.width * (0.74f - hazeDrift), size.height * 0.72f),
            )
        }

        // Particle storm + lock flashes - targets form the icon silhouette.
        if (particleFade > 0f) {
            Canvas(Modifier.fillMaxSize()) {
                val iconLeft = iconCenterX - iconSizePx / 2f
                val iconTop = iconCenterYNow - iconSizePx / 2f
                for (p in particles) {
                    val pStart = 0.08f + p.delay * 0.22f
                    val prog = ease((t - pStart) / 0.42f)
                    if (prog <= 0f) continue
                    val target = Offset(iconLeft + p.nx * iconSizePx, iconTop + p.ny * iconSizePx)
                    val start = Offset(p.sx * size.width, p.sy * size.height)
                    val pos = Offset(
                        start.x + (target.x - start.x) * prog,
                        start.y + (target.y - start.y) * prog,
                    )
                    if (prog < 1f) {
                        val tail = Offset(
                            pos.x - (target.x - start.x) * 0.06f,
                            pos.y - (target.y - start.y) * 0.06f,
                        )
                        drawLine(
                            color = p.color.copy(alpha = 0.35f * particleFade),
                            start = tail,
                            end = pos,
                            strokeWidth = p.sizePx * 0.9f,
                        )
                    }
                    drawCircle(
                        color = p.color.copy(alpha = particleFade),
                        radius = p.sizePx,
                        center = pos,
                    )
                    if (prog >= 1f) {
                        val flash = ((t - (pStart + 0.42f)) / 0.14f).coerceIn(0f, 1f)
                        if (flash in 0.01f..1f) {
                            drawCircle(
                                color = Color.White.copy(alpha = (1f - flash) * 0.9f),
                                radius = p.sizePx * (1f + flash * 2.2f),
                                center = target,
                            )
                        }
                    }
                }
            }
        }

        // The real icon solidifies where the particles locked.
        Image(
            painter = painterResource(R.drawable.ic_brand_app),
            contentDescription = null,
            modifier = Modifier
                .offset(
                    x = with(density) { (iconCenterX - iconSizePx / 2f).toDp() },
                    y = with(density) { (iconCenterYNow - iconSizePx / 2f).toDp() },
                )
                .size(with(density) { iconSizePx.toDp() })
                .graphicsLayer {
                    alpha = iconAlpha
                    scaleX = iconScale
                    scaleY = iconScale
                },
        )

        // Wordmark - typewriter with blinking caret.
        val typed = "LocalDesk".take(typedChars)
        Box(
            Modifier
                .fillMaxWidth()
                .offset(y = with(density) { wordmarkY.toDp() }),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = typed,
                    style = MaterialTheme.typography.headlineLarge.copy(fontSize = 34.sp),
                    color = PaperWhite,
                )
                if (typeProgress in 0.01f..0.99f) {
                    Spacer(Modifier.width(4.dp))
                    Box(
                        Modifier
                            .size(2.dp, 30.dp)
                            .background(PaperWhite.copy(alpha = if (sin(t * 12f) > 0f) 0.9f else 0.2f)),
                    )
                }
            }
        }

        // Tagline rises after the type-in.
        Box(
            Modifier
                .fillMaxWidth()
                .offset(y = with(density) { (taglineY + (1f - ease((t - 2.0f) / 0.35f)) * 24).toDp() }),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.tagline),
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF9CCDB4),
                modifier = Modifier.graphicsLayer { alpha = if (reducedMotion) 1f else ease((t - 2.0f) / 0.35f) },
            )
        }

        // Shockwave rings from the icon center at ~1.95 s.
        if (shockT > 0f && shockT < 1f) {
            Canvas(Modifier.fillMaxSize()) {
                val maxR = size.width * 0.85f
                val eased = 1f - (1f - shockT) * (1f - shockT)
                drawCircle(
                    color = Color(0xFF34D399).copy(alpha = (1f - shockT) * 0.55f),
                    radius = eased * maxR,
                    center = Offset(iconCenterX, iconCenterYNow),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3.dp.toPx()),
                )
                drawCircle(
                    color = Color.White.copy(alpha = (1f - shockT) * 0.30f),
                    radius = eased * maxR * 0.8f,
                    center = Offset(iconCenterX, iconCenterYNow),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()),
                )
            }
        }

        // Skip hint.
        Text(
            text = stringResource(R.string.skip_intro),
            style = MaterialTheme.typography.labelMedium,
            color = ChromeTextDim,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 24.dp),
        )
    }
}
