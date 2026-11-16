package com.localdesk.mobile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import android.net.Uri
import com.localdesk.mobile.lib.LibraryScreen
import com.localdesk.mobile.read.ReaderScreen
import com.localdesk.mobile.ui.IntroSplash

private const val SPLASH = "splash"
private const val HOME = "home"
private const val READER = "read/{uri}"

/**
 * splash → home ↔ read/{uri}; intro never re-runs (popUpTo inclusive). A pending
 * ACTION_VIEW on cold start waits for the choreography, then opens straight into the
 * reader; warm-start intents navigate immediately.
 */
@Composable
fun RootNav(
    dark: Boolean,
    themePref: com.localdesk.mobile.core.ThemePref,
    pending: String?,
    onPendingConsumed: () -> Unit,
    onThemeChange: (com.localdesk.mobile.core.ThemePref) -> Unit,
) {
    val nav = rememberNavController()

    LaunchedEffect(pending) {
        val target = pending ?: return@LaunchedEffect
        // The NavHost sets its start destination asynchronously — wait for it, or the
        // intent is silently dropped when the intro is skipped (start = HOME).
        var tries = 0
        while (nav.currentDestination == null && tries < 20) { kotlinx.coroutines.delay(100); tries++ }
        val current = nav.currentDestination?.route
        if (current == SPLASH) {
            // IntroSplash.exit() consumes the pending uri after the choreography.
        } else {
            // A different document must always open — launchSingleTop compares the
            // read/{uri} DESTINATION (identical for every uri) and would no-op.
            val openUri = nav.currentBackStackEntry?.arguments?.getString("uri")
            if (openUri != target) {
                nav.navigate("read/" + Uri.encode(target)) {
                    popUpTo(HOME) { saveState = true }
                }
            }
            onPendingConsumed()
        }
    }

    NavHost(navController = nav, startDestination = SPLASH) {
        composable(SPLASH) {
            IntroSplash(
                onExit = {
                    val target = pending
                    if (!target.isNullOrBlank()) {
                        onPendingConsumed()
                        nav.navigate("read/" + Uri.encode(target)) {
                            popUpTo(SPLASH) { inclusive = true }
                        }
                    } else {
                        nav.navigate(HOME) { popUpTo(SPLASH) { inclusive = true } }
                    }
                },
            )
        }
        composable(HOME) {
            LibraryScreen(
                dark = dark,
                themePref = themePref,
                onThemeChange = onThemeChange,
                onOpen = { uriString ->
                    val openUri = nav.currentBackStackEntry?.arguments?.getString("uri")
                    if (openUri != uriString) {
                        nav.navigate("read/" + Uri.encode(uriString)) {
                            popUpTo(HOME) { saveState = true }
                        }
                    }
                },
            )
        }
        composable(READER) { entry ->
            ReaderScreen(
                // NavController already decoded the path arg once — decoding again would
                // break exact-match against recents records for encoded pick URIs.
                uriString = entry.arguments?.getString("uri").orEmpty(),
                isDark = dark,
                onBack = { nav.popBackStack() },
            )
        }
    }
}
