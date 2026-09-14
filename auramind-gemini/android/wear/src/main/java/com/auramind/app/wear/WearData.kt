package com.auramind.app.wear

import com.google.android.gms.wearable.DataMap

const val SYNC_PATH = "/auramind/sync"
const val GRADE_PATH = "/auramind/grade"
const val PAYLOAD_VERSION = 1

data class WearCard(
    val cardId: String,
    val deckId: String,
    val front: String,
    val back: String,
)

data class ReviewPayload(
    val version: Int,
    val sessionId: String,
    val dueCount: Int,
    val reviewedToday: Int,
    val streak: Int,
    val cards: List<WearCard>,
)

data class GradeResult(
    val sessionId: String,
    val cardId: String,
    val rating: Int,
    val timestamp: Long,
)

fun ReviewPayload.toDataMap(): DataMap = DataMap().apply {
    putInt("version", version)
    putString("sessionId", sessionId)
    putInt("dueCount", dueCount)
    putInt("reviewedToday", reviewedToday)
    putInt("streak", streak)
    val list = ArrayList<DataMap>()
    cards.forEach { c ->
        list.add(
            DataMap().apply {
                putString("cardId", c.cardId)
                putString("deckId", c.deckId)
                putString("front", c.front)
                putString("back", c.back)
            },
        )
    }
    putDataMapArrayList("cards", list)
}

/**
 * Fraction of the session completed BEFORE the card at [index] is graded:
 * card 0 of 8 shows 0, card 7 of 8 shows 7/8. The bar fills to full only on
 * the AllCaughtUp screen, which is the one moment "done" is true.
 */
fun reviewProgress(index: Int, total: Int): Float {
    if (total <= 0 || index < 0) return 0f
    return (index.coerceAtMost(total).toFloat() / total).coerceIn(0f, 1f)
}

fun DataMap.toReviewPayload(): ReviewPayload? {
    if (getInt("version", -1) != PAYLOAD_VERSION) return null
    val rawCards = getDataMapArrayList("cards") ?: emptyList()
    val cards = rawCards.map {
        WearCard(
            cardId = it.getString("cardId", ""),
            deckId = it.getString("deckId", ""),
            front = it.getString("front", ""),
            back = it.getString("back", ""),
        )
    }
    return ReviewPayload(
        version = getInt("version"),
        sessionId = getString("sessionId", ""),
        dueCount = getInt("dueCount"),
        reviewedToday = getInt("reviewedToday"),
        streak = getInt("streak"),
        cards = cards,
    )
}