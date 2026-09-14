package com.auramind.app.wear

import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText

/**
 * Wear-native review flow (glance-first, not a scaled-down phone screen):
 * home hero (due count + streak + queue health) → card front → reveal back
 * → grade (+ undo while the grade is still on the watch).
 *
 * Only the flashcard semantics are identical to the phone app. Everything
 * else is watch-shaped: one column of large touch targets, progress in the
 * header, haptic confirmation on every action, and honest sync state instead
 * of a spinner that pretends the phone is reachable.
 */

/** Short haptic tick. Wrapped: a buzz must never crash a review. */
private fun buzz(context: Context, millis: Long = 25L) {
    try {
        val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        vibrator?.vibrate(VibrationEffect.createOneShot(millis, VibrationEffect.DEFAULT_AMPLITUDE))
    } catch (t: Throwable) {
        // Haptics are garnish.
    }
}

private fun syncAgeText(syncedAt: Long): String {
    if (syncedAt <= 0L) return "Not synced yet"
    val mins = (System.currentTimeMillis() - syncedAt) / 60_000L
    return when {
        mins < 1L -> "Synced just now"
        mins < 60L -> "Synced ${mins}m ago"
        else -> "Synced ${mins / 60}h ago"
    }
}

@Composable
fun ReviewApp() {
    val payload by WearState.payload.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        WearState.refreshQueue(context)
    }

    val p = payload
    if (p == null) {
        IdleScreen(
            onLoadSample = if (DebugSample.isDebuggable(context)) {
                { WearState.payload.value = DebugSample.buildSamplePayload() }
            } else null,
        )
        return
    }
    if (p.cards.isEmpty()) {
        AllCaughtUp(streak = p.streak, onUndo = null, undoFailed = false)
        return
    }

    // Review state is tracked by cardId, NOT keyed on the payload object: the
    // phone pushes a refreshed payload after every grade, so keying state on
    // the payload would bounce the user back to Home mid-review.
    var started by remember { mutableStateOf(false) }
    var currentCardId by remember { mutableStateOf<String?>(null) }
    var showBack by remember { mutableStateOf(false) }
    var finished by remember { mutableStateOf(false) }
    // The last grade, kept for undo until it flushes to the phone.
    var lastGraded by remember { mutableStateOf<Pair<WearCard, GradeResult>?>(null) }
    var undoFailed by remember { mutableStateOf(false) }

    // Reconcile with payload refreshes: keep the current card when it still
    // exists; advance to the first available card when it was just graded and
    // removed; start fresh when a new payload arrives after completion.
    LaunchedEffect(p) {
        if (finished) {
            if (p.cards.isNotEmpty()) {
                finished = false
                started = false
                currentCardId = null
            }
        } else {
            val stillThere = p.cards.any { it.cardId == currentCardId }
            if (!stillThere) {
                currentCardId = p.cards.firstOrNull()?.cardId
                showBack = false
            }
        }
    }

    if (!started) {
        HomeScreen(
            dueCount = p.dueCount,
            streak = p.streak,
            onStart = {
                buzz(context)
                started = true
                if (currentCardId == null) currentCardId = p.cards.firstOrNull()?.cardId
            },
        )
        return
    }

    val card = p.cards.firstOrNull { it.cardId == currentCardId }
    if (finished || card == null) {
        AllCaughtUp(
            streak = p.streak,
            onUndo = lastGraded?.let { (gradedCard, graded) ->
                {
                    if (undoGrade(context, gradedCard, graded)) {
                        currentCardId = gradedCard.cardId
                        showBack = false
                        finished = false
                        started = true
                        lastGraded = null
                        undoFailed = false
                    } else {
                        lastGraded = null
                        undoFailed = true
                    }
                }
            },
            undoFailed = undoFailed,
        )
        return
    }

    val index = p.cards.indexOfFirst { it.cardId == currentCardId }.coerceAtLeast(0)

    val grade = { rating: Int ->
        val g = GradeResult(p.sessionId, card.cardId, rating, System.currentTimeMillis())
        GradeQueue.enqueue(context, g)
        WearState.refreshQueue(context)
        Thread {
            GradeQueue.flush(context)
            WearState.refreshQueue(context)
        }.start()
        buzz(context, 35L)
        lastGraded = card to g
        undoFailed = false
        val next = p.cards.getOrNull(index + 1)
        if (next != null) {
            currentCardId = next.cardId
            showBack = false
        } else {
            finished = true
        }
    }

    val undo = lastGraded?.let { (gradedCard, graded) ->
        {
            if (undoGrade(context, gradedCard, graded)) {
                currentCardId = gradedCard.cardId
                showBack = false
                lastGraded = null
                undoFailed = false
            } else {
                lastGraded = null
                undoFailed = true
            }
        }
    }

    ReviewScreen(
        card = card,
        index = index,
        total = p.cards.size,
        showBack = showBack,
        onReveal = {
            buzz(context)
            showBack = !showBack
        },
        onGrade = grade,
        onUndo = undo,
        undoFailed = undoFailed,
    )
}

