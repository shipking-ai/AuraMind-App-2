package com.auramind.app.wear

import org.junit.Assert.assertTrue
import org.junit.Test

/** The registered pre-rename tile class must run the BonaMind tile code. */
class StandInTest {
    @Test
    fun `tile stand-in extends the real service`() {
        assertTrue(BonaMindTileService::class.java.isAssignableFrom(AuraMindTileService::class.java)) // legacy-name: ok
    }
}
