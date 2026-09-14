package com.auramind.app.wear

import com.google.android.gms.wearable.DataMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WearDataTest {

    @Test
    fun `round-trips a payload through DataMap`() {
        val payload = ReviewPayload(
            version = 1,
            sessionId = "s1",
            dueCount = 3,
            reviewedToday = 1,
            streak = 7,
            cards = listOf(WearCard("c1", "d1", "front", "back")),
        )
        val back = payload.toDataMap().toReviewPayload()
        assertEquals(payload, back)
    }

    @Test
    fun `round-trips an empty card list`() {
        val payload = ReviewPayload(1, "s2", 0, 0, 0, emptyList())
        assertEquals(payload, payload.toDataMap().toReviewPayload())
    }

    @Test
    fun `reviewProgress fills as cards are graded`() {
        assertEquals(0f, reviewProgress(0, 8))
        assertEquals(0.5f, reviewProgress(4, 8))
        assertEquals(0.875f, reviewProgress(7, 8))
    }

    @Test
    fun `reviewProgress is defensive about bad input`() {
        assertEquals(0f, reviewProgress(0, 0))
        assertEquals(0f, reviewProgress(-1, 8))
        assertEquals(1f, reviewProgress(12, 8))
    }

    @Test
    fun `rejects an unknown payload version`() {
        val dm = DataMap().apply {
            putInt("version", 999)
            putString("sessionId", "s")
        }
        assertNull(dm.toReviewPayload())
    }
}