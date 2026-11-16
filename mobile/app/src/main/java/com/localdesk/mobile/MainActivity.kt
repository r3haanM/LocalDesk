package com.localdesk.mobile

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import com.localdesk.mobile.brand.AppTypography
import com.localdesk.mobile.brand.AppShapes
import com.localdesk.mobile.brand.NightBg
import com.localdesk.mobile.brand.NightInk
import com.localdesk.mobile.brand.PaperWarm
import com.localdesk.mobile.brand.Ink
import com.localdesk.mobile.ui.IntroSplash
import com.localdesk.mobile.core.ThemePref
import com.localdesk.mobile.lib.LibraryScreen
import com.localdesk.mobile.read.ReaderScreen
import kotlinx.coroutines.launch
import androidx.compose.material3.MaterialTheme

/**
 * Single activity: system splash → intro choreography → library ↔ reader.
 * ACTION_VIEW intents land here via the manifest filters (content scheme only).
 */
class MainActivity : ComponentActivity() {

    private val pendingView = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) capture(intent) // warm intents arrive via onNewIntent


        val app = application as MobileApp
        // One-time cleanup: pre-audit builds stored duplicate recents rows per URI form.
        lifecycleScope.launch { app.library.dedupe() }
        setContent {
            val pref by app.library.themePref.collectAsState(ThemePref.SYSTEM)
            val systemDark = isSystemInDarkTheme()
            val dark = when (pref) {
                ThemePref.LIGHT -> false
                ThemePref.DARK -> true
                ThemePref.SYSTEM -> systemDark
            }
            val scope = rememberCoroutineScope()

            DisposableEffect(dark) {
                val controller = WindowCompat.getInsetsController(window, window.decorView)
                controller.isAppearanceLightStatusBars = !dark
                onDispose { }
            }

            val scheme = if (dark) com.localdesk.mobile.brand.darkScheme() else com.localdesk.mobile.brand.lightScheme()

            androidx.compose.runtime.CompositionLocalProvider(
                com.localdesk.mobile.brand.LocalIsDark provides dark,
            ) {
                MaterialTheme(
                    colorScheme = scheme,
                    typography = AppTypography,
                    shapes = AppShapes,
                ) {
                RootNav(
                    dark = dark,
                    themePref = pref,
                    pending = pendingView.value,
                    onPendingConsumed = { pendingView.value = null },
                    onThemeChange = { pref -> scope.launch { app.library.setTheme(pref) } },
                )
            }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        capture(intent)
    }

    private fun capture(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW && intent.data != null) {
            pendingView.value = intent.dataString
        }
    }
}