/** Retracts a grade that has not flushed yet. True = the card is back. */
private fun undoGrade(context: Context, card: WearCard, grade: GradeResult): Boolean {
    val removed = GradeQueue.removeLastMatching(context, grade.cardId)
    buzz(context, 15L)
    WearState.refreshQueue(context)
    return removed && card.cardId.isNotEmpty()
}

@Composable
private fun ReviewScreen(
    card: WearCard,
    index: Int,
    total: Int,
    showBack: Boolean,
    onReveal: () -> Unit,
    onGrade: (Int) -> Unit,
    onUndo: (() -> Unit)?,
    undoFailed: Boolean,
) {
    val pending by WearState.pendingGrades.collectAsState()
    val listState = rememberScalingLazyListState()

    Scaffold(
        timeText = { TimeText() },
        positionIndicator = { PositionIndicator(scalingLazyListState = listState) },
    ) {
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colors.background),
            state = listState,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(
                        progress = reviewProgress(index, total),
                        modifier = Modifier
                            .size(22.dp)
                            .padding(end = 6.dp),
                        strokeWidth = 3.dp,
                    )
                    Text(
                        text = "Card ${index + 1} of $total",
                        fontSize = 12.sp,
                        color = MaterialTheme.colors.onSurfaceVariant,
                    )
                }
            }
            item {
                Text(
                    text = if (showBack) card.back else card.front,
                    color = MaterialTheme.colors.onBackground,
                    fontSize = 18.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
                )
            }
            item {
                Chip(
                    onClick = onReveal,
                    label = { Text(if (showBack) "Back to question" else "Reveal answer") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp),
                )
            }
            if (showBack) {
                item {
                    Chip(
                        onClick = { onGrade(0) },
                        label = { Text("Again") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp),
                    )
                }
                item {
                    Chip(
                        onClick = { onGrade(1) },
                        label = { Text("Hard") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp),
                    )
                }
                item {
                    Chip(
                        onClick = { onGrade(2) },
                        label = { Text("Good") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp),
                    )
                }
                item {
                    Chip(
                        onClick = { onGrade(3) },
                        label = { Text("Easy") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp),
                    )
                }
            }
            if (onUndo != null) {
                item {
                    CompactChip(
                        onClick = onUndo,
                        label = { Text("Undo last grade", fontSize = 12.sp) },
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                }
            }
            if (undoFailed) {
                item {
                    Text(
                        text = "Already synced to phone — can't undo",
                        fontSize = 11.sp,
                        color = MaterialTheme.colors.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
            }
            if (pending > 0) {
                item {
                    Text(
                        text = if (pending == 1) "1 grade waiting for phone"
                        else "$pending grades waiting for phone",
                        fontSize = 11.sp,
                        color = MaterialTheme.colors.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(dueCount: Int, streak: Int, onStart: () -> Unit) {
    val pending by WearState.pendingGrades.collectAsState()
    val overflowed by WearState.queueOverflowed.collectAsState()
    val lastSyncAt by WearState.lastSyncAt.collectAsState()

    Scaffold(
        timeText = { TimeText() },
    ) {
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colors.background),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                Text(
                    text = dueCount.toString(),
                    color = MaterialTheme.colors.primary,
                    fontSize = 44.sp,
                    modifier = Modifier.padding(top = 16.dp),
                )
            }
            item {
                Text(
                    text = if (dueCount == 1) "card due today" else "cards due today",
                    fontSize = 14.sp,
                    color = MaterialTheme.colors.onBackground,
                    textAlign = TextAlign.Center,
                )
            }
            item {
                Text(
                    text = "$streak-day streak",
                    fontSize = 13.sp,
                    color = MaterialTheme.colors.onBackground,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            item {
                Text(
                    text = syncAgeText(lastSyncAt),
                    fontSize = 11.sp,
                    color = MaterialTheme.colors.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            if (pending > 0) {
                item {
                    Text(
                        text = if (pending == 1) "1 grade waiting for phone"
                        else "$pending grades waiting for phone",
                        fontSize = 11.sp,
                        color = MaterialTheme.colors.secondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
            if (overflowed) {
                item {
                    Text(
                        text = "Watch storage filled up — oldest grades may be missing. Open the phone app to sync.",
                        fontSize = 11.sp,
                        color = MaterialTheme.colors.error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 2.dp, start = 8.dp, end = 8.dp),
                    )
                }
            }
            item {
                Button(
                    onClick = onStart,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp, start = 8.dp, end = 8.dp, bottom = 12.dp),
                ) {
                    Text("Start review")
                }
            }
        }
    }
}

@Composable
private fun AllCaughtUp(streak: Int, onUndo: (() -> Unit)?, undoFailed: Boolean) {
    val pending by WearState.pendingGrades.collectAsState()

    Scaffold(
        timeText = { TimeText() },
    ) {
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colors.background),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item { Text("✨", fontSize = 32.sp, modifier = Modifier.padding(top = 16.dp)) }
            item {
                Text(
                    text = "All caught up",
                    fontSize = 20.sp,
                    color = MaterialTheme.colors.onBackground,
                    textAlign = TextAlign.Center,
                )
            }
            item {
                Text(
                    text = "$streak-day streak",
                    fontSize = 13.sp,
                    color = MaterialTheme.colors.onBackground,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            if (pending > 0) {
                item {
                    Text(
                        text = if (pending == 1) "1 grade waiting for phone"
                        else "$pending grades waiting for phone",
                        fontSize = 11.sp,
                        color = MaterialTheme.colors.secondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            if (onUndo != null) {
                item {
                    CompactChip(
                        onClick = onUndo,
                        label = { Text("Undo last grade", fontSize = 12.sp) },
                        modifier = Modifier.padding(top = 8.dp, bottom = 12.dp),
                    )
                }
            }
            if (undoFailed) {
                item {
                    Text(
                        text = "Already synced to phone — can't undo",
                        fontSize = 11.sp,
                        color = MaterialTheme.colors.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun IdleScreen(onLoadSample: (() -> Unit)? = null) {
    Scaffold(
        timeText = { TimeText() },
    ) {
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colors.background),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                Text(
                    text = "Open AuraMind on your phone to sync your cards",
                    fontSize = 14.sp,
                    color = MaterialTheme.colors.onBackground,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 24.dp, start = 8.dp, end = 8.dp),
                )
            }
            if (onLoadSample != null) {
                item {
                    Button(
                        onClick = onLoadSample,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp, start = 8.dp, end = 8.dp, bottom = 12.dp),
                    ) {
                        Text("Dev: Load sample deck", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
