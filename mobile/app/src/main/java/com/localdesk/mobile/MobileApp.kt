package com.localdesk.mobile

import android.app.Application
import com.localdesk.mobile.core.Library

/** Process-wide singletons. */
class MobileApp : Application() {
    val library: Library by lazy { Library(this) }
}
