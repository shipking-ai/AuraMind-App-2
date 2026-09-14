package com.auramind.app.wear

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

/**
 * Watch-face complication: today's due count (SHORT_TEXT) and review
 * progress (RANGED_VALUE), refreshed from the last payload the phone pushed.
 *
 * Tapping either type opens the review flow directly — a complication that
 * only informs but cannot act is a missed tap target on every watch face.
 */
class DueCountComplicationService : SuspendingComplicationDataSourceService() {

    private fun launchReview(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    override suspend fun onComplicationRequest(
        request: ComplicationRequest,
    ): ComplicationData? {
        val payload = WearState.payload.value
        val due = payload?.dueCount ?: 0
        val tapAction = try {
            launchReview()
        } catch (t: Throwable) {
            null
        }

        if (request.complicationType == ComplicationType.RANGED_VALUE) {
            val reviewed = payload?.reviewedToday ?: 0
            val total = (due + reviewed).coerceAtLeast(1)
            val builder = RangedValueComplicationData.Builder(
                value = reviewed.coerceAtMost(total).toFloat(),
                min = 0f,
                max = total.toFloat(),
                contentDescription = PlainComplicationText.Builder(
                    "$reviewed of $total reviewed",
                ).build(),
            ).setText(
                PlainComplicationText.Builder(if (due == 0) "Done!" else "$due due").build(),
            )
            if (tapAction != null) builder.setTapAction(tapAction)
            return builder.build()
        }

        val builder = ShortTextComplicationData.Builder(
            PlainComplicationText.Builder(if (due == 0) "Done!" else "$due due").build(),
            PlainComplicationText.Builder("AuraMind").build(),
        )
        if (tapAction != null) builder.setTapAction(tapAction)
        return builder.build()
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        when (type) {
            ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
                value = 2f,
                min = 0f,
                max = 5f,
                contentDescription = PlainComplicationText.Builder("2 of 5 reviewed").build(),
            ).setText(
                PlainComplicationText.Builder("3 due").build(),
            ).build()
            else -> ShortTextComplicationData.Builder(
                PlainComplicationText.Builder("3 due").build(),
                PlainComplicationText.Builder("AuraMind").build(),
            ).build()
        }
}
