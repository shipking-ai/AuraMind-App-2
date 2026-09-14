package com.auramind.app.wear

import android.content.Context
import androidx.wear.tiles.ActionBuilders
import androidx.wear.tiles.DimensionBuilders
import androidx.wear.tiles.LayoutElementBuilders
import androidx.wear.tiles.ModifiersBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import androidx.wear.tiles.TimelineBuilders
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Wear Tile: due-count + streak + today's progress glance. Tap launches review.
 *
 * Freshness comes from pushes, not polling: every phone sync calls
 * requestUpdate(), so the glance is current minutes after studying, not at
 * whatever hour the system's own schedule lands on. The freshness interval
 * below is only the backstop for a watch that missed its pushes.
 */
class AuraMindTileService : TileService() {

    companion object {
        /** Nudge the tile to re-render now (call after a payload arrives). */
        fun requestUpdate(context: Context) {
            try {
                TileService.getUpdater(context).requestUpdate(AuraMindTileService::class.java)
            } catch (t: Throwable) {
                // Best effort: a missed glance refresh is never worth a crash.
            }
        }
    }

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest,
    ): ListenableFuture<TileBuilders.Tile> {
        val payload = WearState.payload.value
        val due = payload?.dueCount ?: 0
        val streak = payload?.streak ?: 0
        val reviewed = payload?.reviewedToday ?: 0

        val clickable = ModifiersBuilders.Clickable.Builder()
            .setId("open_review")
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder()
                            .setPackageName(packageName)
                            .setClassName("$packageName.MainActivity")
                            .build(),
                    )
                    .build(),
            )
            .build()

        // Column lays the glance out top to bottom (a Box would stack the
        // three texts in Z, overlapping them). Column has no vertical
        // alignment of its own, so it is wrapped in a centering Box.
        val column = LayoutElementBuilders.Column.Builder()
            .setWidth(DimensionBuilders.wrap())
            .setHeight(DimensionBuilders.wrap())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(
                LayoutElementBuilders.Text.Builder()
                    .setText(if (due == 0) "Done!" else "$due due")
                    .setFontStyle(
                        LayoutElementBuilders.FontStyle.Builder()
                            .setSize(DimensionBuilders.sp(30f))
                            .setWeight(LayoutElementBuilders.FONT_WEIGHT_BOLD)
                            .build(),
                    )
                    .build(),
            )
            .addContent(
                LayoutElementBuilders.Text.Builder()
                    .setText(
                        when {
                            streak <= 0 -> "Start a streak today"
                            streak == 1 -> "1-day streak"
                            else -> "$streak-day streak"
                        },
                    )
                    .setFontStyle(
                        LayoutElementBuilders.FontStyle.Builder()
                            .setSize(DimensionBuilders.sp(14f))
                            .build(),
                    )
                    .build(),
            )
            .addContent(
                LayoutElementBuilders.Text.Builder()
                    .setText(
                        if (reviewed <= 0) "No reviews yet today"
                        else "$reviewed reviewed today",
                    )
                    .setFontStyle(
                        LayoutElementBuilders.FontStyle.Builder()
                            .setSize(DimensionBuilders.sp(12f))
                            .build(),
                    )
                    .build(),
            )
            .build()

        val root = LayoutElementBuilders.Box.Builder()
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(clickable).build())
            .setWidth(DimensionBuilders.expand())
            .setHeight(DimensionBuilders.expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(column)
            .build()

        val layout = LayoutElementBuilders.Layout.Builder().setRoot(root).build()

        val timeline = TimelineBuilders.Timeline.Builder()
            .addTimelineEntry(
                TimelineBuilders.TimelineEntry.Builder()
                    .setLayout(layout)
                    .build(),
            )
            .build()

        return Futures.immediateFuture(
            TileBuilders.Tile.Builder()
                .setResourcesVersion("1")
                .setTimeline(timeline)
                .setFreshnessIntervalMillis(30 * 60 * 1000L)
                .build(),
        )
    }
}
